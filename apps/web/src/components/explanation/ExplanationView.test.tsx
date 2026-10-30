import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ExplanationView } from "./ExplanationView";
import type { Explanation } from "@/lib/types";

const mockLlmExplanation: Explanation = {
  overview: "This system processes incoming telemetry and persists it safely.",
  flow: [
    { step: 1, node_id: "node_a", node_name: "Ingest Gateway", text: "Accepts HTTP traffic." },
    { step: 2, node_id: "node_b", node_name: "Analysis Worker", text: "Extracts telemetry." },
  ],
  parts: [
    { node_id: "node_a", node_name: "Ingest Gateway", text: "Provides public ingress." },
    { node_id: "node_b", node_name: "Analysis Worker", text: "Executes ML scoring." },
  ],
  checks: [
    { constraint_id: "c1", text: "All inter-service traffic must be encrypted via TLS." },
  ],
  models: {
    nodes: [{ id: "node_b", name: "Analysis Worker" }],
    text: "Parts that use an AI model: Analysis Worker.",
  },
  source: "llm",
};

const mockFallbackExplanation: Explanation = {
  ...mockLlmExplanation,
  source: "fallback",
};

describe("ExplanationView Component", () => {
  it("renders the 5 required headings in exact order", () => {
    render(<ExplanationView explanation={mockLlmExplanation} />);

    const headings = screen.getAllByRole("heading", { level: 3 });
    const headingTexts = headings.map((h) => h.textContent?.trim());

    expect(headingTexts).toEqual([
      "Overview",
      "How a request flows",
      "Each part",
      "Why the checks exist",
      "Where AI models are used",
    ]);
  });

  it("renders fallback note only when source is fallback", () => {
    const { rerender } = render(<ExplanationView explanation={mockLlmExplanation} />);
    expect(
      screen.queryByText("Basic explanation: the written version did not pass our checks.")
    ).toBeNull();

    rerender(<ExplanationView explanation={mockFallbackExplanation} />);
    expect(
      screen.getByText("Basic explanation: the written version did not pass our checks.")
    ).toBeDefined();
  });

  it("renders hostile strings literally without executing scripts or parsing markdown", () => {
    const hostileExplanation: Explanation = {
      overview: "<script>alert('xss')</script> **not bold**",
      flow: [
        {
          step: 1,
          node_id: "hostile_node",
          node_name: "<img src=x onerror=alert(1)>",
          text: "<div id='injected'>injected</div>",
        },
      ],
      parts: [
        {
          node_id: "hostile_node",
          node_name: "<iframe src='javascript:alert(1)'></iframe>",
          text: "plain text & symbols < > \" '",
        },
      ],
      checks: [
        {
          constraint_id: "c_bad",
          text: "<svg/onload=alert(1)>",
        },
      ],
      models: {
        nodes: [],
        text: "<b>bold</b> <script>",
      },
      source: "llm",
    };

    render(<ExplanationView explanation={hostileExplanation} />);

    // Assert that scripts, images, and iframes are not created in DOM
    expect(document.querySelector("script[src]")).toBeNull();
    expect(document.querySelector("iframe")).toBeNull();
    expect(document.getElementById("injected")).toBeNull();

    // Assert literal text representation
    expect(screen.getByText(/<script>alert\('xss'\)<\/script>/)).toBeDefined();
    expect(screen.getByText(/\*\*not bold\*\*/)).toBeDefined();
    expect(screen.getByText(/<svg\/onload=alert\(1\)>/)).toBeDefined();
    expect(screen.getByText(/<b>bold<\/b> <script>/)).toBeDefined();
  });

  it("renders loading text exactly as specified", () => {
    render(<ExplanationView isLoading={true} />);

    expect(screen.getByText("Writing the explanation...")).toBeDefined();
    expect(screen.getByRole("status", { name: "Loading explanation" })).toBeDefined();
  });

  it("renders error message and interactive Retry button", async () => {
    const onRetry = vi.fn();
    const testError = new Error("Custom network timeout failure");

    render(<ExplanationView error={testError} onRetry={onRetry} />);

    expect(screen.getByText("Custom network timeout failure")).toBeDefined();
    const retryButton = screen.getByRole("button", { name: "Retry" });
    expect(retryButton).toBeDefined();

    const user = userEvent.setup();
    await user.click(retryButton);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

