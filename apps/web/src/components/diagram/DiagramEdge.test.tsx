import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Position, ReactFlowProvider } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import type { UnionArchitectureSpec } from "@/lib/types";
import { normalizeColorToHex } from "@/test/helpers";
import { DiagramEdge, type DiagramEdgeData } from "./DiagramEdge";
import { DiagramView } from "./DiagramView";

function renderEdge(data: DiagramEdgeData) {
  const spec: UnionArchitectureSpec = {
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
        diffStatus: "unchanged",
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
        diffStatus: "unchanged",
      },
    ],
    edges: [
      {
        from: "source_node",
        to: "target_node",
        flows: data.flows,
        condition: data.condition,
        diffStatus: data.diffStatus || "unchanged",
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

  it("falls back to getSmoothStepPath with borderRadius 5 when custom layout pathD is absent", () => {
    const { container } = render(
      <ReactFlowProvider>
        <svg>
          <DiagramEdge
            id="fallback_edge"
            source="src"
            target="tgt"
            sourceX={100}
            sourceY={50}
            targetX={200}
            targetY={150}
            sourcePosition={Position.Bottom}
            targetPosition={Position.Top}
            data={{ flows: "fallback stream" }}
          />
        </svg>
      </ReactFlowProvider>,
    );

    const pathEl = container.querySelector(".react-flow__edge-path") as SVGPathElement;
    expect(pathEl).not.toBeNull();
    const pathD = pathEl.getAttribute("d") || "";
    expect(pathD.length).toBeGreaterThan(0);
    expect(pathD).not.toContain(" C");
    expect(pathD).toMatch(/^M\s*100\s*50/);
  });

  describe("DiagramEdge diff styling (Phase 7C3a)", () => {
    it("renders removed edge with dashed rose stroke and lower opacity", () => {
      const { container } = renderEdge({
        flows: "deprecated sync",
        diffStatus: "removed",
      });

      expect(screen.getByText("deprecated sync")).toBeDefined();

      const edgePath = container.querySelector(".react-flow__edge-path") as SVGPathElement;
      expect(edgePath).not.toBeNull();
      expect(normalizeColorToHex(edgePath.style.stroke)).toBe("#f43f5e");
      expect(edgePath.style.strokeDasharray).toBe("6 6");
      expect(edgePath.style.opacity).toBe("0.6");
    });

    it("renders unchanged edge with standard solid border styling", () => {
      const { container } = renderEdge({
        flows: "active stream",
        diffStatus: "unchanged",
      });

      expect(screen.getByText("active stream")).toBeDefined();

      const edgePath = container.querySelector(".react-flow__edge-path") as SVGPathElement;
      expect(edgePath).not.toBeNull();
      expect(edgePath.style.strokeDasharray).toBe("");
      expect(edgePath.style.opacity).toBe("1");
    });

    describe("Class tests: edge styling arriving through real DiagramView path", () => {
      const statuses = ["added", "edited", "unchanged"] as const;

      it.each(statuses)("renders %s edge with standard stroke and full opacity", (status) => {
        const { container } = renderEdge({
          flows: `${status} flow`,
          diffStatus: status,
        });

        const edgePath = container.querySelector(".react-flow__edge-path") as SVGPathElement;
        expect(edgePath).not.toBeNull();
        expect(edgePath.style.strokeDasharray).toBe("");
        expect(edgePath.style.opacity).toBe("1");
      });

      it("renders removed edge with dashed rose stroke and 0.6 opacity through DiagramView", () => {
        const { container } = renderEdge({
          flows: "retired flow",
          diffStatus: "removed",
        });

        const edgePath = container.querySelector(".react-flow__edge-path") as SVGPathElement;
        expect(edgePath).not.toBeNull();
        expect(normalizeColorToHex(edgePath.style.stroke)).toBe("#f43f5e");
        expect(edgePath.style.strokeDasharray).toBe("6 6");
        expect(edgePath.style.opacity).toBe("0.6");
      });
    });
  });
});
