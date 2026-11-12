"use client";

import React from "react";
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DiagramLegend } from "./DiagramLegend";
import type { FlowPlaybackStep } from "./playback";

export interface FlowPlaybackBarProps {
  steps: FlowPlaybackStep[];
  currentStepIndex: number | null; // null = idle, 0..N-1 = active
  onStart: () => void;
  onNext: () => void;
  onBack: () => void;
  onRestart: () => void;
  onClear: () => void;
  className?: string;
}

/**
 * FlowPlaybackBar: Docked footer controls for sequential flow playback (Stage 1C, D-329).
 *
 * Rules:
 * - Docked outside React Flow in the DiagramView flex column (border-t border-border bg-card).
 * - No floating, no backdrop blur, no heavy shadows.
 * - Real <button type="button"> with focus-visible rings and motion-reduce:transition-none.
 * - Honest copy: "Topological edge order (not a runtime scenario)".
 * - Plain text rendering only (no dangerouslySetInnerHTML, Rule 5).
 */
export function FlowPlaybackBar({
  steps,
  currentStepIndex,
  onStart,
  onNext,
  onBack,
  onRestart,
  onClear,
  className,
}: FlowPlaybackBarProps): React.ReactElement {
  const totalSteps = steps.length;
  const isZeroEdges = totalSteps === 0;
  const isActive = currentStepIndex !== null && currentStepIndex >= 0 && currentStepIndex < totalSteps;
  const currentStep = isActive ? steps[currentStepIndex] : null;
  const stepNumber = currentStep ? currentStep.stepNumber : 0;

  const isFirstStep = isActive && currentStepIndex === 0;
  const isLastStep = isActive && currentStepIndex === totalSteps - 1;

  const handleNextClick = () => {
    if (isZeroEdges) return;
    if (!isActive) {
      onStart();
    } else if (!isLastStep) {
      onNext();
    }
  };

  return (
    <footer
      aria-label="Flow playback controls"
      className={cn(
        "relative flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card px-3 py-2 text-xs",
        className,
      )}
    >
      {/* Left controls: Transport buttons */}
      <div className="flex items-center gap-1.5 shrink-0">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRestart}
          disabled={isZeroEdges || !isActive}
          aria-label="Restart playback"
          title="Restart playback"
          className="h-7 px-2 font-mono text-[11px] motion-reduce:transition-none"
        >
          <RotateCcw className="size-3.5" />
          <span className="hidden sm:inline">Restart</span>
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onBack}
          disabled={isZeroEdges || !isActive || isFirstStep}
          aria-label="Previous flow step"
          title="Previous flow step"
          className="h-7 px-2 font-mono text-[11px] motion-reduce:transition-none"
        >
          <ChevronLeft className="size-3.5" />
          <span>Back</span>
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleNextClick}
          disabled={isZeroEdges || isLastStep}
          aria-label={isActive ? "Next flow step" : "Start flow playback"}
          title={isActive ? "Next flow step" : "Start flow playback"}
          className="h-7 px-2 font-mono text-[11px] motion-reduce:transition-none"
        >
          <span>Next</span>
          <ChevronRight className="size-3.5" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClear}
          disabled={isZeroEdges || !isActive}
          aria-label="Exit playback"
          title="Exit playback"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground motion-reduce:transition-none"
        >
          <X className="size-3.5" />
        </Button>
      </div>

      {/* Middle: Step status & honest live description */}
      <div className="min-w-0 flex-1 flex flex-col justify-center px-1">
        {isZeroEdges ? (
          <div className="font-mono text-muted-foreground text-[11px]">
            No flows to step through
          </div>
        ) : !isActive ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono font-medium text-foreground text-[11px]">
              Ready · {totalSteps} {totalSteps === 1 ? "flow" : "flows"}
            </span>
            <span className="text-muted-foreground/70 font-mono text-[10px]">
              Click Next to step through connections
            </span>
          </div>
        ) : (
          <div className="space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono font-semibold text-foreground text-[11px]">
                Step {stepNumber} of {totalSteps}
              </span>
              <span className="text-muted-foreground/80 font-mono text-[10px]">
                Topological edge order (not a runtime scenario)
              </span>
            </div>
            {currentStep && (
              <div
                aria-live="polite"
                aria-atomic="true"
                className="font-mono text-[11px] text-foreground truncate max-w-2xl"
              >
                <span className="font-semibold text-brand-accent">
                  {currentStep.fromName}
                </span>{" "}
                <span className="text-muted-foreground">→</span>{" "}
                <span className="font-semibold text-brand-accent">
                  {currentStep.toName}
                </span>
                <span className="text-muted-foreground">: {currentStep.flows}</span>
                {currentStep.condition && (
                  <span className="ml-2 text-amber-500 text-[10px]">
                    (when: {currentStep.condition})
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right: Docked DiagramLegend */}
      <div className="shrink-0 flex items-center">
        <DiagramLegend />
      </div>
    </footer>
  );
}

