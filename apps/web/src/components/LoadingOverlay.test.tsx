import React from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoadingOverlay } from "./LoadingOverlay";

describe("LoadingOverlay component", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders exact mandatory copy and initial elapsed timer", () => {
    render(<LoadingOverlay />);

    const expectedHeading =
      "Designing your system. This can take up to a minute, sometimes longer.";
    expect(screen.getByText(expectedHeading)).toBeDefined();
    expect(screen.getByText("0 seconds elapsed")).toBeDefined();
  });

  it("advances timer and shows 15 seconds elapsed after 15 seconds", () => {
    render(<LoadingOverlay />);

    act(() => {
      vi.advanceTimersByTime(15000);
    });

    expect(screen.getByText("15 seconds elapsed")).toBeDefined();
  });

  it("renders with accessible status role and polite live region", () => {
    render(<LoadingOverlay />);

    const overlay = screen.getByRole("status");
    expect(overlay.getAttribute("aria-live")).toBe("polite");
    expect(overlay.getAttribute("aria-label")).toBe("Generation in progress");
  });
});

