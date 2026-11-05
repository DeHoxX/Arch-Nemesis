"use client";

import React, { useRef, useState } from "react";
import { AlertCircle, History, Loader2, MessageSquare, Send, Sparkles } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  type ChatMessageItem,
  MAX_REFINEMENT_INPUT_CHARS,
  MAX_REFINEMENT_TURNS,
  MAX_VERSIONS,
  type SuggestionItemResponse,
} from "@/lib/types";

export interface RefinePanelProps {
  messages: ChatMessageItem[];
  turnsUsed: number;
  maxTurns?: number;
  versionsCount: number;
  maxVersions?: number;
  isSending?: boolean;
  isViewingHistorical?: boolean;
  hasPendingPatch?: boolean;
  patchCard?: React.ReactNode;
  onSendMessage: (message: string) => void;
  // Lifted Chat Draft Props (Phase 7D2)
  draft?: string;
  onDraftChange?: (draft: string) => void;
  // Phase 7D1 Suggestions Props
  suggestions?: SuggestionItemResponse[];
  discardedCount?: number;
  isLoadingSuggestions?: boolean;
  suggestionsError?: string | null;
  onAskSuggestions?: () => void;
  onApplySuggestion?: (suggestion: SuggestionItemResponse) => void;
}

/**
 * RefinePanel: Interactive chat interface to request step-by-step design mutations.
 *
 * Requirements (BUILD_PLAN.md:540, 545, 547, 548):
 * - Title "Refine this design".
 * - Message history list (renders user and assistant bubbles).
 * - Textarea with max 1000 characters (mirrored constant), live character counter.
 * - Enter sends message, Shift+Enter creates a new line.
 * - Send button with loading state.
 * - Counters: "Change requests used: {x} of {max}" and "Versions: {y} of {max}".
 * - "What can we add or remove?" button triggers architectural suggestions (Phase 7D1).
 * - Suggestions labelled "Suggestion (opinion, not verified)" with plain text titles/reasons (Rule 5).
 * - Discarded notice "{n} suggestions were discarded because they broke a rule." when discarded_count > 0.
 * - Apply button triggers onApplySuggestion to open visual diff view.
 * - Disabled states:
 *   - Empty message or whitespace.
 *   - Sending in progress.
 *   - Change requests cap hit (409 CAP_TURNS).
 *   - Versions cap hit (409 CAP_VERSIONS).
 *   - Viewing historical version ("Refinement is only available on the latest version.").
 *   - Candidate patch pending review.
 * - 503/429 inline message "Suggestions are temporarily unavailable. Please try again." with Retry button.
 * - Plain text rendering only (no dangerouslySetInnerHTML, Rule 5).
 */
