import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ArchitectureSpec } from "@/lib/types";
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
});

