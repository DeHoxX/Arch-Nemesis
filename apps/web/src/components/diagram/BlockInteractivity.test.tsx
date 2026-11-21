import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ArchitectureSpec, NodeSpec } from "@/lib/types";
import { BlockDiagramView } from "./BlockDiagramView";
import { EDGE_HIT_STROKE_WIDTH } from "./BlockEdge";
import { GUTTER_LANE_GAP_X } from "./blockRouting";

const interactiveSpec: ArchitectureSpec = {
  nodes: [
    {
      id: "node_1",
      name: "Gateway",
      type: "service",
      role: "Receives requests",
      layer: "Ingress",
      inputs: [],
      outputs: ["req"],
      tech_options: [],
      needs_model: false,
    },
    {
      id: "node_2",
      name: "Worker",
      type: "service",
      role: "Processes jobs",
      layer: "Compute",
      inputs: ["req"],
      outputs: ["res"],
      tech_options: [],
      needs_model: false,
    },
    {
      id: "node_3",
      name: "Database",
      type: "db",
      role: "Stores results",
      layer: "Storage",
      inputs: ["res"],
      outputs: [],
      tech_options: [],
      needs_model: false,
    },
  ],
  edges: [
    { from: "node_1", to: "node_2", flows: "req" },
    { from: "node_2", to: "node_3", flows: "res" },
  ],
  constraints: [],
  entry_ids: ["node_1"],
  exit_ids: ["node_3"],
};

