import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReactFlowProvider } from "@xyflow/react";
import { describe, expect, it, vi } from "vitest";
import { normalizeColorToHex } from "@/test/helpers";
import { DiagramNode, type DiagramNodeData } from "./DiagramNode";
import { computeNodeDimensions, DIAMOND_INNER_WIDTH } from "./layout";

function renderNode(dataOverrides: Partial<DiagramNodeData> = {}, selected = false) {
  const data: DiagramNodeData = {
    id: "node_1",
    name: "Legal Research Service",
    type: "microservice",
    role: "Extracts key legal precedents",
    inputs: ["case file"],
    outputs: ["citations"],
    tech_options: ["Python", "Gemini Pro"],
    needs_model: false,
    entry_ids: [],
    exit_ids: [],
    constraints: [],
    ...dataOverrides,
  };

  return render(
    <ReactFlowProvider>
      <DiagramNode
        id={data.id}
        data={data}
        type="customNode"
        selected={selected}
        zIndex={1}
        isConnectable={false}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
        dragging={false}
        draggable={false}
        deletable={false}
        selectable={true}
        parentId=""
      />
    </ReactFlowProvider>,
  );
}

describe("DiagramNode component", () => {
  it("renders node name, type, and role cleanly", () => {
    renderNode();

    expect(screen.getByText("Legal Research Service")).toBeDefined();
    expect(screen.getByText("microservice")).toBeDefined();
    expect(screen.getByText("Extracts key legal precedents")).toBeDefined();
  });

  it("has accessible label, tabIndex=0, and aria-pressed reflecting selected state", () => {
    renderNode({ name: "Intake", type: "gateway" }, true);

    const button = screen.getByRole("button", { name: "Node: Intake, gateway" });
    expect(button).toBeDefined();
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.getAttribute("tabIndex")).toBe("0");
  });

  it("renders target handle at Top and source handle at Bottom", () => {
    const { container } = renderNode();
    const handles = container.querySelectorAll(".react-flow__handle");
    expect(handles.length).toBe(2);

    const topHandle = container.querySelector('[data-handlepos="top"]');
    const bottomHandle = container.querySelector('[data-handlepos="bottom"]');
    expect(topHandle).not.toBeNull();
    expect(bottomHandle).not.toBeNull();
  });

  it("displays Entry badge and emerald border for entry nodes", () => {
    const { container } = renderNode({
      id: "portal",
      entry_ids: ["portal"],
      exit_ids: [],
    });

    expect(screen.getByText("Entry")).toBeDefined();
    const nodeEl = container.querySelector(".border-emerald-500");
    expect(nodeEl).not.toBeNull();
  });

  it("displays Exit badge and violet border for exit nodes", () => {
    const { container } = renderNode({
      id: "sink",
      entry_ids: [],
      exit_ids: ["sink"],
    });

    expect(screen.getByText("Exit")).toBeDefined();
    const nodeEl = container.querySelector(".border-violet-500");
    expect(nodeEl).not.toBeNull();
  });

  it("displays AI model badge and amber border for model-using internal nodes", () => {
    const { container } = renderNode({
      id: "llm_worker",
      needs_model: true,
      entry_ids: [],
      exit_ids: [],
    });

    expect(screen.getByText("AI model")).toBeDefined();
    // For hexagon shapes, the amber border is carried by the SVG polygon stroke
    const polygon = container.querySelector("polygon");
    expect(polygon).not.toBeNull();
    expect(normalizeColorToHex(polygon?.getAttribute("stroke"))).toBe("#f59e0b");
  });

  it("renders lock icon when node is referenced in constraints", () => {
    renderNode({
      id: "counsel_review",
      constraints: [
        {
          id: "c1",
          text: "Must be reviewed by human counsel",
          kind: "human_review",
          node_id: "counsel_review",
          a: null,
          b: null,
          covers: [],
        },
      ],
    });

    expect(screen.getByLabelText("Locked by constraint")).toBeDefined();
  });

  it("invokes onSelect on click and on Enter/Space keyboard events", async () => {
    const user = userEvent.setup();
    const handleSelect = vi.fn();

    renderNode({
      id: "selectable_node",
      name: "Selectable Node",
      type: "service",
      onSelect: handleSelect,
    });

    const nodeBtn = screen.getByRole("button", {
      name: "Node: Selectable Node, service",
    });

    // Click
    await user.click(nodeBtn);
    expect(handleSelect).toHaveBeenCalledWith("selectable_node");

    // Keyboard Enter
    handleSelect.mockClear();
    nodeBtn.focus();
    await user.keyboard("{Enter}");
    expect(handleSelect).toHaveBeenCalledWith("selectable_node");

    // Keyboard Space
    handleSelect.mockClear();
    await user.keyboard(" ");
    expect(handleSelect).toHaveBeenCalledWith("selectable_node");
  });

  describe("shape rendering, diamond inner box, and hostile string safety", () => {
    it("renders pill shape for entry node with correct accessible label", () => {
      renderNode({
        id: "entry_node",
        name: "Entry Gateway",
        type: "gateway",
        entry_ids: ["entry_node"],
      });
      const node = screen.getByRole("button", { name: "Node: Entry Gateway, gateway" });
      expect(node.className).toContain("rounded-full");
      expect(node.className).toContain("px-8");
    });

    it("renders hexagon shape for AI model node with correct accessible label", () => {
      renderNode({
        id: "ai_node",
        name: "AI Classifier",
        type: "agent",
        needs_model: true,
      });
      const node = screen.getByRole("button", { name: "Node: AI Classifier, agent" });
      expect(node.className).toContain("px-7");
      const polygon = document.querySelector("polygon");
      expect(polygon).toBeDefined();
    });

    it("renders rectangle shape for standard code node", () => {
      renderNode({
        id: "plain_node",
        name: "Plain Service",
        type: "service",
        needs_model: false,
      });
      const node = screen.getByRole("button", { name: "Node: Plain Service, service" });
      expect(node.className).toContain("rounded-xl");
      expect(node.className).toContain("px-3");
    });

    it("renders diamond shape with centered inner box containing name, role, and badges", () => {
      const { container } = renderNode({
        id: "decision_node",
        name: "Claim Evaluator",
        type: "evaluator",
        role: "Routes high risk claims",
        edges: [
          { from: "decision_node", to: "manual_review", flows: "flagged", condition: "risk > 80" },
          { from: "decision_node", to: "auto_approve", flows: "approved" },
        ],
      });
      const node = screen.getByRole("button", { name: "Node: Claim Evaluator, evaluator" });
      expect(node).toBeDefined();

      // Diamond inner box class and centered styling
      const innerBox = container.querySelector(".diamond-inner-box");
      expect(innerBox).not.toBeNull();
      expect(innerBox?.getAttribute("style")).toContain(`width: ${DIAMOND_INNER_WIDTH}px`);

      // Name and role are rendered inside inner box
      expect(innerBox?.textContent).toContain("Claim Evaluator");
      expect(innerBox?.textContent).toContain("Routes high risk claims");

      const polygon = container.querySelector("polygon");
      expect(polygon).not.toBeNull();
      expect(polygon?.getAttribute("points")).toContain("120,1");
    });

    it("renders diamond with component dimensions matching computeNodeDimensions output", () => {
      const nodeSpec = {
        name: "Fraud Screening & Detection Agent",
        role: "Evaluates claim transactions with anomaly detection models",
      };
      const dims = computeNodeDimensions(nodeSpec, "diamond");

      const { container } = renderNode({
        id: "decision_agent",
        ...nodeSpec,
        type: "agent",
        width: dims.width,
        height: dims.height,
        edges: [
          { from: "decision_agent", to: "adjuster", flows: "audit", condition: "fraud_score > 0.8" },
          { from: "decision_agent", to: "settlement", flows: "clear" },
        ],
      });

      const rootEl = container.firstElementChild as HTMLElement;
      expect(rootEl.style.width).toBe(`${dims.width}px`);
      expect(rootEl.style.height).toBe(`${dims.height}px`);

      const innerBox = container.querySelector(".diamond-inner-box") as HTMLElement;
      expect(innerBox).not.toBeNull();
      expect(innerBox.style.width).toBe(`${DIAMOND_INNER_WIDTH}px`);
      expect(innerBox.style.maxHeight).toBe(`${Math.round(dims.height * 0.52)}px`);
    });

    it("renders agent double ring outline and Agent badge when ai_role is agent", () => {
      const { container } = renderNode({
        id: "agent_node",
        name: "Autonomous Negotiator",
        type: "agent",
        ai_role: "agent",
        tools: ["calculator", "search"],
      });
      expect(screen.getByText("Agent")).toBeDefined();
      expect(screen.getByText("AI model")).toBeDefined();
      const polygons = container.querySelectorAll("polygon");
      expect(polygons.length).toBe(2);
    });

    it("renders 100-character unbroken name and hostile HTML string clamped inside diamond", () => {
      const unbrokenName = "A".repeat(100);
      const hostileRole = "<script>alert('xss')</script>";

      const { container } = renderNode({
        id: "hostile_decision",
        name: unbrokenName,
        type: "evaluator",
        role: hostileRole,
        edges: [
          { from: "hostile_decision", to: "a", flows: "f1", condition: "c1" },
          { from: "hostile_decision", to: "b", flows: "f2" },
        ],
      });

      const innerBox = container.querySelector(".diamond-inner-box");
      expect(innerBox).not.toBeNull();
      expect(screen.getByText(unbrokenName)).toBeDefined();
      expect(screen.getByText(hostileRole)).toBeDefined();
      expect(document.querySelector("script")).toBeNull();
    });
  });

  describe("DiagramNode diff styling (Phase 7C3a)", () => {
    it("renders added node with emerald ring, New badge, and preserves structural border", () => {
      const { container } = renderNode({
        id: "new_exit",
        name: "New Audit Sink",
        type: "sink",
        exit_ids: ["new_exit"],
        diffStatus: "added",
      });

      // Non-empty guard
      expect(screen.getByText("New Audit Sink")).toBeDefined();

      // Ring class and badge
      const rootEl = container.firstElementChild as HTMLElement;
      expect(rootEl.className).toContain("ring-emerald-500");
      expect(screen.getByText("New")).toBeDefined();

      // Structural border class preserved (violet for exit)
      expect(rootEl.className).toContain("border-violet-500");

      // Aria-label gets status word
      expect(rootEl.getAttribute("aria-label")).toBe("Node: New Audit Sink, sink, added");
    });

    it("renders removed node with dashed rose ring/border, opacity-70, Removed badge, and preserved model border", () => {
      const { container } = renderNode({
        id: "removed_model",
        name: "Legacy LLM Parser",
        type: "model_service",
        needs_model: true,
        diffStatus: "removed",
      });

      // Non-empty guard
      expect(screen.getByText("Legacy LLM Parser")).toBeDefined();

      const rootEl = container.firstElementChild as HTMLElement;
      expect(rootEl.className).toContain("ring-rose-500");
      expect(rootEl.className).toContain("border-dashed");
      expect(rootEl.className).toContain("opacity-70");
      expect(screen.getByText("Removed")).toBeDefined();

      // Structural border preserved (amber stroke on SVG polygon for needs_model)
      const polygon = container.querySelector("polygon");
      expect(polygon).not.toBeNull();
      expect(normalizeColorToHex(polygon?.getAttribute("stroke"))).toBe("#f59e0b");

      // Aria-label gets status word
      expect(rootEl.getAttribute("aria-label")).toBe("Node: Legacy LLM Parser, model_service, removed");
    });

    it("renders edited node with sky ring, Edited badge, and status in aria-label", () => {
      const { container } = renderNode({
        id: "edited_node",
        name: "Enhanced Cache",
        type: "cache",
        diffStatus: "edited",
      });

      // Non-empty guard
      expect(screen.getByText("Enhanced Cache")).toBeDefined();

      const rootEl = container.firstElementChild as HTMLElement;
      expect(rootEl.className).toContain("ring-sky-500");
      expect(screen.getByText("Edited")).toBeDefined();
      expect(rootEl.getAttribute("aria-label")).toBe("Node: Enhanced Cache, cache, edited");
    });

    it("renders unchanged node with standard aria-label and without diff badges or rings", () => {
      const { container } = renderNode({
        id: "unchanged_node",
        name: "Standard Ingress",
        type: "gateway",
        diffStatus: "unchanged",
      });

      // Non-empty guard
      expect(screen.getByText("Standard Ingress")).toBeDefined();

      const rootEl = container.firstElementChild as HTMLElement;
      expect(rootEl.className).not.toContain("ring-emerald-500");
      expect(rootEl.className).not.toContain("ring-rose-500");
      expect(rootEl.className).not.toContain("ring-sky-500");
      expect(screen.queryByText("New")).toBeNull();
      expect(screen.queryByText("Removed")).toBeNull();
      expect(screen.queryByText("Edited")).toBeNull();

      // Existing aria-label unchanged (no status word)
      expect(rootEl.getAttribute("aria-label")).toBe("Node: Standard Ingress, gateway");
    });

    describe("Class tests: structural border preserved across diffStatus x taxonomy (D-231)", () => {
      const diffStatuses = ["added", "removed", "edited", "unchanged"] as const;

      describe.each(diffStatuses)("when diffStatus is %s", (status) => {
        it("preserves entry border (emerald)", () => {
          const { container } = renderNode({
            id: "entry_node",
            name: "Entry Service",
            entry_ids: ["entry_node"],
            diffStatus: status,
          });
          const rootEl = container.firstElementChild as HTMLElement;
          expect(rootEl.className).toContain("border-emerald-500");
        });

        it("preserves exit border (violet)", () => {
          const { container } = renderNode({
            id: "exit_node",
            name: "Exit Service",
            exit_ids: ["exit_node"],
            diffStatus: status,
          });
          const rootEl = container.firstElementChild as HTMLElement;
          expect(rootEl.className).toContain("border-violet-500");
        });

        it("preserves model border (amber polygon stroke)", () => {
          const { container } = renderNode({
            id: "model_node",
            name: "Model Service",
            needs_model: true,
            diffStatus: status,
          });
          const polygon = container.querySelector("polygon");
          expect(polygon).not.toBeNull();
          expect(normalizeColorToHex(polygon?.getAttribute("stroke"))).toBe("#f59e0b");
        });

        it("preserves plain border (slate)", () => {
          const { container } = renderNode({
            id: "plain_node",
            name: "Plain Service",
            needs_model: false,
            entry_ids: [],
            exit_ids: [],
            diffStatus: status,
          });
          const rootEl = container.firstElementChild as HTMLElement;
          expect(rootEl.className).toContain("border-slate-500");
        });
      });
    });

    describe("dimmed focus state", () => {
      it("applies opacity-30 when dimmed is true", () => {
        const { container } = renderNode({
          id: "plain_node",
          name: "Plain Service",
          dimmed: true,
        });
        const rootEl = container.firstElementChild as HTMLElement;
        expect(rootEl.className).toContain("opacity-30");
      });

      it("does not apply opacity-30 when dimmed is false or omitted", () => {
        const { container } = renderNode({
          id: "plain_node",
          name: "Plain Service",
          dimmed: false,
        });
        const rootEl = container.firstElementChild as HTMLElement;
        expect(rootEl.className).not.toContain("opacity-30");
      });

      it("prefers opacity-30 over opacity-70 when diffStatus is removed and dimmed is true", () => {
        const { container } = renderNode({
          id: "removed_node",
          name: "Removed Service",
          diffStatus: "removed",
          dimmed: true,
        });
        const rootEl = container.firstElementChild as HTMLElement;
        expect(rootEl.className).toContain("opacity-30");
        expect(rootEl.className).not.toContain("opacity-70");
      });
    });
  });
});
