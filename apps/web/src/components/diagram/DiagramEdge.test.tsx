import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { ArchitectureSpec } from "@/lib/types";
import { type DiagramEdgeData } from "./DiagramEdge";
import { DiagramView } from "./DiagramView";

function renderEdge(data: DiagramEdgeData) {
  const spec: ArchitectureSpec = {
    nodes: [
      {
        id: "source_node",
        name: "Source Service",
        type: "service",
        role: "Sends data downstream",
        inputs: [],
        outputs: ["payload"],
        tech_options: [],
        needs_model: false,
      },
      {
        id: "target_node",
        name: "Target Service",
        type: "service",
        role: "Receives processed data",
        inputs: ["payload"],
        outputs: [],
        tech_options: [],
        needs_model: false,
      },
    ],
    edges: [
      {
        from: "source_node",
        to: "target_node",
        flows: data.flows,
        condition: data.condition,
      },
    ],
    constraints: [],
    entry_ids: ["source_node"],
    exit_ids: ["target_node"],
  };

  return render(<DiagramView spec={spec} />);
}

describe("DiagramEdge component", () => {
  it("renders flows label and condition badge when both exist", () => {
    renderEdge({
      flows: "claim payload",
      condition: "claim_amount > 10000",
    });

    expect(screen.getByText("claim payload")).toBeDefined();
    expect(screen.getByText("claim_amount > 10000")).toBeDefined();
    expect(
      screen.getByRole("note", { name: "Condition: claim_amount > 10000" }),
    ).toBeDefined();
    expect(
      screen.getByRole("note", { name: "Flow: claim payload" }),
    ).toBeDefined();
  });

  it("truncates condition exceeding 40 characters and provides tooltip", async () => {
    const user = userEvent.setup();
    const longCondition =
      "claim_amount > 10000 and customer_status == 'vip' and fraud_score < 20";
    renderEdge({
      flows: "fast approval",
      condition: longCondition,
    });

    const expectedTruncated = `${longCondition.slice(0, 40)}…`;
    expect(screen.getByText(expectedTruncated)).toBeDefined();

    const conditionNote = screen.getByRole("note", {
      name: `Condition: ${longCondition}`,
    });
    expect(conditionNote).toBeDefined();
    expect(conditionNote.getAttribute("title")).toBe(longCondition);

    const tooltip = screen.getByRole("tooltip", { hidden: true });
    expect(tooltip.textContent).toBe(longCondition);

    // Full text disclosure on hover
    await user.hover(conditionNote);
    expect(tooltip.textContent).toBe(longCondition);

    // Full text disclosure on keyboard focus
    conditionNote.focus();
    expect(document.activeElement).toBe(conditionNote);
    expect(conditionNote.getAttribute("aria-label")).toBe(
      `Condition: ${longCondition}`,
    );
  });
});
