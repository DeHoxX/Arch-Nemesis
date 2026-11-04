import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ChatMessageItem } from "@/lib/types";
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
});
