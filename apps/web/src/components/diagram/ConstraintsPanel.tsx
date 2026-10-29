import React from "react";
import type { ConstraintSpec } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface ConstraintsPanelProps {
  constraints: ConstraintSpec[];
  className?: string;
}

/**
 * ConstraintsPanel: minimal panel listing all spec constraints in plain text.
 *
 * Requirements (BUILD_PLAN.md:434 & User Decisions):
 * - Minimal: lists all constraints' plain text.
 * - Renders nothing if constraints list is empty.
 * - All text rendered as plain React text (no dangerouslySetInnerHTML).
 */
export function ConstraintsPanel({
  constraints,
  className,
}: ConstraintsPanelProps): React.ReactElement | null {
  if (!constraints || constraints.length === 0) {
    return null;
  }

  return (
    <section
      aria-label="System Constraints"
      className={cn(
        "rounded-xl border bg-card p-4 text-card-foreground shadow-sm",
        className,
      )}
    >
      <h3 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
        Constraints
      </h3>
      <ul className="mt-2 list-disc list-inside space-y-1 text-sm text-foreground">
        {constraints.map((c) => (
          <li key={c.id} className="break-words">
            {c.text}
          </li>
        ))}
      </ul>
    </section>
  );
}

