import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ConstraintSpec } from "@/lib/types";
import { ConstraintsPanel } from "./ConstraintsPanel";

describe("ConstraintsPanel component", () => {
  it("renders null when constraints array is empty", () => {
    const { container } = render(<ConstraintsPanel constraints={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders all constraint plain texts in an accessible list", () => {
    const mockConstraints: ConstraintSpec[] = [
      {
        id: "c1",
        text: "External requests must pass through firewall before dispatching to workers.",
        kind: "network_boundary",
        node_id: null,
        a: "external_req",
        b: "worker_pool",
        covers: [],
      },
      {
        id: "c2",
        text: "Audit logs must be written to immutable storage within 5 seconds.",
        kind: "compliance",
        node_id: "audit_writer",
        a: null,
        b: null,
        covers: [],
      },
    ];

    render(<ConstraintsPanel constraints={mockConstraints} />);

    expect(screen.getByRole("region", { name: "System Constraints" })).toBeDefined();
    expect(screen.getByText("Constraints")).toBeDefined();
    expect(
      screen.getByText(
        "External requests must pass through firewall before dispatching to workers.",
      ),
    ).toBeDefined();
    expect(
      screen.getByText(
        "Audit logs must be written to immutable storage within 5 seconds.",
      ),
    ).toBeDefined();
  });
});

