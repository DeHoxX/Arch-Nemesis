import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFullscreen } from "./useFullscreen";

describe("useFullscreen hook (Stage 1C+, D-333)", () => {
  const originalFullscreenEnabled = document.fullscreenEnabled;
  const originalFullscreenElement = document.fullscreenElement;

  let requestFullscreenMock: ReturnType<typeof vi.fn>;
  let exitFullscreenMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    requestFullscreenMock = vi.fn().mockResolvedValue(undefined);
    exitFullscreenMock = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(document, "fullscreenEnabled", {
      writable: true,
      configurable: true,
      value: true,
    });
    Object.defineProperty(document, "fullscreenElement", {
      writable: true,
      configurable: true,
      value: null,
    });
    Object.defineProperty(document, "exitFullscreen", {
      writable: true,
      configurable: true,
      value: exitFullscreenMock,
    });
  });

  afterEach(() => {
    Object.defineProperty(document, "fullscreenEnabled", {
      writable: true,
      configurable: true,
      value: originalFullscreenEnabled,
    });
    Object.defineProperty(document, "fullscreenElement", {
      writable: true,
      configurable: true,
      value: originalFullscreenElement,
    });
    vi.restoreAllMocks();
  });

  it("reports unsupported when document.fullscreenEnabled is false", () => {
    Object.defineProperty(document, "fullscreenEnabled", {
      value: false,
    });

    const targetRef = { current: document.createElement("div") };
    targetRef.current.requestFullscreen = requestFullscreenMock;

    const { result } = renderHook(() => useFullscreen(targetRef));

    expect(result.current.isFullscreenSupported).toBe(false);
    expect(result.current.isFullscreen).toBe(false);
  });

  it("reports unsupported when requestFullscreen method is missing on target element", () => {
    const targetRef = { current: document.createElement("div") };
    // Leave requestFullscreen undefined on target

    const { result } = renderHook(() => useFullscreen(targetRef));

    expect(result.current.isFullscreenSupported).toBe(false);
  });

  it("reports supported and calls target.requestFullscreen on toggle when not fullscreen", async () => {
    const targetEl = document.createElement("div");
    targetEl.requestFullscreen = requestFullscreenMock;
    const targetRef = { current: targetEl };

    const { result } = renderHook(() => useFullscreen(targetRef));

    expect(result.current.isFullscreenSupported).toBe(true);
    expect(result.current.isFullscreen).toBe(false);

    await act(async () => {
      await result.current.toggleFullscreen();
    });

    expect(requestFullscreenMock).toHaveBeenCalledOnce();
    expect(exitFullscreenMock).not.toHaveBeenCalled();
  });

  it("calls document.exitFullscreen on toggle when already fullscreen", async () => {
    const targetEl = document.createElement("div");
    targetEl.requestFullscreen = requestFullscreenMock;
    const targetRef = { current: targetEl };

    Object.defineProperty(document, "fullscreenElement", {
      value: targetEl,
    });

    const { result } = renderHook(() => useFullscreen(targetRef));

    await act(async () => {
      await result.current.toggleFullscreen();
    });

    expect(exitFullscreenMock).toHaveBeenCalledOnce();
    expect(requestFullscreenMock).not.toHaveBeenCalled();
  });

  it("updates isFullscreen when fullscreenchange event fires", () => {
    const targetEl = document.createElement("div");
    targetEl.requestFullscreen = requestFullscreenMock;
    const targetRef = { current: targetEl };

    const { result } = renderHook(() => useFullscreen(targetRef));
    expect(result.current.isFullscreen).toBe(false);

    // Simulate entering fullscreen
    act(() => {
      Object.defineProperty(document, "fullscreenElement", {
        value: targetEl,
      });
      document.dispatchEvent(new Event("fullscreenchange"));
    });

    expect(result.current.isFullscreen).toBe(true);

    // Simulate exiting fullscreen (e.g. browser Escape)
    act(() => {
      Object.defineProperty(document, "fullscreenElement", {
        value: null,
      });
      document.dispatchEvent(new Event("fullscreenchange"));
    });

    expect(result.current.isFullscreen).toBe(false);
  });

  it("removes fullscreenchange listener on unmount", () => {
    const removeEventListenerSpy = vi.spyOn(document, "removeEventListener");

    const targetEl = document.createElement("div");
    targetEl.requestFullscreen = requestFullscreenMock;
    const targetRef = { current: targetEl };

    const { unmount } = renderHook(() => useFullscreen(targetRef));
    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "fullscreenchange",
      expect.any(Function),
    );
  });

  it("catches promise rejection gracefully without throwing", async () => {
    const targetEl = document.createElement("div");
    targetEl.requestFullscreen = vi.fn().mockRejectedValue(new Error("Denied"));
    const targetRef = { current: targetEl };

    const { result } = renderHook(() => useFullscreen(targetRef));

    // Must not reject/throw
    await expect(result.current.toggleFullscreen()).resolves.toBeUndefined();
  });

  it("dispatches window resize events upon fullscreen entry and exit (Stage H2e, D-361)", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    const targetEl = document.createElement("div");
    targetEl.requestFullscreen = requestFullscreenMock;
    const targetRef = { current: targetEl };

    renderHook(() => useFullscreen(targetRef));

    // Clear initial calls from mount
    dispatchSpy.mockClear();

    // Enter fullscreen
    act(() => {
      Object.defineProperty(document, "fullscreenElement", {
        value: targetEl,
      });
      document.dispatchEvent(new Event("fullscreenchange"));
    });

    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: "resize" }));

    // Clear and exit fullscreen
    dispatchSpy.mockClear();
    act(() => {
      Object.defineProperty(document, "fullscreenElement", {
        value: null,
      });
      document.dispatchEvent(new Event("fullscreenchange"));
    });

    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: "resize" }));
  });

  it("cancels delayed resize timeout if unmounted before 200ms", () => {
    vi.useFakeTimers();
    try {
      const dispatchSpy = vi.spyOn(window, "dispatchEvent");
      const targetEl = document.createElement("div");
      targetEl.requestFullscreen = requestFullscreenMock;
      const targetRef = { current: targetEl };

      const { unmount } = renderHook(() => useFullscreen(targetRef));
      dispatchSpy.mockClear();

      unmount();

      act(() => {
        vi.advanceTimersByTime(250);
      });

      expect(dispatchSpy).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
