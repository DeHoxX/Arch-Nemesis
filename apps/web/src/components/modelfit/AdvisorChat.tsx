"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Send, Square, Bot, User, Wrench, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { streamAdvisorChat, type ChatMessage, type SSEEventData } from "@/lib/modelfit/api";

interface AdvisorChatProps {
  initialRepoId?: string;
  initialPrompt?: string;
}

interface ToolStatus {
  name: string;
  args?: Record<string, unknown>;
  status: "calling" | "completed" | "failed";
}

/**
 * Plain text formatter that separates fenced code blocks without dangerouslySetInnerHTML.
 * Adheres strictly to Rule 5: User and LLM text are untrusted.
 */
function renderPlainTextWithCode(content: string) {
  // Regex to split on ```code``` fences
  const parts = content.split(/(```[\s\S]*?```)/g);

  return parts.map((part, idx) => {
    if (part.startsWith("```") && part.endsWith("```")) {
      // Remove opening and closing backticks and optional language label on first line
      const lines = part.slice(3, -3).split("\n");
      const code = (lines.length > 1 ? lines.slice(1) : lines).join("\n");
      return (
        <pre
          key={idx}
          className="my-2 rounded-md bg-muted/80 p-3 font-mono text-xs text-foreground overflow-x-auto border border-border/50"
        >
          <code>{code}</code>
        </pre>
      );
    }
    // Plain text block
    return (
      <span key={idx} className="whitespace-pre-wrap leading-relaxed">
        {part}
      </span>
    );
  });
}

