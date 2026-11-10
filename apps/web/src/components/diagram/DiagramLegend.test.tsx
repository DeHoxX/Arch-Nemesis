import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DiagramLegend } from "./DiagramLegend";
import {
  BADGE_LEGEND_ITEMS,
  BORDER_LEGEND_ITEMS,
  CONSTRAINT_LOCK_LEGEND,
  EDGE_LEGEND_ITEMS,
  SHAPE_LEGEND_ITEMS,
} from "./classify";

describe("DiagramLegend Component", () => {
  it("renders collapsed by default with aria-expanded false", () => {
    render(<DiagramLegend />);
    const button = screen.getByRole("button", { name: /toggle diagram legend/i });
    expect(button).toBeDefined();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("region", { name: /diagram legend/i })).toBeNull();
  });

  it("expands on click and displays all metadata sections from classify.ts", () => {
    render(<DiagramLegend />);
    const button = screen.getByRole("button", { name: /toggle diagram legend/i });
    fireEvent.click(button);

    expect(button.getAttribute("aria-expanded")).toBe("true");
    const panel = screen.getByRole("region", { name: /diagram legend/i });
    expect(panel).toBeDefined();

    // Verify border items
    expect(BORDER_LEGEND_ITEMS.length).toBeGreaterThan(0);
    for (const item of BORDER_LEGEND_ITEMS) {
      expect(screen.getAllByText(item.label).length).toBeGreaterThan(0);
      expect(screen.getAllByText(item.description, { exact: false }).length).toBeGreaterThan(0);
    }

    // Verify shape items
    expect(SHAPE_LEGEND_ITEMS.length).toBeGreaterThan(0);
    for (const item of SHAPE_LEGEND_ITEMS) {
      expect(screen.getAllByText(item.label).length).toBeGreaterThan(0);
      expect(screen.getAllByText(item.description, { exact: false }).length).toBeGreaterThan(0);
    }

    // Verify badge items
    expect(BADGE_LEGEND_ITEMS.length).toBeGreaterThan(0);
    for (const item of BADGE_LEGEND_ITEMS) {
      expect(screen.getAllByText(item.label).length).toBeGreaterThan(0);
      expect(screen.getAllByText(item.description, { exact: false }).length).toBeGreaterThan(0);
    }

    // Verify constraint lock item
    expect(screen.getAllByText(CONSTRAINT_LOCK_LEGEND.label).length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(CONSTRAINT_LOCK_LEGEND.description, { exact: false }).length,
    ).toBeGreaterThan(0);

    // Verify edge items
    expect(EDGE_LEGEND_ITEMS.length).toBeGreaterThan(0);
    for (const item of EDGE_LEGEND_ITEMS) {
      expect(screen.getAllByText(item.label).length).toBeGreaterThan(0);
      expect(screen.getAllByText(item.description, { exact: false }).length).toBeGreaterThan(0);
    }

    // Clicking again collapses
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("region", { name: /diagram legend/i })).toBeNull();
  });

  it("handles keyboard toggle with Enter and Space keys", () => {
    render(<DiagramLegend />);
    const button = screen.getByRole("button", { name: /toggle diagram legend/i });

    // Native buttons fire click on Enter/Space, simulate click
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });
});

