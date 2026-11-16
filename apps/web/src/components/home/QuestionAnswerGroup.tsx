import React from "react";
import type { IntakeQuestion } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface QuestionState {
  customText: string;
  selectedChip: string | null;
}

export interface QuestionAnswerGroupProps {
  questions: IntakeQuestion[];
  answers: Record<number, QuestionState>;
  onAnswerChange: (index: number, state: Partial<QuestionState>) => void;
  onUseAllSuggestions: () => void;
  onSubmit: () => void;
  isPending: boolean;
  validationError: string | null;
  composedLength: number;
  maxChars: number;
}

export function QuestionAnswerGroup({
  questions,
  answers,
  onAnswerChange,
  onUseAllSuggestions,
  onSubmit,
  isPending,
  validationError,
  composedLength,
  maxChars,
}: QuestionAnswerGroupProps): React.ReactElement {
  const hasAnySuggestions = questions.some((q) => Boolean(q.suggested_answer));
  const isOverflow = composedLength > maxChars;

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4 text-foreground shadow-xs">
      <div className="space-y-1">
        <h3 className="font-heading text-sm font-semibold text-foreground">
          Clarifying Questions
        </h3>
        <p className="text-xs text-muted-foreground">
          Select a suggested default, choose an option, or type your custom answer.
        </p>
      </div>

      <div className="space-y-4">
        {questions.map((q, idx) => {
          const state = answers[idx] ?? { customText: "", selectedChip: null };
          const hasSelectedChip = Boolean(state.selectedChip);
          const hasCustomText = Boolean(state.customText.trim());

          return (
            <div
              key={`question-card-${idx}`}
              className="space-y-2.5 rounded-lg border border-border bg-card-bg/50 p-3"
            >
              <div className="text-xs font-medium text-foreground">
                <span className="font-mono text-muted-foreground mr-1.5">
                  {idx + 1}.
                </span>
                <span>{q.question}</span>
              </div>

              {/* Chips container (suggested answer + options) */}
              {(q.suggested_answer || (q.options && q.options.length > 0)) && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {/* Suggested Answer Chip */}
                  {q.suggested_answer && (
                    <button
                      type="button"
                      aria-pressed={
                        !hasCustomText && state.selectedChip === q.suggested_answer
                      }
                      onClick={() => {
                        const isCurrent =
                          !hasCustomText && state.selectedChip === q.suggested_answer;
                        onAnswerChange(idx, {
                          selectedChip: isCurrent ? null : q.suggested_answer,
                          customText: "",
                        });
                      }}
                      disabled={isPending}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                        !hasCustomText && state.selectedChip === q.suggested_answer
                          ? "border-brand-accent bg-brand-accent font-medium text-brand-accent-ink"
                          : "border-border bg-secondary text-secondary-foreground hover:bg-muted"
                      )}
                    >
                      <span className="rounded border border-border bg-muted px-1 py-0.2 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                        Suggested
                      </span>
                      <span>{q.suggested_answer}</span>
                    </button>
                  )}

                  {/* Option Chips */}
                  {q.options?.map((opt, optIdx) => {
                    const isSelected =
                      !hasCustomText && state.selectedChip === opt;
                    return (
                      <button
                        key={`opt-${idx}-${optIdx}`}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => {
                          onAnswerChange(idx, {
                            selectedChip: isSelected ? null : opt,
                            customText: "",
                          });
                        }}
                        disabled={isPending}
                        className={cn(
                          "inline-flex items-center rounded-md border px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                          isSelected
                            ? "border-brand-accent bg-brand-accent font-medium text-brand-accent-ink"
                            : "border-border bg-secondary text-secondary-foreground hover:bg-muted"
                        )}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Single-line custom input */}
              <div className="pt-1">
                <Input
                  type="text"
                  value={state.customText}
                  onChange={(e) =>
                    onAnswerChange(idx, {
                      customText: e.target.value,
                      selectedChip: null,
                    })
                  }
                  placeholder={
                    hasSelectedChip && !hasCustomText
                      ? `Selected: "${state.selectedChip}" (type to override)`
                      : q.suggested_answer
                        ? `Leave blank to assume "${q.suggested_answer}", or type custom answer...`
                        : "Type your answer..."
                  }
                  aria-label={`Your answer for: ${q.question}`}
                  disabled={isPending}
                  className="h-8 text-xs bg-background text-foreground border-border focus-visible:ring-brand-accent/60"
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Inline validation error if any */}
      {validationError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
        >
          {validationError}
        </div>
      )}

      {/* Overflow warning */}
      {isOverflow && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
        >
          Your answers exceed the character limit ({composedLength}/{maxChars}).
          Please shorten your responses.
        </div>
      )}

      {/* Action Footer */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-border/40">
        <div>
          {hasAnySuggestions && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onUseAllSuggestions}
              disabled={isPending}
              className="text-xs bg-secondary text-secondary-foreground border-border hover:bg-muted"
            >
              Use suggested answers
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {composedLength > 0 && (
            <span className="font-mono text-[11px] text-muted-foreground">
              {composedLength}/{maxChars}
            </span>
          )}
          <Button
            type="button"
            size="sm"
            onClick={onSubmit}
            disabled={isPending || isOverflow}
            className="text-xs font-semibold bg-brand-accent text-brand-accent-ink hover:bg-brand-accent-hover"
          >
            Send answers
          </Button>
        </div>
      </div>
    </div>
  );
}
