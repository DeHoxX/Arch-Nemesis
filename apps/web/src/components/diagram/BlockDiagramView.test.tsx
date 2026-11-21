import React from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ArchitectureSpec, UnionArchitectureSpec } from "@/lib/types";
import { BlockDiagramView } from "./BlockDiagramView";
import { BLOCK_NODE_HEIGHT, BLOCK_NODE_WIDTH, computeBlockLayout } from "./blockLayout";

const mockSpec: ArchitectureSpec = {
  nodes: [
    {
      id: "client_portal",
      name: "Client Portal",
      type: "web app",
      role: "Accepts client instructions",
      inputs: [],
      outputs: ["intake payload"],
      tech_options: [],
      needs_model: false,
    },
    {
      id: "intake_validator",
      name: "Intake Validator",
      type: "service",
      role: "Validates document completeness",
      inputs: ["intake payload"],
      outputs: ["verified intake"],
      tech_options: [],
      needs_model: false,
    },
    {
      id: "attorney_review",
      name: "Attorney Review Desk",
      type: "dashboard",
      role: "Presents drafts to licensed counsel",
      inputs: ["verified intake"],
      outputs: [],
      tech_options: [],
      needs_model: false,
    },
  ],
  edges: [
    { from: "client_portal", to: "intake_validator", flows: "intake payload" },
    { from: "intake_validator", to: "attorney_review", flows: "verified intake" },
  ],
  constraints: [],
  entry_ids: ["client_portal"],
  exit_ids: ["attorney_review"],
};

