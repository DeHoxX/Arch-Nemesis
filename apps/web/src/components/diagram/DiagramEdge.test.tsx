import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Position, ReactFlowProvider } from "@xyflow/react";
import { describe, expect, it, vi } from "vitest";
import type { UnionArchitectureSpec } from "@/lib/types";
import { normalizeColorToHex } from "@/test/helpers";
import { DiagramEdge, type DiagramEdgeData } from "./DiagramEdge";
import { DiagramView } from "./DiagramView";

function renderEdge(
  data: DiagramEdgeData,
  selectedNodeId?: string | null,
  extraNodes?: UnionArchitectureSpec["nodes"],
  selectedEdgeId?: string | null,
  onSelectEdge?: (edgeId: string | null) => void,
) {
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
      ...(extraNodes || []),
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

  return render(
    <DiagramView
      spec={spec}
      selectedNodeId={selectedNodeId}
      selectedEdgeId={selectedEdgeId}
      onSelectEdge={onSelectEdge}
    />,
  );
}

describe("DiagramEdge component", () => {
  it("renders single merged label with condition line on top and flows text below when both exist", () => {
    renderEdge({
      flows: "claim payload",
      condition: "claim_amount > 10000",
    });

    expect(screen.getByText("claim payload")).toBeDefined();
    expect(screen.getByText("claim_amount > 10000")).toBeDefined();

    const labelButton = screen.getByRole("button", {
      name: "Condition: claim_amount > 10000, Flow: claim payload",
    });
    expect(labelButton).toBeDefined();
    expect(labelButton.className).toContain("rounded-md");
    expect(labelButton.className).toContain("border-border");
    expect(labelButton.className).toContain("bg-card");
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

    const labelButton = screen.getByRole("button", {
      name: `Condition: ${longCondition}, Flow: fast approval`,
    });
    expect(labelButton).toBeDefined();
    expect(labelButton.getAttribute("title")).toBe(
      `Condition: ${longCondition}\nFlow: fast approval`,
    );

    const tooltip = screen.getByRole("tooltip", { hidden: true });
    expect(tooltip.textContent).toContain(longCondition);

    // Full text disclosure on hover
    await user.hover(labelButton);
    expect(tooltip.textContent).toContain(longCondition);

    // Full text disclosure on keyboard focus
    labelButton.focus();
    expect(document.activeElement).toBe(labelButton);
    expect(labelButton.getAttribute("aria-label")).toBe(
      `Condition: ${longCondition}, Flow: fast approval`,
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
            sourcePosition={Position.Right}
            targetPosition={Position.Left}
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

  describe("Single merged label styling and hostile input rendering (Stage 1B, D-324, D-325)", () => {
    it("renders single merged label container with rounded-md and zIndex 1001", () => {
      const { container } = renderEdge({
        flows: "order processing",
        condition: "is_valid == true",
      });

      const labelButton = screen.getByRole("button", {
        name: "Condition: is_valid == true, Flow: order processing",
      });
      expect(labelButton.className).toContain("rounded-md");
      expect(labelButton.className).toContain("border-border");
      expect(labelButton.className).toContain("bg-card");

      const pillWrapper = container.querySelector(".react-flow__edgelabel-renderer > div") as HTMLElement;
      expect(pillWrapper).not.toBeNull();
      expect(pillWrapper.style.zIndex).toBe("1001");
    });

    it("renders selected edge stroke with brand-accent and 2.5 width", () => {
      const { container } = renderEdge(
        { flows: "selected flow" },
        null,
        undefined,
        "e-source_node-target_node-0",
      );

      const edgePath = container.querySelector(".react-flow__edge-path") as SVGPathElement;
      expect(edgePath).not.toBeNull();
      expect(edgePath.style.stroke).toBe("var(--brand-accent, #b7c6c2)");
      expect(edgePath.style.strokeWidth).toBe("2.5");

      const labelBtn = screen.getByRole("button", { name: "Flow: selected flow" });
      expect(labelBtn.getAttribute("aria-pressed")).toBe("true");
      expect(labelBtn.className).toContain("border-[var(--brand-accent,#b7c6c2)]");
    });

    it("triggers onSelect on click, Enter key, and Space key", async () => {
      const user = userEvent.setup();
      const handleSelect = vi.fn();

      renderEdge(
        { flows: "interactive stream" },
        null,
        undefined,
        null,
        handleSelect,
      );

      const labelBtn = screen.getByRole("button", { name: "Flow: interactive stream" });

      // Click
      await user.click(labelBtn);
      expect(handleSelect).toHaveBeenCalledWith("e-source_node-target_node-0");

      // Enter key
      labelBtn.focus();
      await user.keyboard("{Enter}");
      expect(handleSelect).toHaveBeenCalledTimes(2);

      // Space key
      await user.keyboard(" ");
      expect(handleSelect).toHaveBeenCalledTimes(3);
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

  describe("Conditional dashed edge stroke styling (Stage B1c, D-299; Stage B4, D-305)", () => {
    it("renders non-empty trimmed condition with dashed stroke '5 4' and high-contrast stroke color", () => {
      const { container } = renderEdge({
        flows: "decision branch",
        condition: "status == 'approved'",
      });

      const edgePath = container.querySelector(".react-flow__edge-path") as SVGPathElement;
      expect(edgePath).not.toBeNull();
      expect(edgePath.style.strokeDasharray).toBe("5 4");
      expect(edgePath.style.opacity).toBe("1");
      expect(edgePath.style.stroke).toContain("var(--muted-foreground");
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

    describe("dimmed focus state", () => {
      it("renders dimmed edge with 0.25 path opacity and opacity-30 label container", () => {
        const { container } = renderEdge(
          { flows: "dimmed flow" },
          "other_node",
          [
            {
              id: "other_node",
              name: "Other Service",
              type: "service",
              role: "Unrelated service",
              inputs: [],
              outputs: [],
              tech_options: [],
              needs_model: false,
              diffStatus: "unchanged",
            },
          ],
        );

        // Path stroke opacity check
        const edgePath = container.querySelector(".react-flow__edge-path") as SVGPathElement;
        expect(edgePath).not.toBeNull();
        expect(edgePath.style.opacity).toBe("0.25");

        // Find flow label button
        const flowBtn = screen.getByRole("button", { name: "Flow: dimmed flow" });
        expect(flowBtn).toBeDefined();

        // Locate wrapper container that carries opacity-25 from real DOM
        const labelWrapper = (flowBtn.closest(".react-flow__edgelabel-renderer > div") ||
          flowBtn.parentElement) as HTMLElement;
        expect(labelWrapper).not.toBeNull();
        expect(labelWrapper.className).toContain("opacity-25");
        expect(labelWrapper.className).toContain("focus-within:opacity-100");
      });
    });
  });
});
