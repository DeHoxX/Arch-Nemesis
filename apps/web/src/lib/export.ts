import { getViewportForBounds } from "@xyflow/react";
import { toPng } from "html-to-image";
import type { Explanation } from "./types";

export const COMPLIANCE_BANNER_TEXT =
  "Structurally checked, not guaranteed to be the best design. This is not a compliance claim.";

export const PNG_EXPORT_ERROR_MESSAGE =
  "Failed to export diagram image. Please try again.";

export interface BuildMarkdownInput {
  designId: string;
  versionNo: number;
  explanation: Explanation | null;
}

/**
 * Pure function building GitHub-flavored Markdown from the explanation JSON.
 *
 * Rules (BUILD_PLAN.md:509 & Stage 6C2):
 * - Starts with Design ID, version, and the exact compliance banner sentence
 * - Exact 5 section headings in order:
 *   1. Overview
 *   2. How a request flows
 *   3. Each part
 *   4. Why the checks exist
 *   5. Where AI models are used
 * - Null explanation (Option A): writes header, banner, and under Overview:
 *   "No explanation has been generated for this design yet. Open the Explanation tab to generate a plain-language walkthrough."
 * - Plain text string formatting only (no HTML execution, hostile strings remain literal)
 */
export function buildExplanationMarkdown(input: BuildMarkdownInput): string {
  const { designId, versionNo, explanation } = input;

  const lines: string[] = [
    `# Design ${designId} (Version ${versionNo})`,
    "",
    `> ${COMPLIANCE_BANNER_TEXT}`,
    "",
    "## Overview",
  ];

  if (!explanation) {
    lines.push(
      "No explanation has been generated for this design yet. Open the Explanation tab to generate a plain-language walkthrough.",
      ""
    );
    return lines.join("\n");
  }

  lines.push(explanation.overview || "No overview provided.", "");

  lines.push("## How a request flows");
  if (explanation.flow && explanation.flow.length > 0) {
    explanation.flow.forEach((step) => {
      lines.push(`${step.step}. **${step.node_name}**: ${step.text}`);
    });
  } else {
    lines.push("No flow steps provided.");
  }
  lines.push("");

  lines.push("## Each part");
  if (explanation.parts && explanation.parts.length > 0) {
    explanation.parts.forEach((part) => {
      lines.push(`- **${part.node_name}**: ${part.text}`);
    });
  } else {
    lines.push("No parts described.");
  }
  lines.push("");

  lines.push("## Why the checks exist");
  if (explanation.checks && explanation.checks.length > 0) {
    explanation.checks.forEach((check) => {
      lines.push(`- **${check.constraint_id}**: ${check.text}`);
    });
  } else {
    lines.push("No checks described.");
  }
  lines.push("");

  lines.push("## Where AI models are used");
  lines.push(explanation.models?.text || "No part is marked as using an AI model.", "");

  return lines.join("\n");
}

/**
 * Convert a base64 data URL into a binary Blob.
 *
 * Prevents packaging data URL ASCII text into download blobs.
 * Guaranteed to produce true binary bytes matching the encoded payload.
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) {
    throw new Error("Invalid data URL format: missing comma");
  }
  const header = dataUrl.slice(0, commaIndex);
  const base64Data = dataUrl.slice(commaIndex + 1);
  const mimeMatch = header.match(/^data:([^;]+);/);
  const mimeType = mimeMatch ? mimeMatch[1] : "image/png";

  const binaryString =
    typeof window !== "undefined" && typeof window.atob === "function"
      ? window.atob(base64Data)
      : Buffer.from(base64Data, "base64").toString("binary");

  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

/**
 * Trigger client-side file download using in-browser Blob and temporary anchor.
 * Zero network requests; zero persistent storage.
 */
export function downloadFile(
  content: string | Blob,
  filename: string,
  mimeType = "text/plain;charset=utf-8"
): void {
  if (typeof window === "undefined") return;

  let blob: Blob;
  if (content instanceof Blob) {
    blob = content;
  } else if (typeof content === "string" && content.startsWith("data:")) {
    // If a caller passes a data URL string, convert it to a binary Blob
    blob = dataUrlToBlob(content);
  } else {
    blob = new Blob([content], { type: mimeType });
  }

  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(objectUrl);
}

/**
 * Capture React Flow canvas viewport as a PNG and trigger client-side download.
 *
 * Rules (BUILD_PLAN.md:509 & User Decisions):
 * - Target React Flow viewport element
 * - Dynamic size from bounding box plus padding
 * - Background color #0a0a0a
 * - Filename: arch-nemesis-{designId}-v{versionNo}.png
 * - Rejection / failure handling: throws error so caller can display message without crashing
 */
export async function exportDiagramToPng(
  viewportElement: HTMLElement,
  designId: string,
  versionNo: number
): Promise<void> {
  const flowViewport =
    (viewportElement.querySelector(".react-flow__viewport") as HTMLElement | null) ||
    viewportElement;

  if (!flowViewport) {
    throw new Error("React Flow viewport element not found");
  }

  // Extract all nodes from DOM to compute total bounds
  const nodeElements = Array.from(
    flowViewport.querySelectorAll(".react-flow__node")
  ) as HTMLElement[];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  if (nodeElements.length > 0) {
    nodeElements.forEach((el) => {
      const transformMatch = el.style.transform.match(
        /translate(?:3d)?\(\s*(-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px/
      );
      if (transformMatch && transformMatch[1] && transformMatch[2]) {
        const x = parseFloat(transformMatch[1]);
        const y = parseFloat(transformMatch[2]);
        const w = el.offsetWidth || 220;
        const h = el.offsetHeight || 72;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x + w > maxX) maxX = x + w;
        if (y + h > maxY) maxY = y + h;
      }
    });
  }

  // Fallback if coordinates could not be parsed from DOM transforms
  if (!isFinite(minX) || !isFinite(minY)) {
    minX = 0;
    minY = 0;
    maxX = 1024;
    maxY = 768;
  }

  const padding = 60;
  const contentWidth = Math.max(maxX - minX, 400);
  const contentHeight = Math.max(maxY - minY, 300);

  const imageWidth = Math.round(contentWidth + padding * 2);
  const imageHeight = Math.round(contentHeight + padding * 2);

  const bounds = {
    x: minX,
    y: minY,
    width: contentWidth,
    height: contentHeight,
  };

  const { x, y, zoom } = getViewportForBounds(
    bounds,
    imageWidth,
    imageHeight,
    0.5,
    2.0,
    padding / Math.max(imageWidth, imageHeight)
  );

  const dataUrl = await toPng(flowViewport, {
    backgroundColor: "#0a0a0a",
    width: imageWidth,
    height: imageHeight,
    style: {
      width: `${imageWidth}px`,
      height: `${imageHeight}px`,
      transform: `translate(${x}px, ${y}px) scale(${zoom})`,
    },
    filter: (node: HTMLElement) => {
      // Exclude interactive controls and minimaps from the rendered graphic
      return (
        !node?.classList?.contains("react-flow__controls") &&
        !node?.classList?.contains("react-flow__minimap")
      );
    },
  });

  const blob = dataUrlToBlob(dataUrl);
  const safeDesignId = (designId && designId.trim()) || "design";
  const filename = `arch-nemesis-${safeDesignId}-v${versionNo}.png`;
  downloadFile(blob, filename, "image/png");
}
