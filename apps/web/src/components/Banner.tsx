import React from "react";
import { AlertTriangle } from "lucide-react";

export const BANNER_TEXT =
  "Structurally checked, not guaranteed to be the best design. This is not a compliance claim.";

/**
 * Permanent, non-dismissible compliance banner.
 * Exact copy mandated by BUILD_PLAN.md:443:
 * "Structurally checked, not guaranteed to be the best design. This is not a compliance claim."
 */
export function Banner(): React.ReactElement {
  return (
    <div
      role="note"
      aria-label="Compliance disclaimer"
      className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-foreground"
    >
      <AlertTriangle className="size-5 shrink-0 text-amber-500" aria-hidden="true" />
      <p className="font-mono text-xs sm:text-sm text-foreground/90">
        {BANNER_TEXT}
      </p>
    </div>
  );
}

