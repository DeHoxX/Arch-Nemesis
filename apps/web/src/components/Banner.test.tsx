import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Banner } from "./Banner";

describe("Banner component", () => {
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
});

