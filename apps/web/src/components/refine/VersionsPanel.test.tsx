import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { VersionSummaryItem } from "@/lib/types";
import { VersionsPanel } from "./VersionsPanel";

describe("VersionsPanel", () => {
  const hostileChangeNote = "<script>alert('xss-note')</script>";
  const mockVersions: VersionSummaryItem[] = [
    {
      version_no: 1,
      created_at: "2026-11-04T10:00:00Z",
      change_note: null,
    },
    {
      version_no: 2,
      created_at: "2026-11-04T11:00:00Z",
      change_note: "Added audit logger component.",
    },
    {
      version_no: 3,
      created_at: "2026-11-04T12:00:00Z",
      change_note: hostileChangeNote,
    },
  ];

  it("renders versions newest first, displays Current badge, and renders change notes as plain text", async () => {
    const handleView = vi.fn();
    const handleRestore = vi.fn();

    render(
      <VersionsPanel
        versions={mockVersions}
        currentVersion={3}
        onViewVersion={handleView}
        onRestoreVersion={handleRestore}
      />,
    );

    // Non-empty guards
    expect(mockVersions).toHaveLength(3);
    const countSpan = screen.getByText(
      (_, el) =>
        el?.tagName.toLowerCase() === "span" &&
        el.textContent?.replace(/\s+/g, " ").trim() === "3 versions",
    );
    expect(countSpan).toBeDefined();

    // Cap warning banner absent when within limits
    expect(screen.queryByText(/reached the limit of/)).toBeNull();

    // Sorted newest first: v3 should appear before v2, which appears before v1
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]?.textContent).toContain("v3");
    expect(items[1]?.textContent).toContain("v2");
    expect(items[2]?.textContent).toContain("v1");

    // Current badge appears on v3 (the current version)
    expect(screen.getByText("Current")).toBeDefined();

    // Plain text verification: hostile script rendered literally
    expect(screen.getByText(hostileChangeNote)).toBeDefined();
    expect(document.querySelector("script")).toBeNull();

    // Null change note shows fallback text
    expect(screen.getByText("Initial architecture design.")).toBeDefined();
  });

  it("handles View button click", async () => {
    const user = userEvent.setup();
    const handleView = vi.fn();

    render(
      <VersionsPanel
        versions={mockVersions}
        currentVersion={3}
        viewingVersion={3}
        onViewVersion={handleView}
        onRestoreVersion={vi.fn()}
      />,
    );

    // v3 is currently being viewed, button says "Viewing" and is disabled
    const viewButtons = screen.getAllByRole("button", { name: /View version/ });
    expect((viewButtons[0] as HTMLButtonElement).disabled).toBe(true);
    expect(viewButtons[0]?.textContent).toContain("Viewing");

    // v2 view button is enabled and calls onViewVersion
    expect((viewButtons[1] as HTMLButtonElement).disabled).toBe(false);
    await user.click(viewButtons[1]!);
    expect(handleView).toHaveBeenCalledWith(2);
  });

  it("enforces Restore rules: disabled for current version and at cap; opens confirm dialog", async () => {
    const user = userEvent.setup();
    const handleRestore = vi.fn();

    const { rerender } = render(
      <VersionsPanel
        versions={mockVersions}
        currentVersion={3}
        maxVersions={15}
        onViewVersion={vi.fn()}
        onRestoreVersion={handleRestore}
      />,
    );

    const restoreButtons = screen.getAllByRole("button", { name: /Restore version/ });

    // Restore on v3 (current) is disabled
    expect((restoreButtons[0] as HTMLButtonElement).disabled).toBe(true);

    // Restore on v2 (historical) is enabled
    expect((restoreButtons[1] as HTMLButtonElement).disabled).toBe(false);

    // Clicking Restore on v2 opens confirm dialog
    await user.click(restoreButtons[1]!);
    expect(screen.getByText("Restore Design Version")).toBeDefined();
    expect(
      screen.getByText(
        "Are you sure you want to restore v2? This counts as a new version toward the maximum of 15.",
      ),
    ).toBeDefined();

    const confirmRestoreBtn = screen.getByRole("button", { name: "Confirm Restore v2" });
    await user.click(confirmRestoreBtn);
    expect(handleRestore).toHaveBeenCalledWith(2);

    // Dialog is now closed (real absence check)
    expect(screen.queryByText("Restore Design Version")).toBeNull();

    // When version cap is hit (currentVersion >= maxVersions), Restore is disabled on all items
    // and the exact cap alert banner from BUILD_PLAN.md:545 is rendered
    rerender(
      <VersionsPanel
        versions={mockVersions}
        currentVersion={15}
        maxVersions={15}
        onViewVersion={vi.fn()}
        onRestoreVersion={handleRestore}
      />,
    );
    const cappedRestoreButtons = screen.getAllByRole("button", { name: /Restore version/ });
    expect(cappedRestoreButtons.every((btn) => (btn as HTMLButtonElement).disabled)).toBe(true);

    // Exact cap text verification
    expect(
      screen.getByText(
        "This design has reached the limit of 15 versions. Please contact our team to continue.",
      ),
    ).toBeDefined();
  });
});
