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

describe("FlowPlaybackBar Component (Stage 1C+, D-332)", () => {
  it("closed state shows Flow toggle and no playback controls", () => {
    render(
      <FlowPlaybackBar
        steps={mockSteps}
        currentStepIndex={null}
        onStart={vi.fn()}
        onNext={vi.fn()}
        onBack={vi.fn()}
        onRestart={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    // Flow toggle and Legend toggle are present
    const flowToggle = screen.getByRole("button", { name: /toggle flow playback/i });
    expect(flowToggle).toBeDefined();
    expect(flowToggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText("2 flows")).toBeDefined();

    const legendToggle = screen.getByRole("button", { name: /toggle diagram legend/i });
    expect(legendToggle).toBeDefined();

    // Controls are not visible in closed state
    expect(screen.queryByRole("region", { name: /flow playback panel/i })).toBeNull();
    expect(screen.queryByRole("button", { name: "Restart playback" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Next flow step" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Start flow playback" })).toBeNull();
  });

  it("opening Flow shows controls, honest caption, and aria-live polite description", () => {
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

    const flowToggle = screen.getByRole("button", { name: /toggle flow playback/i });
    fireEvent.click(flowToggle);
    expect(flowToggle.getAttribute("aria-expanded")).toBe("true");

    const panel = screen.getByRole("region", { name: /flow playback panel/i });
    expect(panel).toBeDefined();

    expect(screen.getByText(/Ready · 2 flows/)).toBeDefined();
    expect(screen.getByText("Topological edge order (not a runtime scenario)")).toBeDefined();

    const nextBtn = screen.getByRole("button", { name: "Start flow playback" }) as HTMLButtonElement;
    expect(nextBtn.disabled).toBe(false);

    // Clicking Next starts step 1
    fireEvent.click(nextBtn);
    expect(handleStart).toHaveBeenCalledOnce();
  });

  it("Next, Back, Restart, and Clear buttons trigger corresponding callbacks when active", () => {
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

    // Open panel
    fireEvent.click(screen.getByRole("button", { name: /toggle flow playback/i }));

    const stepCounter = screen.getByText("Step 1 of 2");
    expect(stepCounter).toBeDefined();

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

  it("closing the Flow panel exits playback", () => {
    const handleClear = vi.fn();
    render(
      <FlowPlaybackBar
        steps={mockSteps}
        currentStepIndex={1}
        onStart={vi.fn()}
        onNext={vi.fn()}
        onBack={vi.fn()}
        onRestart={vi.fn()}
        onClear={handleClear}
      />,
    );

    const flowToggle = screen.getByRole("button", { name: /toggle flow playback/i });

    // Open panel
    fireEvent.click(flowToggle);
    expect(flowToggle.getAttribute("aria-expanded")).toBe("true");

    // Close panel by clicking toggle again -> calls onClear()
    fireEvent.click(flowToggle);
    expect(flowToggle.getAttribute("aria-expanded")).toBe("false");
    expect(handleClear).toHaveBeenCalledOnce();
  });

  it("pressing Escape inside Flow panel closes panel and exits playback", () => {
    const handleClear = vi.fn();
    render(
      <FlowPlaybackBar
        steps={mockSteps}
        currentStepIndex={0}
        onStart={vi.fn()}
        onNext={vi.fn()}
        onBack={vi.fn()}
        onRestart={vi.fn()}
        onClear={handleClear}
      />,
    );

    const flowToggle = screen.getByRole("button", { name: /toggle flow playback/i });
    fireEvent.click(flowToggle);

    const panel = screen.getByRole("region", { name: /flow playback panel/i });
    fireEvent.keyDown(panel, { key: "Escape" });

    expect(screen.queryByRole("region", { name: /flow playback panel/i })).toBeNull();
    expect(handleClear).toHaveBeenCalledOnce();
  });

  it("opening Flow closes Legend and vice versa (mutually exclusive)", () => {
    render(
      <FlowPlaybackBar
        steps={mockSteps}
        currentStepIndex={null}
        onStart={vi.fn()}
        onNext={vi.fn()}
        onBack={vi.fn()}
        onRestart={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    const flowToggle = screen.getByRole("button", { name: /toggle flow playback/i });
    const legendToggle = screen.getByRole("button", { name: /toggle diagram legend/i });

    // Open Flow
    fireEvent.click(flowToggle);
    expect(screen.getByRole("region", { name: /flow playback panel/i })).toBeDefined();
    expect(screen.queryByRole("region", { name: /diagram legend/i })).toBeNull();

    // Open Legend -> closes Flow
    fireEvent.click(legendToggle);
    expect(screen.getByRole("region", { name: /diagram legend/i })).toBeDefined();
    expect(screen.queryByRole("region", { name: /flow playback panel/i })).toBeNull();

    // Open Flow again -> closes Legend
    fireEvent.click(flowToggle);
    expect(screen.getByRole("region", { name: /flow playback panel/i })).toBeDefined();
    expect(screen.queryByRole("region", { name: /diagram legend/i })).toBeNull();
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

    expect(screen.getByText("0 flows")).toBeDefined();

    // Open panel
    fireEvent.click(screen.getByRole("button", { name: /toggle flow playback/i }));
    expect(screen.getByText("No flows to step through")).toBeDefined();

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

    // Open panel
    fireEvent.click(screen.getByRole("button", { name: /toggle flow playback/i }));

    expect(screen.getByText("<script>alert('from')</script>")).toBeDefined();
    expect(screen.getByText("<img src=x onerror=alert('to') />")).toBeDefined();
    expect(screen.getByText(/: <b>markdown flow<\/b>/)).toBeDefined();
    expect(screen.getByText(/When: x < 1 && y > 2/)).toBeDefined();

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });
});
