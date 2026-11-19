import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConfirmDropModal } from "./ConfirmDropModal";

describe("ConfirmDropModal", () => {
  beforeEach(() => {
    document.documentElement.className = "dark";
  });

  afterEach(() => {
    document.documentElement.className = "";
  });
  it("renders dropped requirements as plain text and enforces checkbox gating", async () => {
    const user = userEvent.setup();
    const handleConfirm = vi.fn();
    const handleOpenChange = vi.fn();

    const hostileRequirement = "<script>alert('pwned')</script>";
    const dropped = [
      "All requests must pass through auth",
      hostileRequirement,
    ];

    const { rerender } = render(
      <ConfirmDropModal
        open={true}
        onOpenChange={handleOpenChange}
        droppedRequirements={dropped}
        onConfirm={handleConfirm}
      />,
    );

    // Non-empty guards
    expect(dropped).toHaveLength(2);
    expect(screen.getByText("All requests must pass through auth")).toBeDefined();

    // Plain text verification: hostile string must be rendered as literal text without executing
    expect(screen.getByText(hostileRequirement)).toBeDefined();
    expect(document.querySelector("script")).toBeNull();

    // Exact checkbox label verification (BUILD_PLAN.md:536)
    const checkbox = screen.getByRole("checkbox", {
      name: "I understand this requirement will no longer be checked.",
    }) as HTMLInputElement;
    expect(checkbox).toBeDefined();
    expect(checkbox.checked).toBe(false);

    // Confirm button must be disabled when checkbox is unchecked
    const confirmBtn = screen.getByRole("button", { name: "Confirm & Accept" }) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);

    // Clicking confirm while disabled does not invoke callback
    await user.click(confirmBtn);
    expect(handleConfirm).not.toHaveBeenCalled();

    // Check the box
    await user.click(checkbox);
    expect(checkbox.checked).toBe(true);
    expect(confirmBtn.disabled).toBe(false);

    // Click confirm now that it is enabled
    await user.click(confirmBtn);
    expect(handleConfirm).toHaveBeenCalledTimes(1);

    // Cancel button closes modal
    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    await user.click(cancelBtn);
    expect(handleOpenChange).toHaveBeenCalledWith(false);

    // When loading, button shows Applying... and is disabled
    rerender(
      <ConfirmDropModal
        open={true}
        onOpenChange={handleOpenChange}
        droppedRequirements={dropped}
        onConfirm={handleConfirm}
        isLoading={true}
      />,
    );
    const applyingBtn = screen.getByRole("button", { name: "Applying..." }) as HTMLButtonElement;
    expect(applyingBtn.disabled).toBe(true);

    // Real absence check: when open is false, modal is not in DOM
    rerender(
      <ConfirmDropModal
        open={false}
        onOpenChange={handleOpenChange}
        droppedRequirements={dropped}
        onConfirm={handleConfirm}
        isLoading={false}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders dual-theme warning classes on dropped requirements box and header", () => {
    render(
      <ConfirmDropModal
        open={true}
        onOpenChange={vi.fn()}
        droppedRequirements={["Must verify payload"]}
        onConfirm={vi.fn()}
      />,
    );

    const title = screen.getByText("Requirement Check Removal").parentElement;
    expect(title?.classList.contains("text-rose-600")).toBe(true);
    expect(title?.classList.contains("dark:text-rose-500")).toBe(true);

    const redBox = screen.getByRole("region", {
      name: "Requirements that will no longer be checked",
    });
    expect(redBox.classList.contains("bg-rose-50")).toBe(true);
    expect(redBox.classList.contains("dark:bg-rose-950/20")).toBe(true);
    expect(redBox.classList.contains("text-rose-900")).toBe(true);
    expect(redBox.classList.contains("dark:text-rose-200")).toBe(true);
  });
});
