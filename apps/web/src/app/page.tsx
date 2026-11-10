"use client";

import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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

import {
  clearIntakeState,
  loadIntakeState,
  saveIntakeState,
  type StoredChatMessage,
} from "../lib/intakeStorage";

type ChatMessage = StoredChatMessage;

function HomeLoading(): React.ReactElement {
  return (
    <main className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-background text-foreground selection:bg-brand-accent selection:text-brand-accent-ink home-hero-bg">
      <div className="flex flex-1 flex-col items-center justify-center p-4 text-center pb-24 md:pb-32">
        <div className="mx-auto flex w-full max-w-2xl flex-col items-center space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1 text-xs font-mono text-muted-foreground shadow-xs">
            <span className="size-2 rounded-full bg-brand-accent" />
            Arch-Nemesis System Architect
          </div>
          <h1 className="font-[family-name:var(--font-anton)] text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-normal uppercase tracking-normal text-foreground max-w-4xl">
            Describe the system you need
          </h1>
          <p className="max-w-lg text-sm text-muted-foreground md:text-base">
            Plain language intake dialogue turns your business need into a validated, interactive architecture diagram.
          </p>
        </div>
      </div>
    </main>
  );
}

interface HomeContentProps {
  isNew: boolean;
}

function HomeContent({ isNew }: HomeContentProps): React.ReactElement {
  const router = useRouter();

  const [inputText, setInputText] = useState(() => {
    if (isNew || typeof window === "undefined") return "";
    return loadIntakeState()?.inputText ?? "";
  });
  const [sessionId, setSessionId] = useState<string | null>(() => {
    if (isNew || typeof window === "undefined") return null;
    return loadIntakeState()?.sessionId ?? null;
  });
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (isNew || typeof window === "undefined") return [];
    return loadIntakeState()?.messages ?? [];
  });
  const [brief, setBrief] = useState<RequirementBrief | null>(() => {
    if (isNew || typeof window === "undefined") return null;
    return loadIntakeState()?.brief ?? null;
  });
  const [validationError, setValidationError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

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
        if (err.status === 409 || err.code === "SESSION_CLOSED") {
          setValidationError(
            "This design request is finished. Use New design to start another.",
          );
        } else {
          setValidationError(err.message);
        }
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
        title: data.title,
        created_at: new Date().toISOString(),
      });
      saveIntakeState({
        sessionId,
        inputText,
        messages,
        brief,
        designId: data.id,
      });
      router.push(`/design/${encodeURIComponent(data.id)}`);
    },
  });

  // When navigated with ?new=1, clear storage and silently clean URL (D-193)
  useEffect(() => {
    if (isNew) {
      clearIntakeState();
      router.replace("/", { scroll: false });
    }
  }, [isNew, router]);

  // Persist updated state to sessionStorage (D-194)
  useEffect(() => {
    if (isNew) {
      return;
    }
    if (!sessionId && messages.length === 0 && !brief && !inputText) {
      clearIntakeState();
      return;
    }
    saveIntakeState({
      sessionId,
      inputText,
      messages,
      brief,
    });
  }, [sessionId, inputText, messages, brief, isNew]);

  // Auto-scroll on messages change or brief shown
  useEffect(() => {
    scrollToBottom("smooth");
  }, [messages, brief, scrollToBottom]);

  // Initial mount restore scroll
  useEffect(() => {
    if (messages.length > 0 || brief !== null) {
      scrollToBottom("auto");
    }
  }, [scrollToBottom, messages.length, brief]);

  // Auto-grow textarea up to max-h-40 (160px)
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const nextHeight = Math.min(el.scrollHeight, 160);
    el.style.height = `${nextHeight}px`;
  }, [inputText]);

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
      if (!intakeMutation.isPending) {
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

  const hasMessagesOrBrief = messages.length > 0 || brief !== null;

  return (
    <main className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-background text-foreground selection:bg-brand-accent selection:text-brand-accent-ink home-hero-bg">
      {/* Generation Loading Overlay */}
      {designMutation.isPending && <LoadingOverlay />}

      {/* Scrollable Upper Region: Empty State Hero OR Conversation Stream */}
      <div className="relative flex flex-1 flex-col overflow-y-auto px-4 py-6">
        {!hasMessagesOrBrief ? (
          /* Empty State Hero (exact BUILD_PLAN.md:446 copy) */
          <div className="my-auto flex flex-1 flex-col items-center justify-center text-center pb-24 md:pb-32">
            <div className="mx-auto flex w-full max-w-2xl flex-col items-center space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1 text-xs font-mono text-muted-foreground shadow-xs">
                <span className="size-2 rounded-full bg-brand-accent" />
                Arch-Nemesis System Architect
              </div>
              <h1 className="font-[family-name:var(--font-anton)] text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-normal uppercase tracking-normal text-foreground max-w-4xl">
                Describe the system you need
              </h1>
              <p className="max-w-lg text-sm text-muted-foreground md:text-base">
                Plain language intake dialogue turns your business need into a validated, interactive architecture diagram.
              </p>
            </div>
          </div>
        ) : (
          /* Active Chat Stream */
          <div className="mx-auto w-full max-w-2xl space-y-6 pb-4">
            {/* Header pill when messages are active */}
            <div className="flex justify-center pt-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1 text-xs font-mono text-muted-foreground shadow-xs">
                <span className="size-1.5 rounded-full bg-brand-accent" />
                System Architect Session
              </div>
            </div>

            {/* Message Bubble History */}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.sender === "user" ? "items-end" : "items-start"
                }`}
              >
                <span className="mb-1 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                  {msg.sender === "user" ? "You" : "Architect"}
                </span>
                <div
                  className={`max-w-[85%] break-words rounded-xl px-4 py-2.5 text-sm ${
                    msg.sender === "user"
                      ? "bg-brand-accent font-medium text-brand-accent-ink"
                      : "border border-border bg-card text-foreground"
                  }`}
                >
                  {msg.text && <p className="whitespace-pre-wrap">{msg.text}</p>}
                  {msg.questions && msg.questions.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">
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

            {/* Synthesized Brief Card (inline at the end of the message stream) */}
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
              <Alert
                variant="destructive"
                className="rounded-xl border-destructive/60 bg-destructive/10 text-destructive-foreground"
              >
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
                    <ul className="list-disc list-inside space-y-0.5 font-mono text-xs opacity-90">
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
                      className="gap-1.5 border-destructive/40 text-xs font-semibold hover:bg-destructive/20"
                    >
                      <RefreshCw className="size-3.5" />
                      Retry
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Docked Bottom Chat Input Bar (stays enabled after brief is shown) */}
      <div className="shrink-0 border-t border-border bg-card/40 backdrop-blur-md px-4 py-3">
        <div className="mx-auto w-full max-w-2xl space-y-2">
          {/* Validation or Turn Error Alert */}
          {validationError && (
            <Alert
              variant="destructive"
              className="rounded-xl border-destructive/60 bg-destructive/10 text-destructive-foreground"
            >
              <AlertCircle className="size-4" />
              <AlertDescription className="text-sm font-medium">
                {validationError}
              </AlertDescription>
            </Alert>
          )}

          <div className="relative w-full rounded-2xl border border-border bg-card p-2.5 shadow-xl transition-all focus-within:border-brand-accent/60 focus-within:ring-1 focus-within:ring-brand-accent/60">
            <Textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="For example: a support assistant that answers customers from our help articles and hands hard cases to a person."
              disabled={intakeMutation.isPending}
              rows={1}
              className="min-h-[44px] max-h-40 resize-none border-0 bg-transparent p-1.5 text-sm text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-0 md:text-base"
            />

            <div className="mt-1 flex items-center justify-between border-t border-border/40 px-1 pt-1.5">
              <span className="font-mono text-[11px] text-muted-foreground">
                {inputText.length} / 4000 characters
              </span>

              <Button
                type="button"
                onClick={handleSend}
                disabled={intakeMutation.isPending || !inputText.trim()}
                className="h-8 gap-1.5 bg-brand-accent px-3.5 py-1.5 text-xs font-semibold text-brand-accent-ink transition-colors hover:bg-brand-accent-hover disabled:opacity-50"
              >
                Send
                <ArrowUp className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function HomeContentWrapper(): React.ReactElement {
  const searchParams = useSearchParams();
  const isNew = searchParams.get("new") === "1";
  const contentKey = isNew ? "fresh-start" : "default-session";

  return <HomeContent key={contentKey} isNew={isNew} />;
}

export default function HomePage(): React.ReactElement {
  return (
    <Suspense fallback={<HomeLoading />}>
      <HomeContentWrapper />
    </Suspense>
  );
}
