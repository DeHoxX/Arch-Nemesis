"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowUp,
  ArrowUpRight,
  Pencil,
  RefreshCw,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BriefCard } from "@/components/BriefCard";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import {
  QuestionAnswerGroup,
  type QuestionState,
} from "@/components/home/QuestionAnswerGroup";
import { StudioBackground } from "@/components/studio/StudioBackground";
import { useStudioWavesGate } from "@/components/studio/useStudioWavesGate";
import { ApiError, createDesign, sendIntakeTurn } from "@/lib/api";
import {
  EXAMPLE_PROMPTS,
  EXAMPLE_PROMPT_ICONS,
  pickRandomExamplePrompts,
  type ExamplePrompt,
} from "@/lib/examplePrompts";
import { saveHistoryEntry } from "@/lib/history";
import { MAX_INPUT_CHARS, type RequirementBrief } from "@/lib/types";

import {
  clearIntakeState,
  loadIntakeState,
  saveIntakeState,
  type StoredChatMessage,
  type StoredFailedRequest,
} from "../lib/intakeStorage";

type ChatMessage = StoredChatMessage;

export function sanitizeUserAnswer(text: string): string {
  return text
    .replace(/\(no answer,\s*assume:/gi, "[assume:")
    .replace(/Q:/g, "Q -")
    .replace(/A:/g, "A -");
}

export function formatSuggestedAnswerAssumption(suggestion: string): string {
  let open = 0;
  let clean = "";
  for (const ch of suggestion) {
    if (ch === "(") {
      open++;
      clean += ch;
    } else if (ch === ")") {
      if (open > 0) {
        open--;
        clean += ch;
      } else {
        clean += "]";
      }
    } else {
      clean += ch;
    }
  }
  while (open > 0) {
    clean += ")";
    open--;
  }
  return `(no answer, assume: ${clean})`;
}

function HomeLoading(): React.ReactElement {
  return (
    <main className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-page-bg text-foreground selection:bg-brand-accent selection:text-brand-accent-ink studio-grid-bg">
      <div className="flex flex-1 flex-col items-center justify-center p-4 text-center">
        <div className="mx-auto flex w-full max-w-2xl flex-col items-center space-y-4">
          <div className="font-mono text-[11px] tracking-widest text-muted-foreground/60 uppercase">
            SYSTEM DESIGN STUDIO
          </div>
          <div className="h-12 w-3/4 rounded-lg bg-card/60 animate-pulse" />
          <div className="h-4 w-1/2 rounded bg-card/40 animate-pulse" />
          <div className="mt-8 h-32 w-full rounded-xl border border-border/40 bg-card/40 animate-pulse" />
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

  // Failed request persistence: live or restored from sessionStorage (D-348)
  const [failedRequest, setFailedRequest] = useState<StoredFailedRequest | null>(() => {
    if (isNew || typeof window === "undefined") return null;
    return loadIntakeState()?.failedRequest ?? null;
  });

  // Client-side validation errors (e.g. char limit), distinct from retryable server failures
  const [validationError, setValidationError] = useState<string | null>(null);
  const [questionAnswers, setQuestionAnswers] = useState<Record<number, QuestionState>>({});
  const [questionValidationError, setQuestionValidationError] = useState<string | null>(null);

  // Post-mount random 3 example prompts (before mount: 3 empty placeholder slots of identical height)
  const [randomPrompts, setRandomPrompts] = useState<ExamplePrompt[] | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRandomPrompts(pickRandomExamplePrompts(EXAMPLE_PROMPTS, 3));
  }, []);

  // Post-mount Waves background visibility: ON only on desktop (>= 768px) and not reduced motion (D-351, D-355)
  const showWaves = useStudioWavesGate();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  // Mutation for intake turns: NON-OPTIMISTIC (user message committed only in onSuccess)
  const intakeMutation = useMutation({
    mutationFn: async (text: string) => {
      return sendIntakeTurn({
        session_id: sessionId,
        text,
      });
    },
    onSuccess: (data, submittedText) => {
      setSessionId(data.session_id);
      setValidationError(null);
      setQuestionValidationError(null);
      setQuestionAnswers({});
      setFailedRequest(null);
      setInputText("");

      const userMsg: ChatMessage = {
        id: `msg-${Date.now()}-user`,
        sender: "user",
        text: submittedText,
      };

      if (data.status === "needs_info") {
        setMessages((prev) => [
          ...prev,
          userMsg,
          {
            id: `msg-${Date.now()}-assistant`,
            sender: "assistant",
            questions: data.questions,
          },
        ]);
      } else if (data.status === "ready" && data.brief) {
        setMessages((prev) => [...prev, userMsg]);
        setBrief(data.brief);
      }
    },
    onError: (err: unknown, submittedText) => {
      if (err instanceof ApiError) {
        if (err.status === 409 || err.code === "SESSION_CLOSED") {
          // Terminal non-retryable error
          setValidationError(
            "This design request is finished. Use New architecture to start another.",
          );
          setFailedRequest(null);
          return;
        }

        setFailedRequest({
          kind: "intake",
          message: err.message,
          text: submittedText,
        });
      } else {
        setFailedRequest({
          kind: "intake",
          message: err instanceof Error ? err.message : "An unexpected error occurred.",
          text: submittedText,
        });
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
      setFailedRequest(null);
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
        failedRequest: null,
      });
      router.push(`/design/${encodeURIComponent(data.id)}`);
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not produce a design that passes all checks.";
      setFailedRequest({
        kind: "design",
        message: msg,
      });
    },
  });

  // When navigated with ?new=1, clear storage and silently clean URL (D-193)
  useEffect(() => {
    if (isNew) {
      clearIntakeState();
      router.replace("/", { scroll: false });
    }
  }, [isNew, router]);

  // Persist updated state to sessionStorage (D-194, D-348)
  useEffect(() => {
    if (isNew) {
      return;
    }
    if (!sessionId && messages.length === 0 && !brief && !inputText && !failedRequest) {
      clearIntakeState();
      return;
    }
    saveIntakeState({
      sessionId,
      inputText,
      messages,
      brief,
      failedRequest,
    });
  }, [sessionId, inputText, messages, brief, failedRequest, isNew]);

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

  const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
  const isLastMsgAssistantWithQuestions =
    !brief &&
    lastMsg?.sender === "assistant" &&
    Boolean(lastMsg.questions && lastMsg.questions.length > 0);
  const activeQuestions = isLastMsgAssistantWithQuestions ? (lastMsg?.questions ?? null) : null;
  const hasInteractiveQuestions = Boolean(
    activeQuestions &&
      activeQuestions.length > 0 &&
      activeQuestions.some(
        (q) => Boolean(q.suggested_answer) || (q.options && q.options.length > 0)
      )
  );

  const composedText = useMemo(() => {
    if (!activeQuestions || activeQuestions.length === 0) return "";
    const lines: string[] = [];
    for (let i = 0; i < activeQuestions.length; i++) {
      const q = activeQuestions[i];
      if (!q) continue;
      const custom = questionAnswers[i]?.customText?.trim();
      const chip = questionAnswers[i]?.selectedChip;
      let ans = "";
      if (custom) {
        ans = sanitizeUserAnswer(custom);
      } else if (chip) {
        ans = sanitizeUserAnswer(chip);
      } else if (q.suggested_answer) {
        ans = formatSuggestedAnswerAssumption(q.suggested_answer);
      }
      lines.push(`Q: ${q.question}\nA: ${ans}`);
    }
    return lines.join("\n\n");
  }, [activeQuestions, questionAnswers]);

  const handleAnswerChange = useCallback((index: number, patch: Partial<QuestionState>) => {
    setQuestionValidationError(null);
    setQuestionAnswers((prev) => {
      const current = prev[index] ?? { customText: "", selectedChip: null };
      return {
        ...prev,
        [index]: { ...current, ...patch },
      };
    });
  }, []);

  const handleUseAllSuggestions = useCallback(() => {
    if (!activeQuestions) return;
    setQuestionValidationError(null);
    setQuestionAnswers((prev) => {
      const next = { ...prev };
      activeQuestions.forEach((q, idx) => {
        const current = next[idx];
        if (!current?.customText?.trim() && !current?.selectedChip && q.suggested_answer) {
          next[idx] = { customText: "", selectedChip: q.suggested_answer };
        }
      });
      return next;
    });
  }, [activeQuestions]);

  const handleSubmitQuestionAnswers = useCallback(() => {
    if (!activeQuestions || activeQuestions.length === 0 || intakeMutation.isPending) return;

    for (let i = 0; i < activeQuestions.length; i++) {
      const q = activeQuestions[i];
      if (!q) continue;
      const custom = questionAnswers[i]?.customText?.trim();
      const chip = questionAnswers[i]?.selectedChip;
      if (!custom && !chip && !q.suggested_answer) {
        setQuestionValidationError(`Please provide an answer for: "${q.question}"`);
        return;
      }
    }

    if (composedText.length > MAX_INPUT_CHARS) {
      return;
    }

    intakeMutation.mutate(composedText);
  }, [activeQuestions, questionAnswers, composedText, intakeMutation]);

  const handleSend = () => {
    if (intakeMutation.isPending) return;

    const trimmed = inputText.trim();

    if (trimmed.length < 1) {
      setValidationError("Input must be at least 1 character long.");
      return;
    }

    if (trimmed.length > MAX_INPUT_CHARS) {
      setValidationError(`Input must not exceed ${MAX_INPUT_CHARS} characters.`);
      return;
    }

    setValidationError(null);
    setFailedRequest(null);
    intakeMutation.mutate(sanitizeUserAnswer(trimmed));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!intakeMutation.isPending) {
        handleSend();
      }
    }
  };

  // Retry failed request: reads current textarea text for intake (D-348)
  const handleRetryFailedRequest = () => {
    if (intakeMutation.isPending || designMutation.isPending) return;

    if (failedRequest?.kind === "design" || designMutation.isError) {
      if (sessionId) {
        setFailedRequest(null);
        designMutation.mutate(sessionId);
      }
      return;
    }

    const textToRetry = inputText.trim() || failedRequest?.text?.trim() || "";
    if (textToRetry.length < 1) {
      setValidationError("Input must be at least 1 character long.");
      return;
    }
    if (textToRetry.length > MAX_INPUT_CHARS) {
      setValidationError(`Input must not exceed ${MAX_INPUT_CHARS} characters.`);
      return;
    }

    setValidationError(null);
    setFailedRequest(null);
    intakeMutation.mutate(sanitizeUserAnswer(textToRetry));
  };

  const handleSelectStarter = (promptText: string) => {
    setInputText(promptText);
    setValidationError(null);
    if (textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = promptText.length;
      textareaRef.current.selectionEnd = promptText.length;
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

  // Character counter display helper: static disclaimer at rest, live counter appended only when length >= 3200
  const counterText =
    inputText.length >= 3200
      ? `Plain language · Up to ${MAX_INPUT_CHARS.toLocaleString("en-US")} characters · ${inputText.length.toLocaleString("en-US")} / ${MAX_INPUT_CHARS.toLocaleString("en-US")}`
      : `Plain language · Up to ${MAX_INPUT_CHARS.toLocaleString("en-US")} characters`;

  // Failure message helper: live intake failure shows specific API message; after refresh shows exact mandated text
  const isPostRefreshIntakeError = Boolean(failedRequest && !intakeMutation.isError && !designMutation.isError);
  const failureAlertMessage = isPostRefreshIntakeError
    ? "The last request failed. Please retry."
    : failedRequest?.message || "The last request failed. Please retry.";

  return (
    <main className="relative isolate flex h-[100dvh] w-full flex-col overflow-hidden bg-page-bg text-foreground selection:bg-brand-accent selection:text-brand-accent-ink studio-grid-bg">
      {/* Shared Studio Background: Waves (desktop, non-reduced-motion) + static corner circuits (D-351, D-355) */}
      <StudioBackground
        showWaves={showWaves}
        wavesScope="full"
        wavesLayerTestId="home-waves-layer"
      />

      {/* Generation Loading Overlay (flat, no blur) */}
      {designMutation.isPending && <LoadingOverlay />}

      {/* Main Region: Empty Studio Hero OR Active Conversation Stream */}
      <div className="relative z-10 flex flex-1 flex-col overflow-y-auto px-4 py-6">
        {!hasMessagesOrBrief ? (
          /* Empty Studio Hero (Stage H-FIX / Reference Aesthetic) */
          <div className="my-auto flex flex-1 flex-col items-center justify-center text-center py-8">
            <div className="mx-auto flex w-full max-w-2xl flex-col items-center">
              {/* Mono studio tag in subtle capsule pill: no dot, no - 01 */}
              <div className="animate-studio-fade-up inline-flex items-center rounded-full border border-line bg-surface text-text-muted dark:border-white/10 dark:bg-[#161618] dark:text-muted-foreground/80 px-3.5 py-1 font-mono text-[11px] font-semibold tracking-widest uppercase">
                SYSTEM DESIGN STUDIO
              </div>

              {/* Headline: Plus_Jakarta_Sans, second line subtle sage gradient in dark, burnt orange gradient in light (D-347, D-387) */}
              <h1
                style={{ animationDelay: "60ms" }}
                className="animate-studio-fade-up mt-4 font-heading text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight text-foreground leading-[1.12]"
              >
                What are we
                <span className="block bg-gradient-to-r from-[#E87532] to-[#B94E25] dark:bg-gradient-to-b dark:from-[#d3e1dd] dark:via-[#b7c6c2] dark:to-[#98aba6] bg-clip-text text-transparent font-semibold">
                  building today?
                </span>
              </h1>

              {/* Subtitle */}
              <p
                style={{ animationDelay: "120ms" }}
                className="animate-studio-fade-up mt-3 max-w-lg text-sm text-text-muted dark:text-muted-foreground md:text-base leading-relaxed"
              >
                Start with an idea. We&apos;ll work through the technical details together.
              </p>

              {/* Inline Studio Composer Card */}
              <div
                style={{ animationDelay: "180ms" }}
                className="animate-studio-fade-up mt-8 w-full max-w-2xl text-left"
              >
                {/* Client validation error */}
                {validationError && (
                  <Alert
                    variant="destructive"
                    className="mb-3 rounded-xl border-destructive/60 bg-destructive/10 text-destructive-foreground"
                  >
                    <AlertCircle className="size-4" />
                    <AlertDescription className="text-sm font-medium">
                      {validationError}
                    </AlertDescription>
                  </Alert>
                )}

                {/* Live or Restored Request Failure Alert with Retry button */}
                {failedRequest && (
                  <Alert
                    variant="destructive"
                    className="mb-3 rounded-xl border-destructive/60 bg-destructive/10 text-destructive-foreground"
                  >
                    <AlertCircle className="size-4" />
                    <div className="flex flex-1 items-center justify-between gap-3">
                      <AlertDescription className="text-sm font-medium">
                        {failureAlertMessage}
                      </AlertDescription>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleRetryFailedRequest}
                        disabled={intakeMutation.isPending || designMutation.isPending}
                        className="gap-1.5 border-destructive/40 text-xs font-semibold hover:bg-destructive/20 shrink-0"
                      >
                        <RefreshCw className="size-3.5" />
                        Retry
                      </Button>
                    </div>
                  </Alert>
                )}

                <div className="relative w-full rounded-xl border border-[#E87532] bg-surface-input dark:border-white/10 dark:bg-[#161618] p-3 shadow-xs transition-colors focus-within:border-brand-accent/55 focus-within:ring-1 focus-within:ring-brand-accent/35">
                  <div className="flex items-start gap-2.5">
                    <Pencil className="size-4 text-text-muted dark:text-muted-foreground/60 shrink-0 mt-2 ml-1" />
                    <Textarea
                      ref={textareaRef}
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Describe the system you have in mind..."
                      disabled={intakeMutation.isPending}
                      rows={1}
                      className="min-h-[44px] max-h-40 resize-none border-0 bg-transparent p-1 text-sm text-foreground placeholder:text-text-muted dark:placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-0 md:text-base flex-1"
                    />
                  </div>

                  <div className="mt-2 flex items-center justify-between border-t border-line dark:border-border/40 px-1 pt-2">
                    <span className="font-mono text-[11px] text-text-muted dark:text-muted-foreground/70">
                      {counterText}
                    </span>

                    <Button
                      type="button"
                      onClick={handleSend}
                      disabled={intakeMutation.isPending || !inputText.trim()}
                      aria-label="Send"
                      className="size-8 rounded-lg bg-gradient-to-b from-[#E87532] to-[#B94E25] text-[#171717] dark:bg-none dark:bg-brand-accent dark:text-brand-accent-ink p-0 transition-colors hover:brightness-105 dark:hover:bg-brand-accent-hover disabled:opacity-40 disabled:bg-brand-accent/50 disabled:text-brand-accent-ink/60 flex items-center justify-center shrink-0"
                    >
                      <ArrowUp className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Starter Divider */}
              <div
                style={{ animationDelay: "240ms" }}
                className="animate-studio-fade-up my-7 flex items-center gap-3 w-full max-w-2xl text-[10px] font-mono tracking-widest text-rust dark:text-muted-foreground/60 uppercase"
              >
                <span className="flex-1 h-px bg-line dark:bg-border/40" />
                <span>NEED A STARTING POINT?</span>
                <span className="flex-1 h-px bg-line dark:bg-border/40" />
              </div>

              {/* Example Starter Buttons in ONE horizontal 3-column row on desktop (D-346) */}
              <div
                style={{ animationDelay: "240ms" }}
                className="animate-studio-fade-up w-full max-w-2xl grid grid-cols-1 md:grid-cols-3 gap-2.5"
              >
                {!randomPrompts
                  ? [0, 1, 2].map((slotIdx) => (
                      <div
                        key={`placeholder-slot-${slotIdx}`}
                        aria-hidden="true"
                        className="h-10 rounded-lg border border-line bg-surface dark:border-white/[0.09] dark:bg-[#151517]"
                      />
                    ))
                  : randomPrompts.map((starter) => {
                      const Icon = EXAMPLE_PROMPT_ICONS[starter.iconKey];
                      return (
                        <button
                          key={starter.id}
                          type="button"
                          onClick={() => handleSelectStarter(starter.prompt)}
                          className="group flex h-10 w-full items-center justify-between rounded-lg border border-line bg-surface dark:border-white/[0.09] dark:bg-[#151517] px-3 py-2 text-xs text-foreground/90 transition-colors hover:border-brand-accent/45 hover:bg-hover dark:hover:bg-[#191b1a] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-accent/60"
                        >
                          <div className="flex items-center gap-2 truncate min-w-0">
                            <Icon className="size-3.5 text-brand-accent dark:text-brand-accent/70 shrink-0 transition-colors" />
                            <span className="font-medium text-foreground/90 truncate">
                              {starter.title}
                            </span>
                          </div>
                          <ArrowUpRight className="size-3.5 text-text-muted dark:text-muted-foreground/50 group-hover:text-foreground shrink-0 transition-colors ml-1" />
                        </button>
                      );
                    })}
              </div>

              {/* Step Flow Guide */}
              <div
                style={{ animationDelay: "300ms" }}
                className="animate-studio-fade-up mt-8 font-mono text-[11px] tracking-widest text-text-muted dark:text-muted-foreground/50 uppercase select-none"
              >
                DESCRIBE → CLARIFY → GENERATE
              </div>
            </div>
          </div>
        ) : (
          /* Active Chat Stream */
          <div className="mx-auto w-full max-w-2xl space-y-6 pb-4">
            {/* Header label when messages are active: plain mono label, no dot */}
            <div className="flex justify-center pt-2">
              <div className="font-mono text-[11px] font-semibold tracking-widest text-text-muted dark:text-muted-foreground/80 uppercase">
                System Architect Session
              </div>
            </div>

            {/* Message Bubble History */}
            {messages.map((msg, msgIdx) => {
              const isLatestAssistant =
                msg.sender === "assistant" &&
                msgIdx === messages.length - 1 &&
                !brief;
              const showInteractive = isLatestAssistant && hasInteractiveQuestions;

              return (
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
                    className={`break-words rounded-xl px-4 py-2.5 text-sm ${
                      showInteractive
                        ? "w-full border border-border bg-card text-foreground"
                        : msg.sender === "user"
                          ? "max-w-[85%] bg-brand-accent font-medium text-brand-accent-ink"
                          : "max-w-[85%] border border-border bg-card text-foreground"
                    }`}
                  >
                    {msg.text && <p className="whitespace-pre-wrap">{msg.text}</p>}
                    {msg.questions && msg.questions.length > 0 && (
                      showInteractive ? (
                        <div className="pt-1">
                          <QuestionAnswerGroup
                            questions={msg.questions}
                            answers={questionAnswers}
                            onAnswerChange={handleAnswerChange}
                            onUseAllSuggestions={handleUseAllSuggestions}
                            onSubmit={handleSubmitQuestionAnswers}
                            isPending={intakeMutation.isPending}
                            validationError={questionValidationError}
                            composedLength={composedText.length}
                            maxChars={MAX_INPUT_CHARS}
                          />
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">
                            Please clarify the following:
                          </p>
                          <ul className="list-disc list-inside space-y-1">
                            {msg.questions.map((q, idx) => (
                              <li key={`q-${idx}`}>
                                {typeof q === "string" ? q : q.question}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )
                    )}
                  </div>
                </div>
              );
            })}

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
            {(designMutation.isError || failedRequest?.kind === "design") && (
              <Alert
                variant="destructive"
                className="rounded-xl border-destructive/60 bg-destructive/10 text-destructive-foreground"
              >
                <AlertCircle className="size-4" />
                <AlertTitle className="font-semibold">Generation Failed</AlertTitle>
                <AlertDescription className="mt-1 space-y-2 text-sm">
                  <p>
                    {designError?.message ||
                      failedRequest?.message ||
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
                      onClick={handleRetryFailedRequest}
                      disabled={designMutation.isPending}
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

      {/* Docked Bottom Chat Input Bar (only visible when in active dialogue mode) */}
      {hasMessagesOrBrief && !hasInteractiveQuestions && (
        <div className="relative z-10 shrink-0 border-t border-border bg-page-bg px-4 py-3">
          <div className="mx-auto w-full max-w-2xl space-y-2">
            {/* Validation Error Alert */}
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

            {/* In-dialogue intake retry alert */}
            {failedRequest?.kind === "intake" && (
              <Alert
                variant="destructive"
                className="rounded-xl border-destructive/60 bg-destructive/10 text-destructive-foreground"
              >
                <AlertCircle className="size-4" />
                <div className="flex flex-1 items-center justify-between gap-3">
                  <AlertDescription className="text-sm font-medium">
                    {failureAlertMessage}
                  </AlertDescription>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRetryFailedRequest}
                    disabled={intakeMutation.isPending}
                    className="gap-1.5 border-destructive/40 text-xs font-semibold hover:bg-destructive/20 shrink-0"
                  >
                    <RefreshCw className="size-3.5" />
                    Retry
                  </Button>
                </div>
              </Alert>
            )}

            <div className="relative w-full rounded-xl border border-border bg-card p-2.5 shadow-xs transition-colors focus-within:border-brand-accent/60 focus-within:ring-1 focus-within:ring-brand-accent/60">
              <Textarea
                ref={textareaRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe the system you have in mind..."
                disabled={intakeMutation.isPending}
                rows={1}
                className="min-h-[44px] max-h-40 resize-none border-0 bg-transparent p-1 text-sm text-foreground placeholder:text-text-muted dark:placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-0 md:text-base"
              />

              <div className="mt-1 flex items-center justify-between border-t border-border/40 px-1 pt-1.5">
                <span className="font-mono text-[11px] text-text-muted dark:text-muted-foreground/70">
                  {counterText}
                </span>

                <Button
                  type="button"
                  onClick={handleSend}
                  disabled={intakeMutation.isPending || !inputText.trim()}
                  aria-label="Send"
                  className="size-8 rounded-lg bg-gradient-to-b from-[#E87532] to-[#B94E25] text-[#171717] dark:bg-none dark:bg-brand-accent dark:text-brand-accent-ink p-0 transition-colors hover:brightness-105 dark:hover:bg-brand-accent-hover disabled:opacity-40 disabled:bg-brand-accent/50 disabled:text-brand-accent-ink/60 flex items-center justify-center shrink-0"
                >
                  <ArrowUp className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
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
