import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FlowPlaybackBar } from "./FlowPlaybackBar";
import type { FlowPlaybackStep } from "./playback";

const mockSteps: FlowPlaybackStep[] = [
  {
    stepNumber: 1,
    edgeId: "e-src-proc-0",
    from: "src",
    to: "proc",
    fromName: "Source Ingest",
    toName: "Processor",
    flows: "telemetry",
    condition: null,
    description: "Source Ingest → Processor: telemetry",
  },
  {
    stepNumber: 2,
    edgeId: "e-proc-sink-1",
    from: "proc",
    to: "sink",
    fromName: "Processor",
    toName: "Sink Store",
    flows: "stored records",
    condition: "valid == true",
    description: "Processor → Sink Store: stored records\nWhen: valid == true",
  },
];

describe("FlowPlaybackBar Component (Stage 1C, D-329)", () => {
  it("renders idle state with 'Ready · {N} flows' and honest caption when currentStepIndex is null", () => {
    const handleStart = vi.fn();
    render(
      <FlowPlaybackBar
        steps={mockSteps}
        currentStepIndex={null}
        onStart={handleStart}
        onNext={vi.fn()}
        onBack={vi.fn()}
        onRestart={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    const readyText = screen.getByText(/Ready · 2 flows/);
    expect(readyText).toBeDefined();
    expect(readyText.textContent?.trim().length).toBeGreaterThan(0);

    const restartBtn = screen.getByRole("button", { name: "Restart playback" }) as HTMLButtonElement;
    const backBtn = screen.getByRole("button", { name: "Previous flow step" }) as HTMLButtonElement;
    const nextBtn = screen.getByRole("button", { name: "Start flow playback" }) as HTMLButtonElement;
    const clearBtn = screen.getByRole("button", { name: "Exit playback" }) as HTMLButtonElement;

    expect(restartBtn.disabled).toBe(true);
    expect(backBtn.disabled).toBe(true);
    expect(nextBtn.disabled).toBe(false);
    expect(clearBtn.disabled).toBe(true);

    // Clicking Next starts step 1
    fireEvent.click(nextBtn);
    expect(handleStart).toHaveBeenCalledOnce();
  });

  it("renders active step counter, honest disclaimer, and aria-live polite description", () => {
    const handleNext = vi.fn();
    const handleBack = vi.fn();
    const handleRestart = vi.fn();
    const handleClear = vi.fn();

    render(
      <FlowPlaybackBar
        steps={mockSteps}
        currentStepIndex={0}
        onStart={vi.fn()}
        onNext={handleNext}
        onBack={handleBack}
        onRestart={handleRestart}
        onClear={handleClear}
      />,
    );

    const stepCounter = screen.getByText("Step 1 of 2");
    expect(stepCounter).toBeDefined();

    const disclaimer = screen.getByText("Topological edge order (not a runtime scenario)");
    expect(disclaimer).toBeDefined();

    // Verify aria-live container
    const liveRegion = screen.getByText(/Source Ingest/);
    expect(liveRegion.closest("[aria-live='polite']")).not.toBeNull();

    // Back is disabled on step 1 (first step)
    const backBtn = screen.getByRole("button", { name: "Previous flow step" }) as HTMLButtonElement;
    expect(backBtn.disabled).toBe(true);

    // Next is enabled on step 1
    const nextBtn = screen.getByRole("button", { name: "Next flow step" }) as HTMLButtonElement;
    expect(nextBtn.disabled).toBe(false);
    fireEvent.click(nextBtn);
    expect(handleNext).toHaveBeenCalledOnce();

    // Restart is enabled
    const restartBtn = screen.getByRole("button", { name: "Restart playback" }) as HTMLButtonElement;
    expect(restartBtn.disabled).toBe(false);
    fireEvent.click(restartBtn);
    expect(handleRestart).toHaveBeenCalledOnce();

    // Clear is enabled
    const clearBtn = screen.getByRole("button", { name: "Exit playback" }) as HTMLButtonElement;
    expect(clearBtn.disabled).toBe(false);
    fireEvent.click(clearBtn);
    expect(handleClear).toHaveBeenCalledOnce();
  });

  it("disables Next button on the last step", () => {
    const handleBack = vi.fn();
    render(
      <FlowPlaybackBar
        steps={mockSteps}
        currentStepIndex={1} // Step 2 of 2 (last step)
        onStart={vi.fn()}
        onNext={vi.fn()}
        onBack={handleBack}
        onRestart={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    expect(screen.getByText("Step 2 of 2")).toBeDefined();

    const nextBtn = screen.getByRole("button", { name: "Next flow step" }) as HTMLButtonElement;
    expect(nextBtn.disabled).toBe(true);

    const backBtn = screen.getByRole("button", { name: "Previous flow step" }) as HTMLButtonElement;
    expect(backBtn.disabled).toBe(false);
    fireEvent.click(backBtn);
    expect(handleBack).toHaveBeenCalledOnce();

    // Condition disclosure
    expect(screen.getByText("(when: valid == true)")).toBeDefined();
  });

  it("renders disabled state with 'No flows to step through' when steps array is empty", () => {
    render(
      <FlowPlaybackBar
        steps={[]}
        currentStepIndex={null}
        onStart={vi.fn()}
        onNext={vi.fn()}
        onBack={vi.fn()}
        onRestart={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    expect(screen.getByText("No flows to step through")).toBeDefined();

    // All transport buttons are disabled (legend toggle button may be present)
    const restartBtn = screen.getByRole("button", { name: "Restart playback" }) as HTMLButtonElement;
    const backBtn = screen.getByRole("button", { name: "Previous flow step" }) as HTMLButtonElement;
    const nextBtn = screen.getByRole("button", { name: "Start flow playback" }) as HTMLButtonElement;
    const clearBtn = screen.getByRole("button", { name: "Exit playback" }) as HTMLButtonElement;

    expect(restartBtn.disabled).toBe(true);
    expect(backBtn.disabled).toBe(true);
    expect(nextBtn.disabled).toBe(true);
    expect(clearBtn.disabled).toBe(true);
  });

  it("renders hostile step text as plain React text without executing or injecting elements", () => {
    const hostileStep: FlowPlaybackStep = {
      stepNumber: 1,
      edgeId: "e-h1-h2-0",
      from: "h1",
      to: "h2",
      fromName: "<script>alert('from')</script>",
      toName: "<img src=x onerror=alert('to') />",
      flows: "<b>markdown flow</b>",
      condition: "x < 1 && y > 2",
      description: "Hostile step description",
    };

    const { container } = render(
      <FlowPlaybackBar
        steps={[hostileStep]}
        currentStepIndex={0}
        onStart={vi.fn()}
        onNext={vi.fn()}
        onBack={vi.fn()}
        onRestart={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    expect(screen.getByText("<script>alert('from')</script>")).toBeDefined();
    expect(screen.getByText("<img src=x onerror=alert('to') />")).toBeDefined();
    expect(screen.getByText(/: <b>markdown flow<\/b>/)).toBeDefined();
    expect(screen.getByText(/\(when: x < 1 && y > 2\)/)).toBeDefined();

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });
});
