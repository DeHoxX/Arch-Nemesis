import React from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { RequirementBrief } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface BriefCardProps {
  brief: RequirementBrief;
  onGenerate: () => void;
  isGenerating?: boolean;
  className?: string;
}

/**
 * BriefCard: displays the synthesized requirement brief before architecture generation.
 *
 * Requirements (BUILD_PLAN.md:446 & Stage 4C1):
 * - Real fields only: summary, users, data_involved, stated_constraints (text),
 *   assumptions, numbers_given (label, value, unit), unverifiable_requirements
 *   under label "Not verified by checks".
 * - Hide empty sections.
 * - Button "Generate design".
 * - All text rendered as plain React text (no dangerouslySetInnerHTML).
 */
export function BriefCard({
  brief,
  onGenerate,
  isGenerating = false,
  className,
}: BriefCardProps): React.ReactElement {
  const hasData = brief.data_involved && brief.data_involved.length > 0;
  const hasConstraints =
    brief.stated_constraints && brief.stated_constraints.length > 0;
  const hasAssumptions = brief.assumptions && brief.assumptions.length > 0;
  const hasNumbers = brief.numbers_given && brief.numbers_given.length > 0;
  const hasUnverifiable =
    brief.unverifiable_requirements &&
    brief.unverifiable_requirements.length > 0;

  return (
    <Card
      aria-label="Requirement Brief"
      className={cn(
        "rounded-xl border border-border bg-card shadow-xs",
        className,
      )}
    >
      <CardHeader>
        <CardTitle className="font-heading text-xl font-bold tracking-tight text-foreground">
          Requirement Brief
        </CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          Review the synthesized requirements before generating the architecture design.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 text-sm">
        {/* Summary */}
        <div>
          <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            Summary
          </h4>
          <p className="mt-1 text-foreground leading-relaxed break-words">
            {brief.summary}
          </p>
        </div>

        {/* Users */}
        <div>
          <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            Users
          </h4>
          <p className="mt-1 text-foreground leading-relaxed break-words">
            {brief.users}
          </p>
        </div>

        {/* Data involved (hidden when empty) */}
        {hasData && (
          <div>
            <Separator className="my-3" />
            <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Data Involved
            </h4>
            <ul className="mt-1 list-disc list-inside space-y-0.5 text-foreground">
              {brief.data_involved.map((d, idx) => (
                <li key={`data-${idx}`} className="break-words">
                  {d}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Stated Constraints (hidden when empty) */}
        {hasConstraints && (
          <div>
            <Separator className="my-3" />
            <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Stated Constraints
            </h4>
            <ul className="mt-1 list-disc list-inside space-y-1 text-foreground">
              {brief.stated_constraints.map((c) => (
                <li key={c.id} className="break-words">
                  {c.text}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Assumptions (hidden when empty) */}
        {hasAssumptions && (
          <div>
            <Separator className="my-3" />
            <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Assumptions
            </h4>
            <ul className="mt-1 space-y-1.5 text-foreground">
              {brief.assumptions.map((a, idx) => (
                <li key={`assumption-${idx}`} className="flex items-start gap-2 break-words">
                  <span className="inline-flex shrink-0 items-center rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    Assumed
                  </span>
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Numbers Given (hidden when empty) */}
        {hasNumbers && (
          <div>
            <Separator className="my-3" />
            <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Numbers Given
            </h4>
            <ul className="mt-1 list-disc list-inside space-y-0.5 text-foreground">
              {brief.numbers_given.map((n, idx) => (
                <li key={`num-${idx}`} className="break-words">
                  <span className="font-medium text-foreground">{n.label}: </span>
                  <span className="font-mono text-xs">
                    {n.value} {n.unit}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Unverifiable Requirements (hidden when empty) */}
        {hasUnverifiable && (
          <div>
            <Separator className="my-3" />
            <h4 className="font-mono text-xs uppercase tracking-wider text-amber-500">
              Not verified by checks
            </h4>
            <ul className="mt-1 list-disc list-inside space-y-1 text-muted-foreground">
              {brief.unverifiable_requirements.map((req, idx) => (
                <li key={`unverifiable-${idx}`} className="break-words">
                  {req}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-2">
        <Button
          type="button"
          onClick={onGenerate}
          disabled={isGenerating}
          className="w-full bg-brand-accent text-brand-accent-ink hover:bg-brand-accent-hover font-semibold text-sm transition-colors py-2.5"
        >
          Generate design
        </Button>
      </CardFooter>
    </Card>
  );
}

