"use client";

import React, { useRef, useState } from "react";
import { AlertCircle, History, MessageSquare, Send } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  type ChatMessageItem,
  MAX_REFINEMENT_INPUT_CHARS,
  MAX_REFINEMENT_TURNS,
  MAX_VERSIONS,
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
}

/**
 * RefinePanel: Interactive chat interface to request step-by-step design mutations.
 *
 * Requirements (BUILD_PLAN.md:545, 547):
 * - Title "Refine this design".
 * - Message history list (renders user and assistant bubbles).
 * - Textarea with max 1000 characters (mirrored constant), live character counter.
 * - Enter sends message, Shift+Enter creates a new line.
 * - Send button with loading state.
 * - Counters: "Change requests used: {x} of {max}" and "Versions: {y} of {max}".
 * - Disabled states:
 *   - Empty message or whitespace.
 *   - Sending in progress.
 *   - Change requests cap hit (409 CAP_TURNS: "This design has reached the limit of {n} change requests. Please contact our team to continue.").
 *   - Versions cap hit (409 CAP_VERSIONS: "This design has reached the limit of {n} versions. Please contact our team to continue.").
 *   - Viewing historical version ("Refinement is only available on the latest version.").
 * - Deliberately defers "What can we add or remove?" button to Phase 7D.
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
}: RefinePanelProps): React.ReactElement {
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isTurnsCapped = turnsUsed >= maxTurns;
  const isVersionsCapped = versionsCount >= maxVersions;
  const isInputDisabled =
    isSending || isViewingHistorical || isTurnsCapped || isVersionsCapped || Boolean(hasPendingPatch);

  const handleSend = () => {
    const trimmed = inputText.trim();
    if (!trimmed || isInputDisabled) return;
    onSendMessage(trimmed);
    setInputText("");
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

      <CardFooter className="flex flex-col gap-2 p-3 border-t border-border/40 bg-card/40">
        {/* Docked PatchCard above input */}
        {patchCard}

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
            onChange={(e) => setInputText(e.target.value.slice(0, MAX_REFINEMENT_INPUT_CHARS))}
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

