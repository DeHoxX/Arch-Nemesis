import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ChatMessageItem, SuggestionItemResponse } from "@/lib/types";
import { RefinePanel } from "./RefinePanel";

describe("RefinePanel", () => {
  const hostileMessageText = "<script>alert('xss-chat')</script>";
  const mockMessages: ChatMessageItem[] = [
    {
      id: "msg-1",
      role: "user",
      text: "Add an audit logger before the final sink",
      created_at: "2026-11-04T12:00:00Z",
    },
    {
      id: "msg-2",
      role: "assistant",
      text: hostileMessageText,
      created_at: "2026-11-04T12:00:02Z",
    },
  ];

  it("renders title, counters, messages in plain text, and handles Enter vs Shift+Enter", async () => {
    const user = userEvent.setup();
    const handleSend = vi.fn();

    render(
      <RefinePanel
        messages={mockMessages}
        turnsUsed={3}
        maxTurns={20}
        versionsCount={2}
        maxVersions={15}
        onSendMessage={handleSend}
      />,
    );

    // Title and counters
    expect(screen.getByText("Refine this design")).toBeDefined();

    // Counter spans query by textContent normalising whitespace
    const counterTurns = screen.getByText(
      (_, el) =>
        el?.tagName.toLowerCase() === "span" &&
        el.textContent?.replace(/\s+/g, " ").trim() === "Change requests used: 3 of 20",
    );
    expect(counterTurns).toBeDefined();

    const counterVersions = screen.getByText(
      (_, el) =>
        el?.tagName.toLowerCase() === "span" &&
        el.textContent?.replace(/\s+/g, " ").trim() === "Versions: 2 of 15",
    );
    expect(counterVersions).toBeDefined();

    // Real absence check: cap warning banners must not exist when within limits
    expect(screen.queryByText(/reached the limit of/)).toBeNull();

    // Plain text verification: hostile script rendered literally
    expect(screen.getByText(hostileMessageText)).toBeDefined();
    expect(document.querySelector("script")).toBeNull();

    // Textarea input and live character counter
    const textarea = screen.getByLabelText("Refinement instruction input") as HTMLTextAreaElement;
    expect(textarea).toBeDefined();
    expect(screen.getByText("0/1000")).toBeDefined();

    const sendBtn = screen.getByLabelText("Send refinement request") as HTMLButtonElement;
    expect(sendBtn.disabled).toBe(true);

    // Type text and observe live counter
    await user.type(textarea, "Add caching to database");
    expect(screen.getByText("23/1000")).toBeDefined();
    expect(sendBtn.disabled).toBe(false);

    // Shift+Enter creates a newline and does NOT fire send
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    expect(handleSend).not.toHaveBeenCalled();

    // Enter without Shift fires send and clears input
    await user.keyboard("{Enter}");
    expect(handleSend).toHaveBeenCalledWith("Add caching to database");
    expect(screen.getByText("0/1000")).toBeDefined();
  });

  it("enforces disabled states on sending, historical version, and caps", () => {
    const handleSend = vi.fn();

    // 1. Sending state
    const { rerender } = render(
      <RefinePanel
        messages={mockMessages}
        turnsUsed={3}
        versionsCount={2}
        isSending={true}
        onSendMessage={handleSend}
      />,
    );
    const inputSending = screen.getByLabelText("Refinement instruction input") as HTMLTextAreaElement;
    expect(inputSending.disabled).toBe(true);

    // 2. Viewing historical version
    rerender(
      <RefinePanel
        messages={mockMessages}
        turnsUsed={3}
        versionsCount={2}
        isViewingHistorical={true}
        onSendMessage={handleSend}
      />,
    );
    const inputHistorical = screen.getByLabelText("Refinement instruction input") as HTMLTextAreaElement;
    expect(inputHistorical.disabled).toBe(true);
    expect(
      screen.getByText("Refinement is only available on the latest version."),
    ).toBeDefined();
    expect(screen.queryByText(/reached the limit of/)).toBeNull();

    // 3. Turns cap reached (BUILD_PLAN.md:545 exact text)
    rerender(
      <RefinePanel
        messages={mockMessages}
        turnsUsed={20}
        maxTurns={20}
        versionsCount={2}
        onSendMessage={handleSend}
      />,
    );
    const inputTurnsCapped = screen.getByLabelText("Refinement instruction input") as HTMLTextAreaElement;
    expect(inputTurnsCapped.disabled).toBe(true);
    expect(
      screen.getByText(
        "This design has reached the limit of 20 change requests. Please contact our team to continue.",
      ),
    ).toBeDefined();
    expect(screen.queryByText(/reached the limit of 15 versions/)).toBeNull();

    // 4. Versions cap reached (BUILD_PLAN.md:545 exact text)
    rerender(
      <RefinePanel
        messages={mockMessages}
        turnsUsed={5}
        versionsCount={15}
        maxVersions={15}
        onSendMessage={handleSend}
      />,
    );
    const inputVersionsCapped = screen.getByLabelText("Refinement instruction input") as HTMLTextAreaElement;
    expect(inputVersionsCapped.disabled).toBe(true);
    expect(
      screen.getByText(
        "This design has reached the limit of 15 versions. Please contact our team to continue.",
      ),
    ).toBeDefined();
  });

  it("renders 'What can we add or remove?' button and handles onAskSuggestions", async () => {
    const user = userEvent.setup();
    const handleAsk = vi.fn();

    render(
      <RefinePanel
        messages={mockMessages}
        turnsUsed={0}
        versionsCount={1}
        onSendMessage={vi.fn()}
        onAskSuggestions={handleAsk}
      />,
    );

    const askBtn = screen.getByRole("button", { name: "Request architectural suggestions" });
    expect(askBtn).toBeDefined();
    expect(askBtn.textContent).toContain("What can we add or remove?");

    await user.click(askBtn);
    expect(handleAsk).toHaveBeenCalledTimes(1);
  });

  it("renders suggestions with badge, hostile text in plain text, and calls onApplySuggestion with suggestion object", async () => {
    const user = userEvent.setup();
    const handleApply = vi.fn();
    const hostileSuggestion: SuggestionItemResponse = {
      patch_id: "patch-sugg-1",
      title: "<img src=x onerror=alert(1)> Add rate limiter",
      reason: "<script>alert('xss-reason')</script> Protect downstream APIs",
      status: "proposed",
      diff: {
        added_nodes: ["rate_limiter"],
        removed_nodes: [],
        changed_nodes: [],
        added_edges: [],
        removed_edges: [],
        changed_edges: [],
        added_constraints: [],
        removed_constraints: [],
        changed_constraints: [],
        entry_changed: false,
        exit_changed: false,
      },
      preview_spec: null,
      issues: [],
    };

    render(
      <RefinePanel
        messages={mockMessages}
        turnsUsed={0}
        versionsCount={1}
        onSendMessage={vi.fn()}
        suggestions={[hostileSuggestion]}
        onApplySuggestion={handleApply}
      />,
    );

    // Badge
    expect(screen.getByText("Suggestion (opinion, not verified)")).toBeDefined();

    // Plain text verification: title and reason are plain text, no malicious elements created
    expect(screen.getByText("<img src=x onerror=alert(1)> Add rate limiter")).toBeDefined();
    expect(screen.getByText("<script>alert('xss-reason')</script> Protect downstream APIs")).toBeDefined();
    expect(document.querySelector("img[src='x']")).toBeNull();
    expect(document.querySelector("script")).toBeNull();

    // Apply button
    const applyBtn = screen.getByRole("button", {
      name: "Apply suggestion: <img src=x onerror=alert(1)> Add rate limiter",
    });
    expect(applyBtn).toBeDefined();

    await user.click(applyBtn);
    expect(handleApply).toHaveBeenCalledTimes(1);
    expect(handleApply).toHaveBeenCalledWith(hostileSuggestion);
  });

  it("renders discarded note when discardedCount > 0 even when suggestions list is empty", () => {
    render(
      <RefinePanel
        messages={mockMessages}
        turnsUsed={0}
        versionsCount={1}
        onSendMessage={vi.fn()}
        suggestions={[]}
        discardedCount={3}
      />,
    );

    expect(screen.getByText("3 suggestions were discarded because they broke a rule.")).toBeDefined();
  });

  it("disables 'What can we add or remove?' button when sending, viewing historical, turns capped, or patch pending", () => {
    const handleAsk = vi.fn();

    // 1. Normal state -> enabled
    const { rerender } = render(
      <RefinePanel
        messages={mockMessages}
        turnsUsed={0}
        versionsCount={1}
        onSendMessage={vi.fn()}
        onAskSuggestions={handleAsk}
      />,
    );
    const askBtn = screen.getByRole("button", { name: "Request architectural suggestions" }) as HTMLButtonElement;
    expect(askBtn.disabled).toBe(false);

    // 2. Sending state -> disabled
    rerender(
      <RefinePanel
        messages={mockMessages}
        turnsUsed={0}
        versionsCount={1}
        isSending={true}
        onSendMessage={vi.fn()}
        onAskSuggestions={handleAsk}
      />,
    );
    expect(askBtn.disabled).toBe(true);

    // 3. Historical version -> disabled
    rerender(
      <RefinePanel
        messages={mockMessages}
        turnsUsed={0}
        versionsCount={1}
        isViewingHistorical={true}
        onSendMessage={vi.fn()}
        onAskSuggestions={handleAsk}
      />,
    );
    expect(askBtn.disabled).toBe(true);

    // 4. Turns capped -> disabled
    rerender(
      <RefinePanel
        messages={mockMessages}
        turnsUsed={20}
        maxTurns={20}
        versionsCount={1}
        onSendMessage={vi.fn()}
        onAskSuggestions={handleAsk}
      />,
    );
    expect(askBtn.disabled).toBe(true);

    // 5. Patch pending -> disabled
    rerender(
      <RefinePanel
        messages={mockMessages}
        turnsUsed={0}
        versionsCount={1}
        hasPendingPatch={true}
        onSendMessage={vi.fn()}
        onAskSuggestions={handleAsk}
      />,
    );
    expect(askBtn.disabled).toBe(true);
  });

  it("renders error message and Retry button when suggestionsError is present", async () => {
    const user = userEvent.setup();
    const handleAsk = vi.fn();

    render(
      <RefinePanel
        messages={mockMessages}
        turnsUsed={0}
        versionsCount={1}
        onSendMessage={vi.fn()}
        suggestionsError="Suggestions are temporarily unavailable. Please try again."
        onAskSuggestions={handleAsk}
      />,
    );

    expect(screen.getByText("Suggestions are temporarily unavailable. Please try again.")).toBeDefined();

    const retryBtn = screen.getByRole("button", { name: "Retry" });
    expect(retryBtn).toBeDefined();

    await user.click(retryBtn);
    expect(handleAsk).toHaveBeenCalledTimes(1);
  });

  it("renders controlled draft prop in textarea and calls onDraftChange when typing", async () => {
    const user = userEvent.setup();
    const handleDraftChange = vi.fn();

    const { rerender } = render(
      <RefinePanel
        messages={mockMessages}
        turnsUsed={0}
        versionsCount={1}
        onSendMessage={vi.fn()}
        draft="Initial draft from node shortcut"
        onDraftChange={handleDraftChange}
      />,
    );

    const textarea = screen.getByLabelText("Refinement instruction input") as HTMLTextAreaElement;
    expect(textarea.value).toBe("Initial draft from node shortcut");

    // Typing calls onDraftChange
    await user.type(textarea, "!");
    expect(handleDraftChange).toHaveBeenCalledWith("Initial draft from node shortcut!");

    // Rerendering with updated draft reflects in textarea
    rerender(
      <RefinePanel
        messages={mockMessages}
        turnsUsed={0}
        versionsCount={1}
        onSendMessage={vi.fn()}
        draft="Updated draft"
        onDraftChange={handleDraftChange}
      />,
    );
    expect(textarea.value).toBe("Updated draft");
  });

  it("renders nothing for the turns counter when turnsUsed is undefined (loading state)", () => {
    render(
      <RefinePanel
        messages={mockMessages}
        versionsCount={1}
        onSendMessage={vi.fn()}
      />,
    );

    expect(screen.queryByText(/Change requests used:/)).toBeNull();
    const counterVersions = screen.getByText(
      (_, el) =>
        el?.tagName.toLowerCase() === "span" &&
        el.textContent?.replace(/\s+/g, " ").trim() === "Versions: 1 of 15",
    );
    expect(counterVersions).toBeDefined();
  });

  it("updates turns counter when turnsUsed prop updates (e.g. after suggestions)", () => {
    const { rerender } = render(
      <RefinePanel
        messages={mockMessages}
        turnsUsed={12}
        maxTurns={20}
        versionsCount={1}
        onSendMessage={vi.fn()}
      />,
    );

    const counterTurns12 = screen.getByText(
      (_, el) =>
        el?.tagName.toLowerCase() === "span" &&
        el.textContent?.replace(/\s+/g, " ").trim() === "Change requests used: 12 of 20",
    );
    expect(counterTurns12).toBeDefined();

    rerender(
      <RefinePanel
        messages={mockMessages}
        turnsUsed={13}
        maxTurns={20}
        versionsCount={1}
        onSendMessage={vi.fn()}
      />,
    );

    const counterTurns13 = screen.getByText(
      (_, el) =>
        el?.tagName.toLowerCase() === "span" &&
        el.textContent?.replace(/\s+/g, " ").trim() === "Change requests used: 13 of 20",
    );
    expect(counterTurns13).toBeDefined();
  });
});
