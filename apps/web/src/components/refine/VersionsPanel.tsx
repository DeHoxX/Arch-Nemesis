"use client";

import React, { useState } from "react";
import { Check, Eye, History, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MAX_VERSIONS, type VersionSummaryItem } from "@/lib/types";

export interface VersionsPanelProps {
  versions: VersionSummaryItem[];
  currentVersion: number;
  viewingVersion?: number | null;
  maxVersions?: number;
  onViewVersion: (versionNo: number) => void;
  onRestoreVersion: (versionNo: number) => void;
  isRestoring?: boolean;
}

/**
 * Formats an ISO 8601 UTC timestamp into a human-readable local string.
 */
function formatVersionDate(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return isoDate;
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoDate;
  }
}

/**
 * VersionsPanel: Historical version timeline with read-only inspection and restore flows.
 *
 * Requirements (BUILD_PLAN.md:549):
 * - Listed newest first.
 * - Displays version number, date, change note (from describe_diff).
 * - "Current" badge on the active version.
 * - "View" button for historical inspection.
 * - "Restore" button with confirm dialog.
 * - Restore disabled for active version and when version cap (15) is reached.
 * - Plain text rendering only (Rule 5).
 */
export function VersionsPanel({
  versions,
  currentVersion,
  viewingVersion = null,
  maxVersions = MAX_VERSIONS,
  onViewVersion,
  onRestoreVersion,
  isRestoring = false,
}: VersionsPanelProps): React.ReactElement {
  const [restoreTarget, setRestoreTarget] = useState<number | null>(null);

  // Sort newest first
  const sortedVersions = [...versions].sort((a, b) => b.version_no - a.version_no);
  const isVersionsCapped = currentVersion >= maxVersions;

  const handleConfirmRestore = () => {
    if (restoreTarget !== null && !isRestoring) {
      onRestoreVersion(restoreTarget);
      setRestoreTarget(null);
    }
  };

  return (
    <>
      <Card
        className="border border-white/[0.09] bg-[#151517] shadow-md flex flex-col h-full"
        role="region"
        aria-label="Design Version History"
      >
        <CardHeader className="border-b border-white/[0.09] pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="size-4 text-brand-accent" aria-hidden="true" />
              <CardTitle className="text-sm font-semibold tracking-tight">
                Version History
              </CardTitle>
            </div>
            <span className="text-xs font-mono text-muted-foreground">
              {`${versions.length} version${versions.length !== 1 ? "s" : ""}`}
            </span>
          </div>
        </CardHeader>

        <CardContent className="p-0 overflow-y-auto max-h-[380px]">
          {sortedVersions.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground font-mono">
              No version history records found.
            </div>
          ) : (
            <ul className="divide-y divide-border/30">
              {sortedVersions.map((ver) => {
                const isCurrent = ver.version_no === currentVersion;
                const isViewing = viewingVersion === ver.version_no || (viewingVersion === null && isCurrent);

                return (
                  <li
                    key={ver.version_no}
                    className={`p-3 text-xs transition-colors ${
                      isViewing ? "bg-muted/40" : "hover:bg-muted/20"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-foreground">
                            v{ver.version_no}
                          </span>
                          {isCurrent && (
                            <Badge className="bg-brand-accent/15 text-brand-accent border-brand-accent/30 text-[10px] py-0 px-1.5 font-mono">
                              Current
                            </Badge>
                          )}
                          <span className="text-[11px] font-mono text-muted-foreground">
                            {formatVersionDate(ver.created_at)}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground font-mono truncate">
                          {ver.change_note ?? "Initial architecture design."}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => onViewVersion(ver.version_no)}
                          disabled={isViewing}
                          className="h-7 px-2 text-[11px] font-mono"
                          aria-label={`View version ${ver.version_no}`}
                        >
                          {isViewing ? (
                            <>
                              <Check className="size-3 mr-1 text-brand-accent" /> Viewing
                            </>
                          ) : (
                            <>
                              <Eye className="size-3 mr-1" /> View
                            </>
                          )}
                        </Button>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setRestoreTarget(ver.version_no)}
                          disabled={isCurrent || isVersionsCapped || isRestoring}
                          className="h-7 px-2 text-[11px] font-mono"
                          aria-label={`Restore version ${ver.version_no}`}
                        >
                          <RotateCcw className="size-3 mr-1" /> Restore
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Restore Confirmation Dialog */}
      <Dialog open={restoreTarget !== null} onOpenChange={(open) => !open && setRestoreTarget(null)}>
        <DialogContent
          className="sm:max-w-md bg-card border-border text-foreground"
          aria-describedby="restore-version-desc"
        >
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              Restore Design Version
            </DialogTitle>
            <DialogDescription id="restore-version-desc" className="text-xs text-muted-foreground pt-1">
              Restoring a historical version creates a new latest version with the exact architecture of v{restoreTarget}.
            </DialogDescription>
          </DialogHeader>

          <p className="text-xs text-foreground/90 font-mono py-2">
            {`Are you sure you want to restore v${restoreTarget}? This counts as a new version toward the maximum of ${maxVersions}.`}
          </p>

          <DialogFooter className="gap-2 sm:gap-0 pt-3 border-t border-border/40">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setRestoreTarget(null)}
              disabled={isRestoring}
              className="text-xs font-mono"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleConfirmRestore}
              disabled={isRestoring}
              className="text-xs font-mono bg-brand-accent text-brand-accent-ink hover:bg-brand-accent-hover"
            >
              {isRestoring ? "Restoring..." : `Confirm Restore v${restoreTarget}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

