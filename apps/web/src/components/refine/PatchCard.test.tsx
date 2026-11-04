import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { PatchSummary } from "@/lib/types";
import { PatchCard } from "./PatchCard";

describe("PatchCard", () => {
  it("renders proposed status with Accept and Reject buttons and plain-text diff summary", async () => {
    const user = userEvent.setup();
    const handleAccept = vi.fn();
    const handleReject = vi.fn();
    const handleDismiss = vi.fn();

    const patch: PatchSummary = {
      id: "patch-prop-1",
      status: "proposed",
      diff: {
        added_nodes: ["node_audit"],
        removed_nodes: [],
        changed_nodes: [],
        added_edges: [{ from_node: "node_in", to: "node_audit", flows: "audit_stream" }],
        removed_edges: [],
        changed_edges: [],
        added_constraints: [],
        removed_constraints: [],
        changed_constraints: [],
        entry_changed: false,
        exit_changed: false,
      },
      issues: [
        {
          code: "W_NO_AI_NODE",
          severity: "warning",
          message: "No node in the architecture is marked as using an AI model.",
          ids: [],
        },
      ],
      ops_count: 2,
      preview_spec: null,
    };

    render(
      <PatchCard
        patch={patch}
        onAccept={handleAccept}
        onReject={handleReject}
        onDismiss={handleDismiss}
      />,
    );

    // Non-empty guards and badge
    expect(screen.getByText("Proposed Change")).toBeDefined();
    const opsSpan = screen.getByText(
      (_, el) =>
        el?.tagName.toLowerCase() === "span" &&
        el.textContent?.replace(/\s+/g, " ").trim() === "2 operations",
    );
    expect(opsSpan).toBeDefined();

    // Real absence checks for other statuses
    expect(screen.queryByText("Blocked by Rules")).toBeNull();
    expect(screen.queryByText("Requires Confirmation")).toBeNull();

    // Plain text diff bullet
    expect(screen.getByText("Added 1 node: node_audit")).toBeDefined();
    expect(screen.getByText("Added 1 edge: node_in \u2192 node_audit")).toBeDefined();

    // Non-blocking warning is rendered separately
    expect(
      screen.getByText("No node in the architecture is marked as using an AI model."),
    ).toBeDefined();

    // Proposed status offers Accept and Reject buttons; NO Dismiss button
    const acceptBtn = screen.getByRole("button", { name: "Accept proposed patch" });
    const rejectBtn = screen.getByRole("button", { name: "Reject proposed patch" });
    expect(screen.queryByRole("button", { name: "Dismiss blocked patch" })).toBeNull();

    await user.click(acceptBtn);
    expect(handleAccept).toHaveBeenCalledTimes(1);

    await user.click(rejectBtn);
    expect(handleReject).toHaveBeenCalledTimes(1);
    expect(handleDismiss).not.toHaveBeenCalled();
  });

  it("renders blocked status with issue messages and ONLY a Dismiss button", async () => {
    const user = userEvent.setup();
    const handleAccept = vi.fn();
    const handleReject = vi.fn();
    const handleDismiss = vi.fn();

    const hostileIssueMessage = "<script>alert('xss-issue')</script>";
    const patch: PatchSummary = {
      id: "patch-blocked-1",
      status: "blocked",
      diff: null,
      issues: [
        {
          code: "E_BAD_REF",
          severity: "error",
          message: hostileIssueMessage,
          ids: ["node_missing"],
        },
      ],
      ops_count: 1,
      preview_spec: null,
    };

    render(
      <PatchCard
        patch={patch}
        onAccept={handleAccept}
        onReject={handleReject}
        onDismiss={handleDismiss}
      />,
    );

    // Status badge
    expect(screen.getByText("Blocked by Rules")).toBeDefined();
    const opsSpanBlocked = screen.getByText(
      (_, el) =>
        el?.tagName.toLowerCase() === "span" &&
        el.textContent?.replace(/\s+/g, " ").trim() === "1 operation",
    );
    expect(opsSpanBlocked).toBeDefined();

    // Plain text verification: hostile script text rendered literally
    expect(screen.getByText(hostileIssueMessage)).toBeDefined();
    expect(document.querySelector("script")).toBeNull();

    // Blocked offers ONLY Dismiss button; NO Accept or Reject buttons
    const dismissBtn = screen.getByRole("button", { name: "Dismiss blocked patch" });
    expect(dismissBtn).toBeDefined();
    expect(screen.queryByRole("button", { name: "Accept proposed patch" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reject proposed patch" })).toBeNull();
    expect(screen.queryByText("Proposed Change")).toBeNull();
    expect(screen.queryByText("Requires Confirmation")).toBeNull();

    await user.click(dismissBtn);
    expect(handleDismiss).toHaveBeenCalledTimes(1);
    expect(handleAccept).not.toHaveBeenCalled();
    expect(handleReject).not.toHaveBeenCalled();
  });

  it("renders needs_confirmation badge and triggers onAccept", async () => {
    const user = userEvent.setup();
    const handleAccept = vi.fn();

    const patch: PatchSummary = {
      id: "patch-confirm-1",
      status: "needs_confirmation",
      diff: {
        added_nodes: [],
        removed_nodes: ["node_auth"],
        changed_nodes: [],
        added_edges: [],
        removed_edges: [],
        changed_edges: [],
        added_constraints: [],
        removed_constraints: ["c_auth"],
        changed_constraints: [],
        entry_changed: false,
        exit_changed: false,
      },
      issues: [],
      ops_count: 1,
      preview_spec: null,
    };

    render(
      <PatchCard
        patch={patch}
        onAccept={handleAccept}
        onReject={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText("Requires Confirmation")).toBeDefined();
    expect(screen.queryByText("Proposed Change")).toBeNull();
    expect(screen.queryByText("Blocked by Rules")).toBeNull();
    expect(screen.queryByRole("button", { name: "Dismiss blocked patch" })).toBeNull();

    const acceptBtn = screen.getByRole("button", { name: "Accept proposed patch" });
    await user.click(acceptBtn);
    expect(handleAccept).toHaveBeenCalledTimes(1);
  });
});
