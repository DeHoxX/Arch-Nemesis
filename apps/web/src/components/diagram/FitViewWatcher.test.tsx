import React from "react";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FitViewWatcher } from "./FitViewWatcher";

const mockFitView = vi.fn();

vi.mock("@xyflow/react", () => ({
  useReactFlow: () => ({
    fitView: mockFitView,
  }),
}));

describe("FitViewWatcher component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 1;
    });
  });

  it("does not call fitView on initial mount", () => {
    render(<FitViewWatcher trigger="patch_1" nodesKey="node_1" />);

    expect(mockFitView).not.toHaveBeenCalled();
  });

  it("calls fitView({ padding: 0.2 }) when trigger changes after mount", () => {
    const { rerender } = render(<FitViewWatcher trigger={null} nodesKey="node_1" />);

    expect(mockFitView).not.toHaveBeenCalled();

    // Trigger changes when patch appears
    rerender(<FitViewWatcher trigger="patch_1" nodesKey="node_1,node_2" />);

    expect(mockFitView).toHaveBeenCalledTimes(1);
    expect(mockFitView).toHaveBeenCalledWith({ padding: 0.2 });
  });

  it("does not call fitView when re-rendered with unchanged trigger and nodesKey", () => {
    const { rerender } = render(<FitViewWatcher trigger="patch_1" nodesKey="node_1" />);

    expect(mockFitView).not.toHaveBeenCalled();

    rerender(<FitViewWatcher trigger="patch_1" nodesKey="node_1" />);

    expect(mockFitView).not.toHaveBeenCalled();
  });

  it("calls fitView when trigger clears back to null (Reject patch)", () => {
    const { rerender } = render(<FitViewWatcher trigger={null} nodesKey="node_1" />);

    // Appear
    rerender(<FitViewWatcher trigger="patch_1" nodesKey="node_1,node_2" />);
    expect(mockFitView).toHaveBeenCalledTimes(1);
    expect(mockFitView).toHaveBeenLastCalledWith({ padding: 0.2 });

    // Clear / Reject
    rerender(<FitViewWatcher trigger={null} nodesKey="node_1" />);
    expect(mockFitView).toHaveBeenCalledTimes(2);
    expect(mockFitView).toHaveBeenLastCalledWith({ padding: 0.2 });
  });

  it("calls fitView when nodesKey changes even if trigger is unchanged", () => {
    const { rerender } = render(<FitViewWatcher trigger="patch_1" nodesKey="node_1" />);

    expect(mockFitView).not.toHaveBeenCalled();

    rerender(<FitViewWatcher trigger="patch_1" nodesKey="node_1,node_2" />);

    expect(mockFitView).toHaveBeenCalledTimes(1);
    expect(mockFitView).toHaveBeenCalledWith({ padding: 0.2 });
  });

  it("cancels pending animation frame on unmount or re-trigger", () => {
    const cancelSpy = vi.spyOn(window, "cancelAnimationFrame");
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 42);

    const { rerender, unmount } = render(<FitViewWatcher trigger={null} nodesKey="node_1" />);

    rerender(<FitViewWatcher trigger="patch_1" nodesKey="node_1" />);
    unmount();

    expect(cancelSpy).toHaveBeenCalledWith(42);
  });
});
