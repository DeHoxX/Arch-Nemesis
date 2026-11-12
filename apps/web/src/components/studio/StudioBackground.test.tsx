import React from "react";
import { render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StudioBackground } from "./StudioBackground";
import { useStudioWavesGate } from "./useStudioWavesGate";

// Mock Waves component cleanly for jsdom
vi.mock("./Waves", () => ({
  default: (props: Record<string, unknown>) => (
    <div
      data-testid="waves-mock"
      aria-hidden="true"
      data-line-color={String(props.lineColor ?? "")}
      data-accent-color={String(props.accentColor ?? "")}
      data-line-style={String(props.lineStyle ?? "")}
    />
  ),
}));

describe("StudioBackground Component", () => {
  it("renders circuits without Waves when showWaves is false (D-355)", () => {
    const { container } = render(
      <StudioBackground showWaves={false} wavesLayerTestId="custom-waves-layer" />,
    );

    // Non-empty guard: circuits must render with proper data-testid
    const circuits = screen.getByTestId("studio-corner-circuits");
    expect(circuits).toBeDefined();
    expect(circuits.className).toContain("pointer-events-none");
    expect(circuits.className).toContain("z-0");

    // Waves layer and mock must NOT render
    expect(screen.queryByTestId("custom-waves-layer")).toBeNull();
    expect(screen.queryByTestId("waves-mock")).toBeNull();
    expect(container.querySelectorAll("svg")).toHaveLength(2);
  });

  it("renders Waves layer with z-0, pointer-events-none, and inset-0 when showWaves is true and wavesScope is 'full' (D-351, D-355)", () => {
    render(
      <StudioBackground
        showWaves={true}
        wavesScope="full"
        wavesLayerTestId="custom-waves-layer"
      />,
    );

    const wavesLayer = screen.getByTestId("custom-waves-layer");
    expect(wavesLayer).toBeDefined();
    expect(wavesLayer.getAttribute("aria-hidden")).toBe("true");
    expect(wavesLayer.className).toContain("pointer-events-none");
    expect(wavesLayer.className).toContain("absolute");
    expect(wavesLayer.className).toContain("z-0");
    expect(wavesLayer.className).toContain("overflow-hidden");
    expect(wavesLayer.className).toContain("inset-0");
    expect(wavesLayer.className).not.toContain("h-[260px]");

    // Waves mock inside
    const wavesMock = screen.getByTestId("waves-mock");
    expect(wavesMock).toBeDefined();
    expect(wavesMock.getAttribute("data-line-color")).toBe("#ffffff");
    expect(wavesMock.getAttribute("data-accent-color")).toBe("#10b981");

    // Circuits present alongside
    expect(screen.getByTestId("studio-corner-circuits")).toBeDefined();
  });

  it("renders Waves layer with inset-x-0 top-0 h-[260px] and mask-image when wavesScope is 'header-band' (D-355)", () => {
    render(
      <StudioBackground
        showWaves={true}
        wavesScope="header-band"
        wavesLayerTestId="header-waves-layer"
      />,
    );

    const wavesLayer = screen.getByTestId("header-waves-layer");
    expect(wavesLayer).toBeDefined();
    expect(wavesLayer.className).toContain("pointer-events-none");
    expect(wavesLayer.className).toContain("z-0");
    expect(wavesLayer.className).toContain("inset-x-0");
    expect(wavesLayer.className).toContain("top-0");
    expect(wavesLayer.className).toContain("h-[260px]");
    expect(wavesLayer.className).not.toContain("inset-0");

    // Fade mask applied to bottom of header band
    expect(wavesLayer.style.maskImage || wavesLayer.style.webkitMaskImage).toContain("linear-gradient");
  });
});

describe("useStudioWavesGate Hook", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns false immediately and registers no listeners when enabled is false (D-355)", () => {
    const matchMediaSpy = vi.spyOn(window, "matchMedia");
    const { result } = renderHook(() => useStudioWavesGate(false));

    expect(result.current).toBe(false);
    expect(matchMediaSpy).not.toHaveBeenCalled();
  });

  it("returns true on desktop (>=768px) when reduced-motion is not set (D-351, D-355)", () => {
    vi.spyOn(window, "matchMedia").mockImplementation((query: string) => {
      if (query === "(prefers-reduced-motion: reduce)") {
        return {
          matches: false,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        } as unknown as MediaQueryList;
      }
      if (query === "(min-width: 768px)") {
        return {
          matches: true,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        } as unknown as MediaQueryList;
      }
      return {
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      } as unknown as MediaQueryList;
    });

    const { result } = renderHook(() => useStudioWavesGate(true));
    expect(result.current).toBe(true);
  });

  it("returns false on mobile (<768px) even when reduced-motion is not set (D-351, D-355)", () => {
    vi.spyOn(window, "matchMedia").mockImplementation((query: string) => {
      if (query === "(prefers-reduced-motion: reduce)") {
        return {
          matches: false,
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        } as unknown as MediaQueryList;
      }
      if (query === "(min-width: 768px)") {
        return {
          matches: false,
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        } as unknown as MediaQueryList;
      }
      return {
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as unknown as MediaQueryList;
    });

    const { result } = renderHook(() => useStudioWavesGate(true));
    expect(result.current).toBe(false);
  });

  it("returns false when prefers-reduced-motion is true even on desktop (D-351, D-355)", () => {
    vi.spyOn(window, "matchMedia").mockImplementation((query: string) => {
      if (query === "(prefers-reduced-motion: reduce)") {
        return {
          matches: true,
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        } as unknown as MediaQueryList;
      }
      if (query === "(min-width: 768px)") {
        return {
          matches: true,
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        } as unknown as MediaQueryList;
      }
      return {
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as unknown as MediaQueryList;
    });

    const { result } = renderHook(() => useStudioWavesGate(true));
    expect(result.current).toBe(false);
  });

  it("attaches zero window 'resize' event listeners to prevent cross-component update errors (D-352, D-355)", () => {
    const windowAddEventSpy = vi.spyOn(window, "addEventListener");

    renderHook(() => useStudioWavesGate(true));

    const resizeCalls = windowAddEventSpy.mock.calls.filter(
      (call) => call[0] === "resize",
    );
    expect(resizeCalls).toHaveLength(0);
  });
});