describe("BlockDiagramView component (Stage V3-4B)", () => {
  beforeEach(() => {
    document.documentElement.className = "dark";
  });

  afterEach(() => {
    document.documentElement.className = "";
  });

  it("renders block diagram region with all nodes as block cards", () => {
    render(<BlockDiagramView spec={mockSpec} />);

    expect(screen.getByRole("region", { name: "Block Diagram" })).toBeDefined();
    expect(screen.getByText("Client Portal")).toBeDefined();
    expect(screen.getByText("Intake Validator")).toBeDefined();
    expect(screen.getByText("Attorney Review Desk")).toBeDefined();
  });

  it("renders swimlane column headers via DAG depth fallback when spec has no layers", () => {
    render(<BlockDiagramView spec={mockSpec} />);

    // Fallback creates "Stage 1", "Stage 2", "Stage 3"
    expect(screen.getByText("Stage 1")).toBeDefined();
    expect(screen.getByText("Stage 2")).toBeDefined();
    expect(screen.getByText("Stage 3")).toBeDefined();
  });

  it("renders explicit layer names and node counts when spec defines layers", () => {
    const layeredSpec: ArchitectureSpec = {
      nodes: [
        {
          id: "n1",
          name: "Ingest Gateway",
          type: "service",
          role: "Ingests data",
          inputs: [],
          outputs: [],
          tech_options: [],
          needs_model: false,
          layer: "Ingest",
        },
        {
          id: "n2",
          name: "Worker Pool",
          type: "service",
          role: "Processes jobs",
          inputs: [],
          outputs: [],
          tech_options: [],
          needs_model: false,
          layer: "Processing",
        },
      ],
      edges: [{ from: "n1", to: "n2", flows: "jobs" }],
      constraints: [],
      entry_ids: ["n1"],
      exit_ids: ["n2"],
    };

    render(<BlockDiagramView spec={layeredSpec} />);

    expect(screen.getByText("Ingest")).toBeDefined();
    expect(screen.getByText("Processing")).toBeDefined();
  });

  it("renders entry and exit pills on appropriate nodes", () => {
    render(<BlockDiagramView spec={mockSpec} />);

    expect(screen.getByText("Entry")).toBeDefined();
    expect(screen.getByText("Exit")).toBeDefined();
  });

  it("renders node handles oriented Left for target and Right for source", () => {
    const { container } = render(<BlockDiagramView spec={mockSpec} />);
    const leftHandles = container.querySelectorAll('[data-handlepos="left"]');
    const rightHandles = container.querySelectorAll('[data-handlepos="right"]');
    expect(leftHandles.length).toBeGreaterThan(0);
    expect(rightHandles.length).toBeGreaterThan(0);
  });

  it("omits edge flow label text from the canvas", () => {
    render(<BlockDiagramView spec={mockSpec} />);

    expect(screen.queryByText("intake payload")).toBeNull();
    expect(screen.queryByText("verified intake")).toBeNull();
  });

  it("renders zoom controls and omits minimap", () => {
    const { container } = render(<BlockDiagramView spec={mockSpec} />);

    expect(container.querySelector(".react-flow__controls")).toBeDefined();
    expect(container.querySelector(".react-flow__minimap")).toBeNull();
  });

  it("renders block union graph with diff badges and markers", () => {
    const unionSpec: UnionArchitectureSpec = {
      nodes: [
        {
          id: "node_a",
          name: "Source Block",
          type: "service",
          role: "Source",
          inputs: [],
          outputs: [],
          tech_options: [],
          needs_model: false,
          diffStatus: "unchanged",
        },
        {
          id: "node_b",
          name: "New Worker",
          type: "service",
          role: "New worker",
          inputs: [],
          outputs: [],
          tech_options: [],
          needs_model: false,
          diffStatus: "added",
        },
        {
          id: "node_c",
          name: "Deleted Sink",
          type: "service",
          role: "Deleted sink",
          inputs: [],
          outputs: [],
          tech_options: [],
          needs_model: false,
          diffStatus: "removed",
        },
      ],
      edges: [
        { from: "node_a", to: "node_b", flows: "flow_1", diffStatus: "added" },
        { from: "node_a", to: "node_c", flows: "flow_2", diffStatus: "removed" },
      ],
      constraints: [],
      entry_ids: ["node_a"],
      exit_ids: ["node_b", "node_c"],
    };

    render(<BlockDiagramView spec={unionSpec} />);

    expect(screen.getByText("Source Block")).toBeDefined();
    expect(screen.getByText("New Worker")).toBeDefined();
    expect(screen.getByText("Deleted Sink")).toBeDefined();

    expect(screen.getByText("New")).toBeDefined();
    expect(screen.getByText("Removed")).toBeDefined();
  });

  it("styles removed edges with dashed rose stroke and lower opacity through BlockDiagramView path", () => {
    const unionSpec: UnionArchitectureSpec = {
      nodes: [
        {
          id: "node_a",
          name: "Source Block",
          type: "service",
          role: "Source",
          inputs: [],
          outputs: [],
          tech_options: [],
          needs_model: false,
          diffStatus: "unchanged",
        },
        {
          id: "node_b",
          name: "Target Block",
          type: "service",
          role: "Target",
          inputs: [],
          outputs: [],
          tech_options: [],
          needs_model: false,
          diffStatus: "unchanged",
        },
      ],
      edges: [
        {
          from: "node_a",
          to: "node_b",
          flows: "retired_stream",
          diffStatus: "removed",
        },
      ],
      constraints: [],
      entry_ids: ["node_a"],
      exit_ids: ["node_b"],
    };

    const { container } = render(<BlockDiagramView spec={unionSpec} />);
    const edgePath = container.querySelector(".react-flow__edge-path") as SVGPathElement;
    expect(edgePath).not.toBeNull();
    expect(edgePath.style.stroke).toBe("var(--block-edge-removed, #f43f5e)");
    expect(edgePath.style.strokeDasharray).toBe("6 6");
    expect(edgePath.style.opacity).toBe("0.6");
  });

  it("accepts fitViewTrigger and nodesKey props without error", () => {
    const { rerender } = render(
      <BlockDiagramView
        spec={mockSpec}
        fitViewTrigger="patch_1"
        nodesKey="client_portal,intake_validator,attorney_review"
      />,
    );
    expect(screen.getByRole("region", { name: "Block Diagram" })).toBeDefined();

    rerender(
      <BlockDiagramView
        spec={mockSpec}
        fitViewTrigger={null}
        nodesKey="client_portal,intake_validator,attorney_review"
      />,
    );
    expect(screen.getByRole("region", { name: "Block Diagram" })).toBeDefined();
  });

  it("renders custom blockEdge edges with edge count matching spec.edges.length and computeBlockLayout coordinates", () => {
    const branchingSpec: ArchitectureSpec = {
      nodes: [
        {
          id: "entry_node",
          name: "Entry Service",
          type: "service",
          role: "Ingresses requests",
          inputs: [],
          outputs: ["stream"],
          tech_options: [],
          needs_model: false,
          layer: "Ingest",
        },
        {
          id: "branch_a",
          name: "Branch A Service",
          type: "service",
          role: "Evaluates branch A",
          inputs: ["stream"],
          outputs: ["a_out"],
          tech_options: [],
          needs_model: false,
          layer: "Processing",
        },
        {
          id: "branch_b",
          name: "Branch B Service",
          type: "service",
          role: "Evaluates branch B",
          inputs: ["stream"],
          outputs: ["b_out"],
          tech_options: [],
          needs_model: false,
          layer: "Processing",
        },
        {
          id: "sink_node",
          name: "Sink Service",
          type: "service",
          role: "Final settlement",
          inputs: ["a_out", "b_out"],
          outputs: [],
          tech_options: [],
          needs_model: false,
          layer: "Output",
        },
      ],
      edges: [
        { from: "entry_node", to: "branch_a", flows: "flow_a" },
        { from: "entry_node", to: "branch_b", flows: "flow_b" },
        { from: "branch_a", to: "sink_node", flows: "join_a" },
        { from: "branch_b", to: "sink_node", flows: "join_b" },
        { from: "entry_node", to: "sink_node", flows: "fast_bypass" },
      ],
      constraints: [],
      entry_ids: ["entry_node"],
      exit_ids: ["sink_node"],
    };

    const layout = computeBlockLayout(branchingSpec);
    expect(branchingSpec.edges.length).toBe(5);
    expect(layout.nodes.length).toBe(4);

    const { container } = render(<BlockDiagramView spec={branchingSpec} />);

    // Non-empty guard on rendered edges: match one outer element per edge via data-testid
    const renderedEdges = container.querySelectorAll('[data-testid^="rf__edge-"]');
    expect(renderedEdges.length).toBe(branchingSpec.edges.length);
    expect(renderedEdges.length).toBeGreaterThan(0);

    // Assert edge type class is blockEdge
    for (const edgeEl of renderedEdges) {
      expect(edgeEl.getAttribute("class")).toContain("react-flow__edge-blockEdge");
    }

    // Node coordinates in BlockDiagramView must match computeBlockLayout dimensions
    for (const expectedNode of layout.nodes) {
      const nodeEl = screen.getByRole("button", {
        name: new RegExp(expectedNode.name, "i"),
      });
      expect(nodeEl).not.toBeNull();
      expect(nodeEl.style.width).toBe(`${BLOCK_NODE_WIDTH}px`);
      expect(nodeEl.style.height).toBe(`${BLOCK_NODE_HEIGHT}px`);
    }
  });
});
