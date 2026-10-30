"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, ArrowUp, RefreshCw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BriefCard } from "@/components/BriefCard";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { ApiError, createDesign, sendIntakeTurn } from "@/lib/api";
import { saveHistoryEntry } from "@/lib/history";
import type { RequirementBrief } from "@/lib/types";

interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  text?: string;
  questions?: string[];
}

export default function HomePage(): React.ReactElement {
  const router = useRouter();

  const [inputText, setInputText] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [brief, setBrief] = useState<RequirementBrief | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Mutation for intake turns (initial prompt and answering follow-ups)
  const intakeMutation = useMutation({
    mutationFn: async (text: string) => {
      return sendIntakeTurn({
        session_id: sessionId,
        text,
      });
    },
    onSuccess: (data) => {
      setSessionId(data.session_id);
      setValidationError(null);

      if (data.status === "needs_info") {
        setMessages((prev) => [
          ...prev,
          {
            id: `msg-${Date.now()}-assistant`,
            sender: "assistant",
            questions: data.questions,
          },
        ]);
      } else if (data.status === "ready" && data.brief) {
        setBrief(data.brief);
      }
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        setValidationError(err.message);
      } else {
        setValidationError(
          err instanceof Error ? err.message : "An unexpected error occurred.",
        );
      }
    },
  });

  // Mutation for generating the architecture design
  const designMutation = useMutation({
    mutationFn: async (activeSessionId: string) => {
      return createDesign({
        session_id: activeSessionId,
      });
    },
    onSuccess: (data) => {
      saveHistoryEntry({
        design_id: data.id,
        summary: data.brief.summary,
        created_at: new Date().toISOString(),
      });
      router.push(`/design/${encodeURIComponent(data.id)}`);
    },
  });

  const handleSend = () => {
    const trimmed = inputText.trim();

    if (trimmed.length < 1) {
      setValidationError("Input must be at least 1 character long.");
      return;
    }

    if (trimmed.length > 4000) {
      setValidationError("Input must not exceed 4000 characters.");
      return;
    }

    setValidationError(null);

    // Append user message to chat state
    setMessages((prev) => [
      ...prev,
      {
        id: `msg-${Date.now()}-user`,
        sender: "user",
        text: trimmed,
      },
    ]);

    setInputText("");
    intakeMutation.mutate(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!intakeMutation.isPending && !brief) {
        handleSend();
      }
    }
  };

  const handleRetryGenerate = () => {
    if (sessionId) {
      designMutation.mutate(sessionId);
    }
  };

  const designError =
    designMutation.error instanceof ApiError
      ? designMutation.error
      : designMutation.error &&
          typeof designMutation.error === "object" &&
          "issues" in designMutation.error
        ? (designMutation.error as ApiError)
        : null;

  return (
    <main className="relative min-h-screen w-full bg-[var(--page-bg)] text-[#f4f4f5] px-4 py-12 md:py-16 selection:bg-[#ccff00] selection:text-black">
      {/* Background subtle static grid pattern, no animated grid, no grain */}
      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#27272a15_1px,transparent_1px),linear-gradient(to_bottom,#27272a15_1px,transparent_1px)] bg-[size:32px_32px]"
        aria-hidden="true"
      />

      {/* Generation Loading Overlay */}
      {designMutation.isPending && <LoadingOverlay />}

      <div className="relative mx-auto flex w-full max-w-2xl flex-col items-center">
        {/* Header Branding */}
        <header className="mb-8 text-center space-y-2">
          <div className="flex items-center justify-between w-full mb-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs font-mono text-muted-foreground backdrop-blur-md">
              <span className="size-2 rounded-full bg-[#ccff00]" />
              Arch-Nemesis System Architect
            </div>
            <Link
              href="/history"
              className="text-xs font-mono text-muted-foreground hover:text-[#ccff00] transition-colors underline underline-offset-4"
            >
              Past designs
            </Link>
          </div>
          <h1 className="font-heading text-3xl md:text-4xl font-bold tracking-tight text-foreground">
            Describe the system you need
          </h1>
          <p className="text-sm md:text-base text-muted-foreground max-w-lg mx-auto">
            Plain language intake dialogue turns your business need into a validated, interactive architecture diagram.
          </p>
        </header>

        {/* Chat / Interaction Flow */}
        <div className="w-full space-y-6">
          {/* Message History */}
          {messages.length > 0 && (
            <div className="space-y-4 rounded-xl border border-border/50 bg-card/40 p-4 md:p-6 backdrop-blur-md">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.sender === "user" ? "items-end" : "items-start"
                  }`}
                >
                  <span className="text-[11px] font-mono text-muted-foreground mb-1 uppercase tracking-wider">
                    {msg.sender === "user" ? "You" : "Architect"}
                  </span>
                  <div
                    className={`rounded-xl px-4 py-2.5 max-w-[85%] text-sm break-words ${
                      msg.sender === "user"
                        ? "bg-[#ccff00] text-black font-medium"
                        : "bg-muted text-foreground border border-border/60"
                    }`}
                  >
                    {msg.text && <p className="whitespace-pre-wrap">{msg.text}</p>}
                    {msg.questions && msg.questions.length > 0 && (
                      <div className="space-y-2">
                        <p className="font-medium text-xs text-muted-foreground">
                          Please clarify the following:
                        </p>
                        <ul className="list-disc list-inside space-y-1">
                          {msg.questions.map((q, idx) => (
                            <li key={`q-${idx}`}>{q}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Synthesized Brief Card */}
          {brief && (
            <div className="w-full animate-in fade-in duration-300">
              <BriefCard
                brief={brief}
                onGenerate={() => sessionId && designMutation.mutate(sessionId)}
                isGenerating={designMutation.isPending}
              />
            </div>
          )}

          {/* Design Generation Error Alert */}
          {designMutation.isError && (
            <Alert variant="destructive" className="rounded-xl border-destructive/60 bg-destructive/10 text-destructive-foreground">
              <AlertCircle className="size-4" />
              <AlertTitle className="font-semibold">Generation Failed</AlertTitle>
              <AlertDescription className="mt-1 space-y-2 text-sm">
                <p>
                  {designError?.message ||
                    (designMutation.error instanceof Error
                      ? designMutation.error.message
                      : "Could not produce a design that passes all checks.")}
                </p>

                {/* Show up to 5 validation issues if returned (422 DESIGN_FAILED) */}
                {designError?.issues && designError.issues.length > 0 && (
                  <ul className="list-disc list-inside space-y-0.5 text-xs font-mono opacity-90">
                    {designError.issues.slice(0, 5).map((issue, idx) => (
                      <li key={`issue-${idx}`} className="break-words">
                        {issue}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRetryGenerate}
                    className="border-destructive/40 hover:bg-destructive/20 text-xs font-semibold gap-1.5"
                  >
                    <RefreshCw className="size-3.5" />
                    Retry
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Validation or Turn Error Alert */}
          {validationError && (
            <Alert variant="destructive" className="rounded-xl border-destructive/60 bg-destructive/10 text-destructive-foreground">
              <AlertCircle className="size-4" />
              <AlertDescription className="text-sm font-medium">
                {validationError}
              </AlertDescription>
            </Alert>
          )}

          {/* Input Box: Active when brief is not yet ready */}
          {!brief && (
            <div className="relative w-full rounded-2xl border border-border/80 bg-card/80 p-3 shadow-xl backdrop-blur-md focus-within:border-[#ccff00]/60 focus-within:ring-1 focus-within:ring-[#ccff00]/60 transition-all">
              <Textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="For example: a support assistant that answers customers from our help articles and hands hard cases to a person."
                disabled={intakeMutation.isPending}
                rows={3}
                className="resize-none border-0 bg-transparent p-1.5 text-sm md:text-base text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-0 focus-visible:outline-none"
              />

              <div className="mt-2 flex items-center justify-between border-t border-border/40 pt-2 px-1">
                <span className="text-[11px] font-mono text-muted-foreground">
                  {inputText.length} / 4000 characters
                </span>

                <Button
                  type="button"
                  onClick={handleSend}
                  disabled={intakeMutation.isPending || !inputText.trim()}
                  className="bg-[#ccff00] text-black hover:bg-[#b8e600] font-semibold text-xs px-3.5 py-1.5 h-8 gap-1.5 transition-colors"
                >
                  Send
                  <ArrowUp className="size-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