export function AdvisorChat({ initialRepoId, initialPrompt }: AdvisorChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [currentTool, setCurrentTool] = useState<ToolStatus | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, currentTool]);

  const sendMessage = useCallback(
    async (textToSend: string) => {
      if (!textToSend.trim() || isStreaming) return;

      const userMsg: ChatMessage = { role: "user", content: textToSend };
      const updatedMessages = [...messages, userMsg];
      setMessages(updatedMessages);
      setInput("");
      setErrorMessage(null);
      setIsStreaming(true);
      setCurrentTool(null);

      // Prepare assistant placeholder message
      const assistantIndex = updatedMessages.length;
      const initialAssistantMsg: ChatMessage = { role: "assistant", content: "" };
      setMessages([...updatedMessages, initialAssistantMsg]);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      let accumulatedText = "";

      try {
        await streamAdvisorChat(
          updatedMessages,
          (event: SSEEventData) => {
            if (event.event === "message") {
              const chunk =
                ((event.data.text ?? event.data.delta) as string) || "";
              accumulatedText += chunk;
              setMessages((prev) => {
                const next = [...prev];
                if (next[assistantIndex]) {
                  next[assistantIndex] = {
                    role: "assistant",
                    content: accumulatedText,
                  };
                }
                return next;
              });
            } else if (event.event === "tool_call") {
              setCurrentTool({
                name: String(event.data.name || "tool"),
                args: event.data.args as Record<string, unknown>,
                status: "calling",
              });
            } else if (event.event === "tool_result") {
              setCurrentTool((prev) =>
                prev ? { ...prev, status: "completed" } : null
              );
            } else if (event.event === "error") {
              const err = String(event.data.message || "An error occurred");
              setErrorMessage(err);
            } else if (event.event === "done") {
              setCurrentTool(null);
            }
          },
          controller.signal
        );
      } catch (err: unknown) {
        if (controller.signal.aborted) {
          // User clicked cancel
        } else {
          const msg = err instanceof Error ? err.message : "Chat streaming failed";
          setErrorMessage(msg);
        }
      } finally {
        setIsStreaming(false);
        setCurrentTool(null);
        abortControllerRef.current = null;
      }
    },
    [isStreaming, messages]
  );

  // Initial kick-off if initialPrompt or initialRepoId is provided
  useEffect(() => {
    const timer = setTimeout(() => {
      if (initialPrompt && initialPrompt.trim().length > 0) {
        sendMessage(initialPrompt.trim());
      } else if (initialRepoId && initialRepoId.trim().length > 0) {
        const prompt = `Can I run ${initialRepoId.trim()} on typical hardware, and what are its memory requirements?`;
        sendMessage(prompt);
      }
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <div className="flex flex-col h-[750px] max-h-[85vh] rounded-xl border border-border/80 bg-card shadow-sm text-card-foreground">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-3 bg-card/60">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <Bot className="size-4" />
          </div>
          <div>
            <h2 className="font-semibold text-sm text-foreground">
              ModelFit Advisor
            </h2>
            <p className="text-[11px] text-muted-foreground font-mono">
              Hardware verification, memory math & open model recommendations
            </p>
          </div>
        </div>

        {initialRepoId && (
          <div className="text-xs font-mono px-2.5 py-1 rounded-md bg-surface-elevated border border-border/60 text-muted-foreground">
            Focus: <span className="text-foreground font-semibold">{initialRepoId}</span>
          </div>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-3 px-4">
            <Bot className="size-10 text-muted-foreground/60" />
            <div className="space-y-1">
              <h3 className="font-medium text-sm text-foreground">
                Ask about open-source models & hardware
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm">
                Get grounded memory requirements, verify GPU fit, or search for recommended models for your workload.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center pt-2 max-w-md">
              <button
                type="button"
                onClick={() =>
                  sendMessage("What 7B or 8B models can run on an RTX 3060 12GB?")
                }
                className="text-xs font-mono rounded-md border border-border/70 bg-card/40 px-2.5 py-1.5 text-muted-foreground hover:text-foreground hover:bg-card transition-colors text-left"
              >
                &ldquo;What models run on an RTX 3060 12GB?&rdquo;
              </button>
              <button
                type="button"
                onClick={() =>
                  sendMessage("Estimate memory for Qwen/Qwen2.5-7B at 8k context in 4-bit")
                }
                className="text-xs font-mono rounded-md border border-border/70 bg-card/40 px-2.5 py-1.5 text-muted-foreground hover:text-foreground hover:bg-card transition-colors text-left"
              >
                &ldquo;Estimate Qwen2.5-7B at 8k context in 4-bit&rdquo;
              </button>
              <button
                type="button"
                onClick={() =>
                  sendMessage("Recommend open models for code generation on 24GB VRAM")
                }
                className="text-xs font-mono rounded-md border border-border/70 bg-card/40 px-2.5 py-1.5 text-muted-foreground hover:text-foreground hover:bg-card transition-colors text-left"
              >
                &ldquo;Recommend models for code generation on 24GB VRAM&rdquo;
              </button>
            </div>
          </div>
        )}

        {messages.map((m, idx) => {
          const isUser = m.role === "user";
          return (
            <div
              key={idx}
              className={`flex gap-3 text-xs ${
                isUser ? "justify-end" : "justify-start"
              }`}
            >
              {!isUser && (
                <div className="size-7 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 mt-0.5">
                  <Bot className="size-3.5" />
                </div>
              )}

              <div
                className={`max-w-[80%] rounded-xl px-4 py-3 shadow-sm ${
                  isUser
                    ? "bg-primary text-primary-foreground font-medium"
                    : "bg-surface-elevated border border-border/60 text-card-foreground"
                }`}
              >
                {renderPlainTextWithCode(m.content)}
              </div>

              {isUser && (
                <div className="size-7 rounded-md bg-muted border border-border/60 flex items-center justify-center text-muted-foreground shrink-0 mt-0.5">
                  <User className="size-3.5" />
                </div>
              )}
            </div>
          );
        })}

        {/* Live tool call status chip */}
        {currentTool && (
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground bg-muted/40 border border-border/40 rounded-md px-3 py-1.5 w-fit">
            <Wrench className="size-3.5 animate-spin text-primary" />
            <span>
              Executing verified tool:{" "}
              <strong className="text-foreground">{currentTool.name}</strong>
              {currentTool.status === "completed" && " (finished)"}
            </span>
          </div>
        )}

        {errorMessage && (
          <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3">
            <AlertCircle className="size-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-border/60 p-4 bg-card/60 flex gap-2 items-end"
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
          placeholder="Ask the advisor about model memory, GPU specs, or recommendations..."
          className="min-h-[44px] max-h-32 text-xs font-mono bg-surface-input border-border/80 resize-none flex-1"
          rows={1}
          disabled={isStreaming}
        />

        {isStreaming ? (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleStop}
            className="h-10 px-3 font-mono text-xs"
          >
            <Square className="size-3.5 mr-1" />
            Stop
          </Button>
        ) : (
          <Button
            type="submit"
            size="sm"
            disabled={!input.trim()}
            className="h-10 px-3 font-mono text-xs font-semibold"
          >
            <Send className="size-3.5 mr-1" />
            Send
          </Button>
        )}
      </form>
    </div>
  );
}
