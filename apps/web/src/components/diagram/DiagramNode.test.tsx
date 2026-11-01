import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReactFlowProvider } from "@xyflow/react";
import { describe, expect, it, vi } from "vitest";
import { DiagramNode, type DiagramNodeData } from "./DiagramNode";

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
    expect(polygon?.getAttribute("stroke")).toBe("#f59e0b");
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

  describe("shape rendering and hostile string safety", () => {
    it("renders pill shape for entry node with correct accessible label", () => {
      renderNode({
        id: "entry_node",
        name: "Entry Gateway",
        type: "gateway",
        entry_ids: ["entry_node"],
      });
      const node = screen.getByRole("button", { name: "Node: Entry Gateway, gateway" });
      expect(node.className).toContain("rounded-full");
    });

    it("renders hexagon shape for AI model node with correct accessible label", () => {
      renderNode({
        id: "ai_node",
        name: "AI Classifier",
        type: "agent",
        needs_model: true,
      });
      const node = screen.getByRole("button", { name: "Node: AI Classifier, agent" });
      expect(node.className).toContain("px-6");
      // Check SVG polygon exists for hexagon
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
    });

    it("renders hostile string literally without HTML execution", () => {
      const hostileName = "<script>alert('xss')</script>";
      renderNode({
        name: hostileName,
        type: "safe_type",
      });
      expect(screen.getByText(hostileName)).toBeDefined();
      expect(document.querySelector("script")).toBeNull();
    });
  });
});
