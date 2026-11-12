"use client";

import React, { useRef, useState } from "react";
import {
  ChevronDown,
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
 * FlowPlaybackBar: Docked footer controls for sequential flow playback (Stage 1C+, D-332).
 *
 * Rules:
 * - Docked outside React Flow in the DiagramView flex column (border-t border-border bg-card).
 * - Closed state shows ONLY the "Flow" toggle (with count) on the left and "Legend" on the right.
 * - Flow panel opens UPWARD (bottom-full mb-2, opaque, anchored left-0, max-w-md, max-h-[calc(100vh-320px)] overflow-y-auto).
 * - Opening Flow closes Legend, and opening Legend closes Flow.
 * - Closing Flow panel (toggle, Escape inside panel, or Clear) exits playback via onClear().
 * - Opening Flow panel does NOT auto-start playback (Next starts step 1).
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
  const [isFlowOpen, setIsFlowOpen] = useState(false);
  const [isLegendOpen, setIsLegendOpen] = useState(false);
  const flowToggleRef = useRef<HTMLButtonElement>(null);

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

  const handleToggleFlow = () => {
    setIsFlowOpen((prev) => {
      const next = !prev;
      if (!next && isActive) {
        onClear();
      }
      if (next) {
        setIsLegendOpen(false);
      }
      return next;
    });
  };

  const handleToggleLegend = () => {
    setIsLegendOpen((prev) => {
      const next = !prev;
      if (next && isFlowOpen) {
        setIsFlowOpen(false);
        if (isActive) {
          onClear();
        }
      }
      return next;
    });
  };

  const handlePanelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      setIsFlowOpen(false);
      if (isActive) {
        onClear();
      }
      flowToggleRef.current?.focus();
    }
  };

  const handleClearClick = () => {
    onClear();
  };

  return (
    <footer
      aria-label="Flow playback controls"
      className={cn(
        "relative flex items-center justify-between gap-3 border-t border-border bg-card px-3 py-2 text-xs select-none",
        className,
      )}
    >
      {/* LEFT: Flow toggle button and upward-opening dropdown panel */}
      <div className="relative flex items-center">
        <button
          ref={flowToggleRef}
          type="button"
          onClick={handleToggleFlow}
          aria-expanded={isFlowOpen}
          aria-controls="diagram-flow-panel"
          aria-label="Toggle flow playback"
          className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span>Flow</span>
          <ChevronDown
            className={cn(
              "size-3.5 text-muted-foreground transition-transform duration-200",
              isFlowOpen && "rotate-180",
            )}
          />
        </button>
        <span className="ml-2 font-mono text-[11px] text-muted-foreground">
          {totalSteps} {totalSteps === 1 ? "flow" : "flows"}
        </span>

        {/* Upward-opening Flow dropdown panel */}
        {isFlowOpen && (
          <div
            id="diagram-flow-panel"
            role="region"
            aria-label="Flow playback panel"
            onKeyDown={handlePanelKeyDown}
            className="absolute bottom-full left-0 mb-2 max-h-[calc(100vh-320px)] w-80 sm:w-96 max-w-[calc(100vw-6rem)] overflow-y-auto rounded-md border border-border bg-card p-3 text-xs shadow-lg z-30 space-y-3"
          >
            {/* Top row: Transport buttons */}
            <div className="flex items-center gap-1.5">
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
                onClick={handleClearClick}
                disabled={isZeroEdges || !isActive}
                aria-label="Exit playback"
                title="Exit playback"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground motion-reduce:transition-none ml-auto"
              >
                <X className="size-3.5" />
              </Button>
            </div>

            {/* Description & Status section */}
            <div className="space-y-1 border-t border-border/60 pt-2">
              {isZeroEdges ? (
                <div className="font-mono text-muted-foreground text-[11px]">
                  No flows to step through
                </div>
              ) : !isActive ? (
                <div className="space-y-0.5">
                  <div className="font-mono font-medium text-foreground text-[11px]">
                    Ready · {totalSteps} {totalSteps === 1 ? "flow" : "flows"}
                  </div>
                  <div className="text-muted-foreground/80 font-mono text-[10px]">
                    Click Next to step through connections
                  </div>
                  <div className="text-muted-foreground/60 font-mono text-[10px]">
                    Topological edge order (not a runtime scenario)
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-1">
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
                      className="font-mono text-[11px] text-foreground bg-muted/40 p-2 rounded-md border border-border/40"
                    >
                      <div>
                        <span className="font-semibold text-brand-accent">
                          {currentStep.fromName}
                        </span>{" "}
                        <span className="text-muted-foreground">→</span>{" "}
                        <span className="font-semibold text-brand-accent">
                          {currentStep.toName}
                        </span>
                        <span className="text-muted-foreground">: {currentStep.flows}</span>
                      </div>
                      {currentStep.condition && (
                        <div className="mt-1 text-amber-500 text-[10px]">
                          When: {currentStep.condition}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* RIGHT: Docked DiagramLegend */}
      <div className="shrink-0 flex items-center">
        <DiagramLegend
          isOpen={isLegendOpen}
          onToggle={handleToggleLegend}
          onClose={() => setIsLegendOpen(false)}
        />
      </div>
    </footer>
  );
}
