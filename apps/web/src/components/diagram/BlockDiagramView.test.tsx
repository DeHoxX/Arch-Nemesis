import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ArchitectureSpec, UnionArchitectureSpec } from "@/lib/types";
import { normalizeColorToHex } from "@/test/helpers";
import { BlockDiagramView } from "./BlockDiagramView";

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

describe("BlockDiagramView component", () => {
  it("renders block diagram region with all nodes as block cards", () => {
    render(<BlockDiagramView spec={mockSpec} />);

    expect(screen.getByRole("region", { name: "Block Diagram" })).toBeDefined();
    expect(screen.getByText("Client Portal")).toBeDefined();
    expect(screen.getByText("Intake Validator")).toBeDefined();
    expect(screen.getByText("Attorney Review Desk")).toBeDefined();
  });

  it("renders entry and exit text markers on appropriate nodes", () => {
    render(<BlockDiagramView spec={mockSpec} />);

    expect(screen.getByText("[Entry]")).toBeDefined();
    expect(screen.getByText("[Exit]")).toBeDefined();
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
    expect(normalizeColorToHex(edgePath.style.stroke)).toBe("#f43f5e");
    expect(edgePath.style.strokeDasharray).toBe("6 6");
    expect(edgePath.style.opacity).toBe("0.6");
  });
});

