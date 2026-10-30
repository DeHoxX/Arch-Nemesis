"use client";

import React, { useState } from "react";
import { Download, FileDown, Printer, RefreshCw } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  PNG_EXPORT_ERROR_MESSAGE,
  buildExplanationMarkdown,
  downloadFile,
  exportDiagramToPng,
} from "@/lib/export";
import type { Explanation } from "@/lib/types";

export interface ExportButtonsProps {
  designId: string;
  versionNo: number;
  explanation: Explanation | null;
  diagramContainerRef?: React.RefObject<HTMLDivElement | null>;
}

/**
 * Results page export controls.
 *
 * Requirements (BUILD_PLAN.md:509 & User Decisions):
 * - Exactly 3 buttons:
 *   1. "Download diagram (PNG)"
 *   2. "Download explanation (.md)"
 *   3. "Print or save as PDF"
 * - In-browser client execution: zero network calls, zero localStorage.
 * - PNG failure shows "Failed to export diagram image. Please try again." in-page without crashing.
 * - Print triggers window.print() with print stylesheet hiding buttons.
 */
export function ExportButtons({
  designId,
  versionNo,
  explanation,
  diagramContainerRef,
}: ExportButtonsProps): React.ReactElement {
  const [isExportingPng, setIsExportingPng] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleDownloadPng = async () => {
    setErrorMessage(null);
    setIsExportingPng(true);

    try {
      const container =
        diagramContainerRef?.current ||
        (document.querySelector(".react-flow") as HTMLElement | null);

      if (!container) {
        throw new Error("Diagram container not found");
      }

      await exportDiagramToPng(container, designId, versionNo);
    } catch {
      setErrorMessage(PNG_EXPORT_ERROR_MESSAGE);
    } finally {
      setIsExportingPng(false);
    }
  };

  const handleDownloadMarkdown = () => {
    setErrorMessage(null);
    try {
      const safeDesignId = (designId && designId.trim()) || "design";
      const markdown = buildExplanationMarkdown({
        designId: safeDesignId,
        versionNo,
        explanation,
      });
      const filename = `arch-nemesis-${safeDesignId}-v${versionNo}.md`;
      downloadFile(markdown, filename, "text/markdown;charset=utf-8");
    } catch {
      setErrorMessage("Failed to export explanation document. Please try again.");
    }
  };

  const handlePrint = () => {
    setErrorMessage(null);
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleDownloadPng}
          disabled={isExportingPng}
          className="text-xs font-mono gap-1.5 h-8"
        >
          {isExportingPng ? (
            <RefreshCw className="size-3.5 animate-spin" />
          ) : (
            <Download className="size-3.5" />
          )}
          Download diagram (PNG)
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleDownloadMarkdown}
          className="text-xs font-mono gap-1.5 h-8"
        >
          <FileDown className="size-3.5" />
          Download explanation (.md)
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handlePrint}
          className="text-xs font-mono gap-1.5 h-8"
        >
          <Printer className="size-3.5" />
          Print or save as PDF
        </Button>
      </div>

      {errorMessage && (
        <Alert
          variant="destructive"
          className="rounded-lg border-destructive/60 bg-destructive/10 py-2 px-3 text-xs"
        >
          <AlertDescription className="text-xs font-medium">
            {errorMessage}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

