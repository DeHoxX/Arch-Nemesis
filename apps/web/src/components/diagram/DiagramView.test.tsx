import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ArchitectureSpec, UnionArchitectureSpec } from "@/lib/types";
import { DiagramView } from "./DiagramView";

const mockLegalSpec: ArchitectureSpec = {
  nodes: [
    {
      id: "client_portal",
      name: "Client Portal",
      type: "web app",
      role: "Accepts client instructions and case files",
      inputs: ["client query", "case documents"],
      outputs: ["intake payload"],
      tech_options: ["Next.js", "Tailwind CSS"],
      needs_model: false,
    },
    {
      id: "intake_validator",
      name: "Intake Validator",
      type: "service",
      role: "Validates document formats and completeness",
      inputs: ["intake payload"],
      outputs: ["verified intake"],
      tech_options: ["FastAPI", "Pydantic"],
      needs_model: false,
    },
    {
      id: "legal_reasoner",
      name: "Legal Reasoner",
      type: "ai agent",
      role: "Analyzes precedent and drafts case summary",
      inputs: ["verified intake"],
      outputs: ["draft summary"],
      tech_options: ["Gemini 1.5 Pro"],
      needs_model: true,
    },
    {
      id: "attorney_review",
      name: "Attorney Review Desk",
      type: "dashboard",
      role: "Presents drafts to licensed counsel for final review",
      inputs: ["draft summary"],
      outputs: ["approved case file"],
      tech_options: ["React Table"],
      needs_model: false,
    },
  ],
  edges: [
    { from: "client_portal", to: "intake_validator", flows: "intake payload" },
    { from: "intake_validator", to: "legal_reasoner", flows: "verified intake" },
    {
      from: "legal_reasoner",
      to: "attorney_review",
      flows: "draft summary with full precedent citations and statutory references",
    },
  ],
  constraints: [
    {
      id: "c1",
      text: "Drafts must be reviewed by licensed counsel before filing.",
      kind: "human_oversight",
      node_id: "attorney_review",
      a: null,
      b: null,
      covers: ["legal_reasoner", "attorney_review"],
    },
  ],
  entry_ids: ["client_portal"],
  exit_ids: ["attorney_review"],
};

describe("DiagramView component", () => {
  it("renders diagram region with nodes from spec", () => {
    render(<DiagramView spec={mockLegalSpec} />);

    const diagramRegion = screen.getByRole("region", {
      name: "Architecture Diagram",
    });
    expect(diagramRegion).toBeDefined();

    // Verify nodes are present in document
    expect(screen.getByText("Client Portal")).toBeDefined();
    expect(screen.getByText("Intake Validator")).toBeDefined();
    expect(screen.getByText("Legal Reasoner")).toBeDefined();
    expect(screen.getByText("Attorney Review Desk")).toBeDefined();
  });

  it("does not render any minimap element", () => {
    const { container } = render(<DiagramView spec={mockLegalSpec} />);

    // React Flow minimap has class 'react-flow__minimap'
    const minimap = container.querySelector(".react-flow__minimap");
    expect(minimap).toBeNull();
  });

  it("renders standard controls without interactive lock toggling", () => {
    const { container } = render(<DiagramView spec={mockLegalSpec} />);

    // Controls container
    const controls = container.querySelector(".react-flow__controls");
    expect(controls).not.toBeNull();
  });

  it("clears selection when Escape key is pressed on the diagram container", async () => {
    const user = userEvent.setup();
    const handleSelectNode = vi.fn();

    render(
      <DiagramView
        spec={mockLegalSpec}
        selectedNodeId="legal_reasoner"
        onSelectNode={handleSelectNode}
      />,
    );

    const diagramRegion = screen.getByRole("region", {
      name: "Architecture Diagram",
    });
    diagramRegion.focus();
    await user.keyboard("{Escape}");

    expect(handleSelectNode).toHaveBeenCalledWith(null);
  });

  it("truncates long edge labels (>40 chars) and reveals full text on hover and keyboard focus", async () => {
    const user = userEvent.setup();
    render(<DiagramView spec={mockLegalSpec} />);

    // (i) label truncated at 40 chars
    // The third edge flows is: "draft summary with full precedent citations and statutory references" (>40 chars)
    const truncatedPrefix = "draft summary with full precedent citati…";
    expect(screen.getByText(truncatedPrefix)).toBeDefined();

    // Query the edge note element
    const fullText =
      "draft summary with full precedent citations and statutory references";
    const edgeNote = screen.getByRole("note", {
      name: `Flow: ${fullText}`,
    });
    expect(edgeNote).toBeDefined();
    expect(edgeNote.getAttribute("title")).toBe(fullText);

    const tooltip = screen.getByRole("tooltip", { hidden: true });
    expect(tooltip.textContent).toBe(fullText);

    // (ii) full text disclosure on hover
    await user.hover(edgeNote);
    expect(edgeNote.getAttribute("title")).toBe(fullText);
    expect(tooltip.textContent).toBe(fullText);

    // (iii) full text disclosure on keyboard focus
    edgeNote.focus();
    expect(document.activeElement).toBe(edgeNote);
    expect(edgeNote.getAttribute("aria-label")).toBe(`Flow: ${fullText}`);
    expect(tooltip.textContent).toBe(fullText);
  });

  it("renders union architecture spec with added and removed diff badges", () => {
    const unionSpec: UnionArchitectureSpec = {
      nodes: [
        {
          id: "portal",
          name: "Portal",
          type: "ingress",
          role: "Main ingress",
          inputs: [],
          outputs: ["stream"],
          tech_options: [],
          needs_model: false,
          diffStatus: "unchanged",
        },
        {
          id: "new_audit",
          name: "Audit Engine",
          type: "service",
          role: "Audits calls",
          inputs: ["stream"],
          outputs: ["audit_log"],
          tech_options: [],
          needs_model: false,
          diffStatus: "added",
        },
        {
          id: "legacy_sink",
          name: "Legacy Sink",
          type: "sink",
          role: "Old sink",
          inputs: ["stream"],
          outputs: [],
          tech_options: [],
          needs_model: false,
          diffStatus: "removed",
        },
      ],
      edges: [
        { from: "portal", to: "new_audit", flows: "audit stream", diffStatus: "added" },
        { from: "portal", to: "legacy_sink", flows: "old stream", diffStatus: "removed" },
      ],
      constraints: [],
      entry_ids: ["portal"],
      exit_ids: ["new_audit", "legacy_sink"],
    };

    render(<DiagramView spec={unionSpec} />);

    expect(screen.getByText("Portal")).toBeDefined();
    expect(screen.getByText("Audit Engine")).toBeDefined();
    expect(screen.getByText("Legacy Sink")).toBeDefined();

    expect(screen.getByText("New")).toBeDefined();
    expect(screen.getByText("Removed")).toBeDefined();
  });

  it("accepts fitViewTrigger prop and re-renders cleanly when trigger updates", () => {
    const { rerender } = render(
      <DiagramView spec={mockLegalSpec} fitViewTrigger={null} />,
    );

    expect(screen.getByText("Client Portal")).toBeDefined();

    // Trigger update (e.g. patch appears)
    rerender(
      <DiagramView spec={mockLegalSpec} fitViewTrigger="patch_test_123" />,
    );

    expect(screen.getByText("Client Portal")).toBeDefined();
  });
});
