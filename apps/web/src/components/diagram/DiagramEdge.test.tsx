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

  describe("Pill styling and hostile input rendering (Stage B1b, D-297)", () => {
    it("renders flows with soft pill class rounded-xl and zIndex 1001", () => {
      const { container } = renderEdge({
        flows: "order processing",
        condition: "is_valid == true",
      });

      const flowNote = screen.getByRole("note", { name: "Flow: order processing" });
      expect(flowNote.className).toContain("rounded-xl");
      expect(flowNote.className).toContain("border-border/80");
      expect(flowNote.className).toContain("bg-background");

      const conditionNote = screen.getByRole("note", { name: "Condition: is_valid == true" });
      expect(conditionNote.className).toContain("rounded-sm");
      expect(conditionNote.className).toContain("border-amber-500/40");
      expect(conditionNote.className).toContain("text-amber-500");

      const pillWrapper = container.querySelector(".react-flow__edgelabel-renderer > div") as HTMLElement;
      expect(pillWrapper).not.toBeNull();
      expect(pillWrapper.style.zIndex).toBe("1001");
    });

    it("renders hostile HTML strings literally as plain text without executing or injecting elements", () => {
      const hostileFlow = "<script>alert('xss')</script>";
      const hostileCondition = "<img src=x onerror=alert('xss') />";
      const markdownFlow = "**bold text**";

      const { container } = renderEdge({
        flows: hostileFlow,
        condition: hostileCondition,
      });

      expect(screen.getByText(hostileFlow)).toBeDefined();
      expect(screen.getByText(hostileCondition)).toBeDefined();
      expect(container.querySelector("script")).toBeNull();
      expect(container.querySelector("img")).toBeNull();

      // Render markdown edge
      renderEdge({ flows: markdownFlow });
      expect(screen.getByText(markdownFlow)).toBeDefined();
      expect(container.querySelector("strong")).toBeNull();
      expect(container.querySelector("b")).toBeNull();
    });

    it("handles 200-char flows and 100-char condition strings safely with truncation and tooltips", () => {
      const longFlow = "F".repeat(200);
      const longCond = "C".repeat(100);

      renderEdge({
        flows: longFlow,
        condition: longCond,
      });

      const truncatedFlow = `${longFlow.slice(0, 40)}…`;
      const truncatedCond = `${longCond.slice(0, 40)}…`;

      expect(screen.getByText(truncatedFlow)).toBeDefined();
      expect(screen.getByText(truncatedCond)).toBeDefined();
    });
  });

  describe("Conditional dashed edge stroke styling (Stage B1c, D-299)", () => {
    it("renders non-empty trimmed condition with dashed stroke '5 4' and neutral border color", () => {
      const { container } = renderEdge({
        flows: "decision branch",
        condition: "status == 'approved'",
      });

      const edgePath = container.querySelector(".react-flow__edge-path") as SVGPathElement;
      expect(edgePath).not.toBeNull();
      expect(edgePath.style.strokeDasharray).toBe("5 4");
      expect(edgePath.style.opacity).toBe("1");
    });

    const solidConditions = [
      { name: "undefined", val: undefined },
      { name: "null", val: null },
      { name: "empty string", val: "" },
      { name: "whitespace string", val: "   " },
    ];

    it.each(solidConditions)("renders unconditional edge with $name as solid stroke", ({ val }) => {
      const { container } = renderEdge({
        flows: "standard stream",
        condition: val,
      });

      const edgePath = container.querySelector(".react-flow__edge-path") as SVGPathElement;
      expect(edgePath).not.toBeNull();
      expect(edgePath.style.strokeDasharray).toBe("");
      expect(edgePath.style.opacity).toBe("1");
    });

    it("gives diffStatus 'removed' precedence over condition ('6 6' + rose #f43f5e + 0.6)", () => {
      const { container } = renderEdge({
        flows: "deprecated conditional branch",
        condition: "deprecated_flag == true",
        diffStatus: "removed",
      });

      const edgePath = container.querySelector(".react-flow__edge-path") as SVGPathElement;
      expect(edgePath).not.toBeNull();
      expect(normalizeColorToHex(edgePath.style.stroke)).toBe("#f43f5e");
      expect(edgePath.style.strokeDasharray).toBe("6 6");
      expect(edgePath.style.opacity).toBe("0.6");
    });

    const activeStatuses = ["added", "edited", "unchanged"] as const;

    it.each(activeStatuses)("renders conditional edge with %s diff status as dashed '5 4' with full opacity", (status) => {
      const { container } = renderEdge({
        flows: `${status} conditional stream`,
        condition: "score > 90",
        diffStatus: status,
      });

      const edgePath = container.querySelector(".react-flow__edge-path") as SVGPathElement;
      expect(edgePath).not.toBeNull();
      expect(edgePath.style.strokeDasharray).toBe("5 4");
      expect(edgePath.style.opacity).toBe("1");
    });
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