export function RefinePanel({
  messages,
  turnsUsed,
  maxTurns = MAX_REFINEMENT_TURNS,
  versionsCount,
  maxVersions = MAX_VERSIONS,
  isSending = false,
  isViewingHistorical = false,
  hasPendingPatch = false,
  patchCard,
  onSendMessage,
  draft,
  onDraftChange,
  suggestions = [],
  discardedCount = 0,
  isLoadingSuggestions = false,
  suggestionsError = null,
  onAskSuggestions,
  onApplySuggestion,
}: RefinePanelProps): React.ReactElement {
  const [internalText, setInternalText] = useState("");
  const isControlled = draft !== undefined;
  const inputText = isControlled ? draft : internalText;

  const handleInputChange = (newVal: string) => {
    const capped = newVal.slice(0, MAX_REFINEMENT_INPUT_CHARS);
    if (isControlled) {
      onDraftChange?.(capped);
    } else {
      setInternalText(capped);
    }
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isTurnsCapped = turnsUsed >= maxTurns;
  const isVersionsCapped = versionsCount >= maxVersions;
  const isInputDisabled =
    isSending || isViewingHistorical || isTurnsCapped || isVersionsCapped || Boolean(hasPendingPatch);
  const isSuggestionsDisabled =
    isSending || isViewingHistorical || isTurnsCapped || isVersionsCapped || Boolean(hasPendingPatch) || isLoadingSuggestions;

  const handleSend = () => {
    const trimmed = inputText.trim();
    if (!trimmed || isInputDisabled) return;
    onSendMessage(trimmed);
    if (isControlled) {
      onDraftChange?.("");
    } else {
      setInternalText("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Card
      className="border-border bg-card/60 backdrop-blur-sm shadow-md flex flex-col h-full"
      role="region"
      aria-label="Refine Architecture Design"
    >
      <CardHeader className="border-b border-border/40 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MessageSquare className="size-4 text-[#ccff00]" aria-hidden="true" />
            <CardTitle className="text-sm font-semibold tracking-tight">
              Refine this design
            </CardTitle>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
            <span>
              Change requests used: <strong className="text-foreground">{turnsUsed}</strong> of {maxTurns}
            </span>
            <span className="text-muted-foreground/40" aria-hidden="true">|</span>
            <span>
              Versions: <strong className="text-foreground">{versionsCount}</strong> of {maxVersions}
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[220px] max-h-[380px]">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-muted-foreground text-xs space-y-1">
            <p className="font-mono">No change requests yet.</p>
            <p className="text-[11px] text-muted-foreground/80 max-w-sm">
              Describe a change in plain English, for example: &ldquo;Add an audit logger before the final sink&rdquo; or &ldquo;Remove the cache component&rdquo;.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === "user";
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3.5 py-2 text-xs leading-relaxed break-words ${
                    isUser
                      ? "bg-primary text-primary-foreground font-sans"
                      : "bg-muted border border-border/60 text-foreground font-sans"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground/60 px-1 mt-0.5">
                  {isUser ? "You" : "Assistant"}
                </span>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} aria-hidden="true" />
      </CardContent>

      <CardFooter className="flex flex-col gap-2.5 p-3 border-t border-border/40 bg-card/40">
        {/* Docked PatchCard above input */}
        {patchCard}

        {/* Suggestions Section (Phase 7D1) */}
        {discardedCount > 0 && (
          <div
            className="w-full rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300"
            role="status"
          >
            {`${discardedCount} suggestions were discarded because they broke a rule.`}
          </div>
        )}

        {suggestions.length > 0 && (
          <div
            className="w-full space-y-2 max-h-[260px] overflow-y-auto pr-1"
            aria-label="Architectural suggestions list"
          >
            {suggestions.map((suggestion) => (
              <div
                key={suggestion.patch_id}
                className="rounded-lg border border-border/80 bg-background/60 p-3 space-y-2 text-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge
                        variant="outline"
                        className="text-[10px] font-mono border-amber-500/40 text-amber-400 bg-amber-500/10 py-0 px-1.5"
                      >
                        Suggestion (opinion, not verified)
                      </Badge>
                      {suggestion.status === "needs_confirmation" && (
                        <Badge
                          variant="outline"
                          className="text-[10px] font-mono border-rose-500/40 text-rose-400 bg-rose-500/10 py-0 px-1.5"
                        >
                          Needs confirmation
                        </Badge>
                      )}
                    </div>
                    <h4 className="font-semibold text-foreground text-xs break-words">
                      {suggestion.title}
                    </h4>
                    <p className="text-muted-foreground text-xs leading-relaxed break-words">
                      {suggestion.reason}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => onApplySuggestion?.(suggestion)}
                    disabled={isInputDisabled}
                    className="text-xs h-7 px-2.5 font-medium shrink-0 bg-secondary hover:bg-secondary/80 text-secondary-foreground"
                    aria-label={`Apply suggestion: ${suggestion.title}`}
                  >
                    Apply
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {suggestionsError && (
          <div
            className="w-full flex items-center justify-between rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300"
            role="alert"
          >
            <span>Suggestions are temporarily unavailable. Please try again.</span>
            {onAskSuggestions && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onAskSuggestions}
                disabled={isSuggestionsDisabled}
                className="h-6 px-2 text-xs text-rose-200 hover:text-rose-100 hover:bg-rose-500/20"
              >
                Retry
              </Button>
            )}
          </div>
        )}

        {/* Toolbar: What can we add or remove? button */}
        <div className="w-full flex items-center justify-between gap-2">
          {onAskSuggestions && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onAskSuggestions}
              disabled={isSuggestionsDisabled}
              className="text-xs h-7 gap-1.5 border-border/80 text-foreground hover:bg-accent hover:text-accent-foreground"
              aria-label="Request architectural suggestions"
            >
              {isLoadingSuggestions ? (
                <>
                  <Loader2 className="size-3 animate-spin text-muted-foreground" aria-hidden="true" />
                  <span>Analyzing architecture...</span>
                </>
              ) : (
                <>
                  <Sparkles className="size-3 text-[#ccff00]" aria-hidden="true" />
                  <span>What can we add or remove?</span>
                </>
              )}
            </Button>
          )}
        </div>

        {/* Cap & Mode Warning Banners */}
        {isViewingHistorical && (
          <Alert className="py-2 px-3 border-amber-500/30 bg-amber-950/20 text-amber-200">
            <History className="size-3.5 text-amber-400" />
            <AlertDescription className="text-xs">
              Refinement is only available on the latest version.
            </AlertDescription>
          </Alert>
        )}

        {isTurnsCapped && (
          <Alert className="py-2 px-3 border-amber-500/30 bg-amber-950/20 text-amber-200">
            <AlertCircle className="size-3.5 text-amber-400" />
            <AlertDescription className="text-xs">
              {`This design has reached the limit of ${maxTurns} change requests. Please contact our team to continue.`}
            </AlertDescription>
          </Alert>
        )}

        {!isTurnsCapped && isVersionsCapped && (
          <Alert className="py-2 px-3 border-amber-500/30 bg-amber-950/20 text-amber-200">
            <AlertCircle className="size-3.5 text-amber-400" />
            <AlertDescription className="text-xs">
              {`This design has reached the limit of ${maxVersions} versions. Please contact our team to continue.`}
            </AlertDescription>
          </Alert>
        )}

        {/* Chat Input & Counter */}
        <div className="relative w-full">
          <Textarea
            value={inputText}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isInputDisabled
                ? "Chat disabled for current state"
                : "Describe an architectural change... (Shift+Enter for new line)"
            }
            disabled={isInputDisabled}
            rows={2}
            className="w-full resize-none pr-20 text-xs font-sans bg-background/80 border-border focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Refinement instruction input"
          />
          <div className="absolute right-2 bottom-2 flex items-center gap-2">
            <span
              className={`text-[10px] font-mono ${
                inputText.length >= MAX_REFINEMENT_INPUT_CHARS
                  ? "text-rose-400 font-semibold"
                  : "text-muted-foreground/60"
              }`}
              aria-label={`${inputText.length} of ${MAX_REFINEMENT_INPUT_CHARS} characters used`}
            >
              {`${inputText.length}/${MAX_REFINEMENT_INPUT_CHARS}`}
            </span>
            <Button
              type="button"
              size="icon"
              variant="default"
              onClick={handleSend}
              disabled={isInputDisabled || inputText.trim().length === 0}
              className="size-7 bg-[#ccff00] text-black hover:bg-[#b8e600] disabled:bg-muted disabled:text-muted-foreground"
              aria-label="Send refinement request"
            >
              <Send className="size-3.5" />
            </Button>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}
