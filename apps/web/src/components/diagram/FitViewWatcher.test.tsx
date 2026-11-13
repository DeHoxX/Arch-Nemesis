import React from "react";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FitViewWatcher } from "./FitViewWatcher";

const mockFitView = vi.fn();

vi.mock("@xyflow/react", () => ({
  useReactFlow: () => ({
    fitView: mockFitView,
  }),
}));

describe("FitViewWatcher component (Stage 1D, D-337)", () => {
  let rafQueue: { id: number; callback: FrameRequestCallback }[] = [];
  let rafCounter = 1;

  beforeEach(() => {
    vi.clearAllMocks();
    rafQueue = [];
    rafCounter = 1;

    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      const id = rafCounter++;
      rafQueue.push({ id, callback: cb });
      return id;
    });

    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      rafQueue = rafQueue.filter((item) => item.id !== id);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stepRaf() {
    if (rafQueue.length > 0) {
      const { callback } = rafQueue.shift()!;
      callback(performance.now());
    }
  }

  function flushAllRaf() {
    while (rafQueue.length > 0) {
      stepRaf();
    }
  }

  it("skips fitView on the very first mount", () => {
    render(<FitViewWatcher trigger={false} nodesKey="node_1,node_2" />);

    // First mount must not schedule or call fitView
    expect(rafQueue).toHaveLength(0);
    expect(mockFitView).not.toHaveBeenCalled();
  });

  it("runs fitView({ padding: 0.2 }) after trigger change via double rAF deferral", () => {
    const { rerender } = render(<FitViewWatcher trigger={false} nodesKey="node_1,node_2" />);
    expect(mockFitView).not.toHaveBeenCalled();
    expect(rafQueue).toHaveLength(0);

    // Trigger changes (e.g. fullscreen transition enters)
    rerender(<FitViewWatcher trigger={true} nodesKey="node_1,node_2" />);

    // Outer rAF scheduled, but fitView has not executed yet
    expect(rafQueue).toHaveLength(1);
    expect(mockFitView).not.toHaveBeenCalled();

    // Step 1: Execute first rAF (browser layout/reflow pass)
    stepRaf();
    // Inner rAF scheduled for paint/measurement settle; fitView still not executed
    expect(rafQueue).toHaveLength(1);
    expect(mockFitView).not.toHaveBeenCalled();

    // Step 2: Execute second rAF
    stepRaf();
    expect(rafQueue).toHaveLength(0);
    expect(mockFitView).toHaveBeenCalledTimes(1);
    expect(mockFitView).toHaveBeenCalledWith({ padding: 0.2 });
  });

  it("does not trigger fitView on unrelated re-renders with unchanged trigger and nodesKey", () => {
    const { rerender } = render(<FitViewWatcher trigger="trigger_v1" nodesKey="node_1,node_2" />);

    // First mount skipped
    expect(mockFitView).not.toHaveBeenCalled();

    // Trigger update
    rerender(<FitViewWatcher trigger="trigger_v2" nodesKey="node_1,node_2" />);
    stepRaf();
    stepRaf();
    expect(mockFitView).toHaveBeenCalledTimes(1);

    // Unrelated re-render with identical trigger and nodesKey
    rerender(<FitViewWatcher trigger="trigger_v2" nodesKey="node_1,node_2" />);
    expect(rafQueue).toHaveLength(0);
    expect(mockFitView).toHaveBeenCalledTimes(1);
  });

  it("calls fitView when nodesKey changes even if trigger is unchanged", () => {
    const { rerender } = render(<FitViewWatcher trigger="trigger_fixed" nodesKey="node_1" />);
    expect(mockFitView).not.toHaveBeenCalled();

    rerender(<FitViewWatcher trigger="trigger_fixed" nodesKey="node_1,node_2" />);
    expect(rafQueue).toHaveLength(1);
    flushAllRaf();

    expect(mockFitView).toHaveBeenCalledTimes(1);
    expect(mockFitView).toHaveBeenCalledWith({ padding: 0.2 });
  });

  it("cancels pending animation frames on unmount", () => {
    const { rerender, unmount } = render(<FitViewWatcher trigger={null} nodesKey="node_1" />);

    rerender(<FitViewWatcher trigger="patch_1" nodesKey="node_1" />);
    expect(rafQueue).toHaveLength(1);

    unmount();
    expect(rafQueue).toHaveLength(0);
  });

  it("dispatches window resize events before fitting view on trigger changes (Stage H2e, D-361)", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    const { rerender } = render(<FitViewWatcher trigger={false} nodesKey="node_1" />);

    dispatchSpy.mockClear();
    rerender(<FitViewWatcher trigger={true} nodesKey="node_1" />);

    // Step through rAFs
    stepRaf();
    stepRaf();

    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: "resize" }));
    expect(mockFitView).toHaveBeenCalledWith({ padding: 0.2 });
  });
});
