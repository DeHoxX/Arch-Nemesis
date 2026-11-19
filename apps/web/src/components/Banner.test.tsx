import React from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Banner } from "./Banner";

describe("Banner component", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "dark";
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
  });

  it("renders exact mandatory compliance and structural disclaimer text", () => {
    render(<Banner />);

    const expectedText =
      "Structurally checked, not guaranteed to be the best design. This is not a compliance claim.";
    expect(screen.getByText(expectedText)).toBeDefined();
  });

  it("has accessible note semantics and no close button", () => {
    const { container } = render(<Banner />);

    const bannerRegion = screen.getByRole("note", {
      name: "Compliance disclaimer",
    });
    expect(bannerRegion).toBeDefined();

    // Verify no dismiss/close button exists
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBe(0);
  });

  it("renders alert icon with high-contrast amber in light mode and amber-500 in dark mode", () => {
    const { container } = render(<Banner />);
    const icon = container.querySelector("svg");
    expect(icon).not.toBeNull();
    const classes = icon!.className.baseVal.split(/\s+/);
    expect(classes).toContain("text-amber-700");
    expect(classes).toContain("dark:text-amber-500");
  });
});

