import React, { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  QuestionAnswerGroup,
  type QuestionState,
} from "./QuestionAnswerGroup";
import type { IntakeQuestion } from "@/lib/types";

describe("QuestionAnswerGroup", () => {
  const sampleQuestions: IntakeQuestion[] = [
    {
      question: "What is your target request volume?",
      suggested_answer: "100 req/sec",
      options: ["10 req/sec", "100 req/sec", "1,000 req/sec"],
    },
    {
      question: "Which cloud provider do you deploy on?",
      suggested_answer: "AWS",
      options: ["AWS", "GCP", "Azure"],
    },
  ];

  function TestHarness({
    questions = sampleQuestions,
    onSubmit = vi.fn(),
  }: {
    questions?: IntakeQuestion[];
    onSubmit?: () => void;
  }) {
    const [answers, setAnswers] = useState<Record<number, QuestionState>>({});

    return (
      <QuestionAnswerGroup
        questions={questions}
        answers={answers}
        onAnswerChange={(idx, patch) => {
          setAnswers((prev) => ({
            ...prev,
            [idx]: { ...(prev[idx] ?? { customText: "", selectedChip: null }), ...patch },
          }));
        }}
        onUseAllSuggestions={() => {
          setAnswers((prev) => {
            const next = { ...prev };
            questions.forEach((q, idx) => {
              const current = next[idx];
              if (!current?.customText?.trim() && !current?.selectedChip && q.suggested_answer) {
                next[idx] = { customText: "", selectedChip: q.suggested_answer };
              }
            });
            return next;
          });
        }}
        onSubmit={onSubmit}
        isPending={false}
        validationError={null}
        composedLength={120}
        maxChars={4000}
      />
    );
  }

  it("renders questions with option chips and suggested answer pill", () => {
    render(<TestHarness />);

    expect(screen.getByText("What is your target request volume?")).toBeDefined();
    expect(screen.getByText("Which cloud provider do you deploy on?")).toBeDefined();
    expect(screen.getAllByText("Suggested").length).toBe(2);
    expect(screen.getByRole("button", { name: /Suggested 100 req\/sec/i })).toBeDefined();
    expect(screen.getByRole("button", { name: "1,000 req/sec" })).toBeDefined();
    expect(screen.getByRole("button", { name: "GCP" })).toBeDefined();
  });

  it("clicking option chip selects it and highlights with aria-pressed", async () => {
    const user = userEvent.setup();
    render(<TestHarness />);

    const chip = screen.getByRole("button", { name: "1,000 req/sec" });
    expect(chip.getAttribute("aria-pressed")).toBe("false");

    await user.click(chip);
    expect(chip.getAttribute("aria-pressed")).toBe("true");
  });

  it("typing into custom answer input overrides chip selection", async () => {
    const user = userEvent.setup();
    render(<TestHarness />);

    const chip = screen.getByRole("button", { name: "1,000 req/sec" });
    await user.click(chip);
    expect(chip.getAttribute("aria-pressed")).toBe("true");

    const input = screen.getByLabelText("Your answer for: What is your target request volume?");
    await user.type(input, "50,000 peak QPS");

    // Chip should no longer be pressed because custom text overrides it
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    expect((input as HTMLInputElement).value).toBe("50,000 peak QPS");
  });

  it('"Use suggested answers" button fills all unanswered questions with suggestion', async () => {
    const user = userEvent.setup();
    render(<TestHarness />);

    const batchButton = screen.getByRole("button", { name: "Use suggested answers" });
    await user.click(batchButton);

    const q1SuggestedChip = screen.getByRole("button", { name: /Suggested 100 req\/sec/i });
    const q2SuggestedChip = screen.getByRole("button", { name: /Suggested AWS/i });

    expect(q1SuggestedChip.getAttribute("aria-pressed")).toBe("true");
    expect(q2SuggestedChip.getAttribute("aria-pressed")).toBe("true");
  });

  it("keyboard navigation works on chips via Enter and Space", async () => {
    const user = userEvent.setup();
    render(<TestHarness />);

    const gcpChip = screen.getByRole("button", { name: "GCP" });
    gcpChip.focus();
    expect(document.activeElement).toBe(gcpChip);

    await user.keyboard("{Enter}");
    expect(gcpChip.getAttribute("aria-pressed")).toBe("true");

    await user.keyboard(" ");
    expect(gcpChip.getAttribute("aria-pressed")).toBe("false");
  });

  it("suggested equals options[0] shows one chip (D-371)", () => {
    const questions: IntakeQuestion[] = [
      {
        question: "Select channel:",
        suggested_answer: "Email, Web Chat, and API",
        options: ["Email, Web Chat, and API", "Web Chat only"],
      },
    ];
    render(<TestHarness questions={questions} />);

    // Should only have one chip with "Email, Web Chat, and API" (the Suggested one)
    const chips = screen.getAllByRole("button", { name: /Email, Web Chat, and API/i });
    expect(chips).toHaveLength(1);
    expect(screen.getByText("Suggested")).toBeDefined();
    expect(screen.getByRole("button", { name: "Web Chat only" })).toBeDefined();
  });

  it("case/whitespace variant of suggested in options is deduped (D-371)", () => {
    const questions: IntakeQuestion[] = [
      {
        question: "Select volume:",
        suggested_answer: "50 concurrent agents",
        options: ["  50 Concurrent Agents  ", "100 concurrent agents"],
      },
    ];
    render(<TestHarness questions={questions} />);

    const chips = screen.getAllByRole("button", { name: /50 concurrent agents/i });
    expect(chips).toHaveLength(1);
    expect(screen.getByRole("button", { name: "100 concurrent agents" })).toBeDefined();
  });

  it("duplicate options inside options array itself are deduped (D-371)", () => {
    const questions: IntakeQuestion[] = [
      {
        question: "Database choice:",
        suggested_answer: "PostgreSQL",
        options: ["DynamoDB", "  dynamodb  ", "MongoDB"],
      },
    ];
    render(<TestHarness questions={questions} />);

    const dynamoChips = screen.getAllByRole("button", { name: /DynamoDB/i });
    expect(dynamoChips).toHaveLength(1);
    expect(screen.getByRole("button", { name: "MongoDB" })).toBeDefined();
    expect(screen.getByRole("button", { name: /Suggested PostgreSQL/i })).toBeDefined();
  });

  it("suggestion not in options still shows both suggestion and options (D-371)", () => {
    const questions: IntakeQuestion[] = [
      {
        question: "Hosting model:",
        suggested_answer: "Managed Serverless",
        options: ["Self-hosted Kubernetes", "Dedicated VMs"],
      },
    ];
    render(<TestHarness questions={questions} />);

    expect(screen.getByRole("button", { name: /Suggested Managed Serverless/i })).toBeDefined();
    expect(screen.getByRole("button", { name: "Self-hosted Kubernetes" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Dedicated VMs" })).toBeDefined();
  });
});
