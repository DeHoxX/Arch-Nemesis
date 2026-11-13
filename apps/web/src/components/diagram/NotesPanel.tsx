import React from "react";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export interface NotesPanelProps {
  warnings?: string[];
  unverifiableRequirements?: string[];
  className?: string;
}

/**
 * NotesPanel: displays lint warnings and unverifiable requirements.
 *
 * Requirements (BUILD_PLAN.md:434 & User Decisions):
 * - Lint warnings under "Notes".
 * - Unverifiable requirements under "Not verified by checks".
 * - Each section hidden when empty.
 * - Renders nothing if both are empty.
 * - All text rendered as plain React text (no dangerouslySetInnerHTML).
 */
export function NotesPanel({
  warnings,
  unverifiableRequirements,
  className,
}: NotesPanelProps): React.ReactElement | null {
  const hasWarnings = Boolean(warnings && warnings.length > 0);
  const hasUnverifiable = Boolean(
    unverifiableRequirements && unverifiableRequirements.length > 0,
  );

  if (!hasWarnings && !hasUnverifiable) {
    return null;
  }

  return (
    <div
      aria-label="Notes and Warnings"
      className={cn(
        "rounded-xl border border-white/[0.09] bg-[#151517] p-4 text-card-foreground shadow-sm space-y-4",
        className,
      )}
    >
      {hasWarnings && (
        <section aria-label="Notes">
          <h3 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            Notes
          </h3>
          <ul className="mt-2 list-disc list-inside space-y-1 text-sm text-foreground">
            {warnings?.map((w, idx) => (
              <li key={`warning-${idx}`} className="break-words">
                {w}
              </li>
            ))}
          </ul>
        </section>
      )}

      {hasWarnings && hasUnverifiable && <Separator />}

      {hasUnverifiable && (
        <section aria-label="Not verified by checks">
          <h3 className="font-mono text-xs uppercase tracking-wider text-amber-500">
            Not verified by checks
          </h3>
          <ul className="mt-2 list-disc list-inside space-y-1 text-sm text-muted-foreground">
            {unverifiableRequirements?.map((req, idx) => (
              <li key={`unverifiable-${idx}`} className="break-words">
                {req}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