describe("BlockInteractivity (Stage V3-4D1)", () => {
  beforeEach(() => {
    document.documentElement.className = "dark";
  });

  afterEach(() => {
    document.documentElement.className = "";
  });

  it("ensures edge hit path strokeWidth does not exceed gutter lane gap", () => {
    expect(EDGE_HIT_STROKE_WIDTH).toBeLessThanOrEqual(GUTTER_LANE_GAP_X);
    expect(EDGE_HIT_STROKE_WIDTH).toBe(8);
  });

  it("selects a node card on click and dims unrelated elements", () => {
    const handleSelectNode = vi.fn();
    render(
      <BlockDiagramView
        spec={interactiveSpec}
        selectedNodeId="node_1"
        onSelectNode={handleSelectNode}
      />,
    );

    const node1Card = screen.getByRole("button", { name: "Node: Gateway, Layer: Ingress" });
    const node3Card = screen.getByRole("button", { name: "Node: Database, Layer: Storage" });

    expect(node1Card.getAttribute("data-selected")).toBe("true");
    expect(node1Card.getAttribute("data-dimmed")).toBe("false");

    // node_3 is not directly connected to node_1, so it should be dimmed
    expect(node3Card.getAttribute("data-dimmed")).toBe("true");
  });

  it("selects a layer header on click and dims nodes outside that layer", () => {
    render(
      <BlockDiagramView
        spec={interactiveSpec}
        selectedLayerName="Ingress"
      />,
    );

    const ingressHeader = screen.getByRole("button", { name: "Layer: Ingress, 1 component" });
    expect(ingressHeader.getAttribute("data-selected")).toBe("true");

    const gatewayCard = screen.getByRole("button", { name: "Node: Gateway, Layer: Ingress" });
    const workerCard = screen.getByRole("button", { name: "Node: Worker, Layer: Compute" });

    expect(gatewayCard.getAttribute("data-dimmed")).toBe("false");
    expect(workerCard.getAttribute("data-dimmed")).toBe("true");
  });

  it("supports keyboard navigation (Enter & Space) on nodes and headers", () => {
    const handleSelectNode = vi.fn();
    const handleSelectLayer = vi.fn();

    render(
      <BlockDiagramView
        spec={interactiveSpec}
        onSelectNode={handleSelectNode}
        onSelectLayer={handleSelectLayer}
      />,
    );

    const gatewayCard = screen.getByRole("button", { name: "Node: Gateway, Layer: Ingress" });
    fireEvent.keyDown(gatewayCard, { key: "Enter" });
    expect(handleSelectNode).toHaveBeenCalledWith("node_1");

    fireEvent.keyDown(gatewayCard, { key: " " });
    expect(handleSelectNode).toHaveBeenCalledWith("node_1");

    const ingressHeader = screen.getByRole("button", { name: "Layer: Ingress, 1 component" });
    fireEvent.keyDown(ingressHeader, { key: "Enter" });
    expect(handleSelectLayer).toHaveBeenCalledWith("Ingress");
  });

  it("clears selection when Escape key is pressed", () => {
    const handleSelectNode = vi.fn();
    const handleSelectLayer = vi.fn();
    const handleSelectEdge = vi.fn();

    render(
      <BlockDiagramView
        spec={interactiveSpec}
        selectedNodeId="node_1"
        onSelectNode={handleSelectNode}
        onSelectLayer={handleSelectLayer}
        onSelectEdge={handleSelectEdge}
      />,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(handleSelectNode).toHaveBeenCalledWith(null);
    expect(handleSelectLayer).toHaveBeenCalledWith(null);
    expect(handleSelectEdge).toHaveBeenCalledWith(null);
  });

  it("preserves correct DOM tab order (headers first, then cards in column flow) on a 25-node fixture", () => {
    // 5 layers, 5 nodes each = 25 nodes
    const layers = ["Ingest", "Queue", "Compute", "Storage", "Analytics"];
    const nodes: NodeSpec[] = [];

    layers.forEach((layer, lIdx) => {
      for (let i = 0; i < 5; i++) {
        nodes.push({
          id: `node_${lIdx}_${i}`,
          name: `${layer} Component ${i + 1}`,
          type: "service",
          role: `Role ${i + 1}`,
          layer,
          inputs: [],
          outputs: [],
          tech_options: [],
          needs_model: false,
        });
      }
    });

    const spec25: ArchitectureSpec = {
      nodes,
      edges: [
        { from: "node_0_0", to: "node_1_0", flows: "flow1" },
        { from: "node_1_0", to: "node_2_0", flows: "flow2" },
      ],
      constraints: [],
      entry_ids: ["node_0_0"],
      exit_ids: ["node_4_4"],
    };

    const { container } = render(<BlockDiagramView spec={spec25} />);

    // Query all interactive buttons (tabIndex 0)
    const interactiveElements = Array.from(
      container.querySelectorAll<HTMLElement>('[tabindex="0"][role="button"]'),
    );

    // Filter out edge hit paths if any
    const headersAndCards = interactiveElements.filter((el) => {
      const label = el.getAttribute("aria-label") || "";
      return label.startsWith("Layer:") || label.startsWith("Node:");
    });

    // We should have 5 layer headers and 25 cards = 30 elements
    expect(headersAndCards.length).toBe(30);

    // The first 5 interactive elements MUST be the 5 layer headers in left-to-right order
    for (let i = 0; i < 5; i++) {
      const element = headersAndCards[i];
      expect(element).toBeDefined();
      expect(element?.getAttribute("aria-label")).toContain("Layer:");
    }

    // The remaining 25 elements MUST be the node cards
    for (let i = 5; i < 30; i++) {
      const element = headersAndCards[i];
      expect(element).toBeDefined();
      expect(element?.getAttribute("aria-label")).toContain("Node:");
    }
  });

  it("applies selection ring classes matching DiagramNode", () => {
    render(
      <BlockDiagramView
        spec={interactiveSpec}
        selectedNodeId="node_1"
      />,
    );

    const node1Card = screen.getByRole("button", { name: "Node: Gateway, Layer: Ingress" });
    expect(node1Card.className).toContain("ring-2");
    expect(node1Card.className).toContain("ring-[var(--brand-accent,#b7c6c2)]");
    expect(node1Card.className).toContain("ring-offset-2");
    expect(node1Card.className).toContain("ring-offset-background");
  });
});
