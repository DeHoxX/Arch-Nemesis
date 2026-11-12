import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
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

    // Controls container and buttons
    const controls = container.querySelector(".react-flow__controls");
    expect(controls).not.toBeNull();

    const buttons = container.querySelectorAll(".react-flow__controls-button");
    expect(buttons.length).toBeGreaterThan(0);
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

    // Query the edge button element (D-325)
    const fullText =
      "draft summary with full precedent citations and statutory references";
    const edgeBtn = screen.getByRole("button", {
      name: `Flow: ${fullText}`,
    });
    expect(edgeBtn).toBeDefined();
    expect(edgeBtn.getAttribute("title")).toBe(fullText);

    const tooltip = screen.getByRole("tooltip", { hidden: true });
    expect(tooltip.textContent).toBe(`Flow: ${fullText}`);

    // (ii) full text disclosure on hover
    await user.hover(edgeBtn);
    expect(edgeBtn.getAttribute("title")).toBe(fullText);
    expect(tooltip.textContent).toBe(`Flow: ${fullText}`);

    // (iii) full text disclosure on keyboard focus
    edgeBtn.focus();
    expect(document.activeElement).toBe(edgeBtn);
    expect(edgeBtn.getAttribute("aria-label")).toBe(`Flow: ${fullText}`);
    expect(tooltip.textContent).toBe(`Flow: ${fullText}`);
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

  it("sets descriptive aria-label on edges including human node names, flows, and condition (Stage B1c, D-299)", () => {
    const specWithCond: ArchitectureSpec = {
      nodes: [
        {
          id: "client_portal",
          name: "Client Portal",
          type: "web app",
          role: "Ingress",
          inputs: [],
          outputs: ["intake"],
          tech_options: [],
          needs_model: false,
        },
        {
          id: "intake_validator",
          name: "Intake Validator",
          type: "service",
          role: "Validation",
          inputs: ["intake"],
          outputs: ["verified"],
          tech_options: [],
          needs_model: false,
        },
        {
          id: "attorney_review",
          name: "Attorney Review Desk",
          type: "dashboard",
          role: "Review",
          inputs: ["verified"],
          outputs: [],
          tech_options: [],
          needs_model: false,
        },
      ],
      edges: [
        { from: "client_portal", to: "intake_validator", flows: "intake payload" },
        { from: "intake_validator", to: "attorney_review", flows: "verified case file", condition: "risk_score > 50" },
      ],
      constraints: [],
      entry_ids: ["client_portal"],
      exit_ids: ["attorney_review"],
    };

    const { container } = render(<DiagramView spec={specWithCond} />);

    const edges = Array.from(container.querySelectorAll<SVGElement>(".react-flow__edge"));
    expect(edges.length).toBe(2);

    // Unconditional edge SVG group aria-label
    const expectedEdge1Label = "Flow from Client Portal to Intake Validator: intake payload";
    const edge1 = edges.find((el) => el.getAttribute("aria-label") === expectedEdge1Label);
    expect(edge1).toBeDefined();
    expect(edge1?.getAttribute("aria-label")).toBe(expectedEdge1Label);

    // Conditional edge SVG group aria-label
    const expectedEdge2Label =
      "Flow from Intake Validator to Attorney Review Desk: verified case file, condition: risk_score > 50";
    const edge2 = edges.find((el) => el.getAttribute("aria-label") === expectedEdge2Label);
    expect(edge2).toBeDefined();
    expect(edge2?.getAttribute("aria-label")).toBe(expectedEdge2Label);
  });

  describe("DiagramLegend mounting and Focus highlight dimming (Phase B2+B3)", () => {
    it("mounts DiagramLegend inside the DiagramView container", () => {
      render(<DiagramView spec={mockLegalSpec} />);
      const legendButton = screen.getByRole("button", { name: /toggle diagram legend/i });
      expect(legendButton).toBeDefined();
    });

    const branchingSpec: ArchitectureSpec = {
      nodes: [
        {
          id: "entry_node",
          name: "Entry Service",
          type: "service",
          role: "Ingests data",
          inputs: [],
          outputs: ["stream"],
          tech_options: [],
          needs_model: false,
        },
        {
          id: "branch_b",
          name: "Service B",
          type: "service",
          role: "Processes branch B",
          inputs: ["stream"],
          outputs: ["out_b"],
          tech_options: [],
          needs_model: false,
        },
        {
          id: "branch_c",
          name: "Service C",
          type: "service",
          role: "Processes branch C",
          inputs: ["stream"],
          outputs: ["out_c"],
          tech_options: [],
          needs_model: false,
        },
        {
          id: "exit_node",
          name: "Exit Service",
          type: "service",
          role: "Terminal sink",
          inputs: ["out_b", "out_c"],
          outputs: [],
          tech_options: [],
          needs_model: false,
        },
      ],
      edges: [
        { from: "entry_node", to: "branch_b", flows: "flow_to_b" },
        { from: "branch_b", to: "exit_node", flows: "flow_b_to_exit" },
        { from: "entry_node", to: "branch_c", flows: "flow_to_c" },
        { from: "branch_c", to: "exit_node", flows: "flow_c_to_exit" },
      ],
      constraints: [],
      entry_ids: ["entry_node"],
      exit_ids: ["exit_node"],
    };

    it("dims non-lineage nodes with opacity-30 and non-lineage edges when selectedNodeId is set", () => {
      const { container } = render(<DiagramView spec={branchingSpec} selectedNodeId="branch_b" />);

      const nodeB = screen.getByRole("button", { name: "Node: Service B, service" });
      const nodeC = screen.getByRole("button", { name: "Node: Service C, service" });

      expect(nodeB.className).not.toContain("opacity-30");
      expect(nodeC.className).toContain("opacity-30");

      const edgePathToC = container.querySelector(
        '.react-flow__edge[aria-label*="to Service C"] .react-flow__edge-path',
      ) as SVGPathElement;
      expect(edgePathToC).not.toBeNull();
      expect(edgePathToC.style.opacity).toBe("0.25");

      const edgePathToB = container.querySelector(
        '.react-flow__edge[aria-label*="to Service B"] .react-flow__edge-path',
      ) as SVGPathElement;
      expect(edgePathToB).not.toBeNull();
      expect(edgePathToB.style.opacity).toBe("1");
    });

    it("supports uncontrolled selection fallback and Escape clearing when selectedNodeId prop is undefined", () => {
      render(<DiagramView spec={branchingSpec} />);

      const nodeB = screen.getByRole("button", { name: "Node: Service B, service" });
      const nodeC = screen.getByRole("button", { name: "Node: Service C, service" });

      // Initially neither node is dimmed
      expect(nodeB.className).not.toContain("opacity-30");
      expect(nodeC.className).not.toContain("opacity-30");

      // Click node B directly via fireEvent to avoid triggering d3-drag mousedown
      fireEvent.click(nodeB);

      // Node C is now dimmed internally
      expect(nodeC.className).toContain("opacity-30");
      expect(nodeB.className).not.toContain("opacity-30");

      // Press Escape on the container
      const region = screen.getByRole("region", { name: "Architecture Diagram" });
      expect(region).toBeDefined();
      fireEvent.keyDown(region, { key: "Escape" });

      // Selection cleared: neither is dimmed
      expect(nodeB.className).not.toContain("opacity-30");
      expect(nodeC.className).not.toContain("opacity-30");
    });

    it("dims non-endpoint nodes and other edges when an edge is selected (Stage 1B, D-325)", () => {
      // Branch B edge is between entry_node and branch_b (index 2 in deterministic sorted order:
      // e-branch_b-exit_node-0, e-branch_c-exit_node-1, e-entry_node-branch_b-2, e-entry_node-branch_c-3)
      const { container } = render(
        <DiagramView spec={branchingSpec} selectedEdgeId="e-entry_node-branch_b-2" />,
      );

      const entryNode = screen.getByRole("button", { name: "Node: Entry Service, service" });
      const nodeB = screen.getByRole("button", { name: "Node: Service B, service" });
      const nodeC = screen.getByRole("button", { name: "Node: Service C, service" });
      const exitNode = screen.getByRole("button", { name: "Node: Exit Service, service" });

      // Endpoints of the edge (entry_node and branch_b) stay bright
      expect(entryNode.className).not.toContain("opacity-30");
      expect(nodeB.className).not.toContain("opacity-30");

      // Other nodes (branch_c and exit_node) are dimmed
      expect(nodeC.className).toContain("opacity-30");
      expect(exitNode.className).toContain("opacity-30");

      // Selected edge has opacity 1 and brand-accent stroke; other edge is dimmed to 0.25
      const edgeToC = container.querySelector(
        '.react-flow__edge[aria-label*="to Service C"] .react-flow__edge-path',
      ) as SVGPathElement;
      expect(edgeToC).not.toBeNull();
      expect(edgeToC.style.opacity).toBe("0.25");
    });

    it("synchronizes mutually exclusive node and edge selections and clears on Escape", () => {
      const handleSelectNode = vi.fn();
      const handleSelectEdge = vi.fn();

      render(
        <DiagramView
          spec={branchingSpec}
          onSelectNode={handleSelectNode}
          onSelectEdge={handleSelectEdge}
        />,
      );

      const nodeB = screen.getByRole("button", { name: "Node: Service B, service" });
      fireEvent.click(nodeB);
      expect(handleSelectNode).toHaveBeenCalledWith("branch_b");
      expect(handleSelectEdge).toHaveBeenCalledWith(null);

      // Click edge label button
      const edgeLabelBtn = screen.getByRole("button", { name: /Flow: flow_to_c/ });
      fireEvent.click(edgeLabelBtn);
      expect(handleSelectEdge).toHaveBeenCalled();
      expect(handleSelectNode).toHaveBeenCalledWith(null);

      // Escape key clears both
      const region = screen.getByRole("region", { name: "Architecture Diagram" });
      fireEvent.keyDown(region, { key: "Escape" });
      expect(handleSelectNode).toHaveBeenCalledWith(null);
      expect(handleSelectEdge).toHaveBeenCalledWith(null);
    });

    it("highlights step edge and endpoints, dims others, and shows numbered badges during flow playback (Stage 1C, D-328..D-331)", () => {
      // Step 0 corresponds to Step 1: e-entry_node-branch_b-2
      const { container } = render(
        <DiagramView
          spec={branchingSpec}
          flowOrder={["entry_node", "branch_b", "branch_c", "exit_node"]}
          playbackStepIndex={0}
        />,
      );

      const entryNode = screen.getByRole("button", { name: "Node: Entry Service, service" });
      const nodeB = screen.getByRole("button", { name: "Node: Service B, service" });
      const nodeC = screen.getByRole("button", { name: "Node: Service C, service" });
      const exitNode = screen.getByRole("button", { name: "Node: Exit Service, service" });

      // Endpoints of active step (entry_node and branch_b) stay bright
      expect(entryNode.className).not.toContain("opacity-30");
      expect(nodeB.className).not.toContain("opacity-30");

      // Non-endpoint nodes are dimmed
      expect(nodeC.className).toContain("opacity-30");
      expect(exitNode.className).toContain("opacity-30");

      // Active step edge is highlighted, other edge is dimmed
      const edgeToC = container.querySelector(
        '.react-flow__edge[aria-label*="to Service C"] .react-flow__edge-path',
      ) as SVGPathElement;
      expect(edgeToC).not.toBeNull();
      expect(edgeToC.style.opacity).toBe("0.25");

      // Numbered badges appear on labels ONLY during active playback
      const step1Badge = screen.getByLabelText("Step 1");
      expect(step1Badge).toBeDefined();
      expect(step1Badge.textContent).toBe("1");

      const step2Badge = screen.getByLabelText("Step 2");
      expect(step2Badge).toBeDefined();
      expect(step2Badge.textContent).toBe("2");
    });

    it("resting state shows no numbered badges and Escape or node click exits playback", () => {
      const handlePlaybackChange = vi.fn();
      const { rerender } = render(
        <DiagramView
          spec={branchingSpec}
          flowOrder={["entry_node", "branch_b", "branch_c", "exit_node"]}
          playbackStepIndex={null} // Resting state
          onPlaybackStepChange={handlePlaybackChange}
        />,
      );

      // Resting state: no numbered badges
      expect(screen.queryByLabelText("Step 1")).toBeNull();
      expect(screen.queryByLabelText("Step 2")).toBeNull();

      // Now rerender with active playback
      rerender(
        <DiagramView
          spec={branchingSpec}
          flowOrder={["entry_node", "branch_b", "branch_c", "exit_node"]}
          playbackStepIndex={0}
          onPlaybackStepChange={handlePlaybackChange}
        />,
      );

      expect(screen.getByLabelText("Step 1")).toBeDefined();

      // Pressing Escape exits playback
      const region = screen.getByRole("region", { name: "Architecture Diagram" });
      fireEvent.keyDown(region, { key: "Escape" });
      expect(handlePlaybackChange).toHaveBeenCalledWith(null);

      // Selecting a node exits playback
      const nodeB = screen.getByRole("button", { name: "Node: Service B, service" });
      fireEvent.click(nodeB);
      expect(handlePlaybackChange).toHaveBeenCalledWith(null);
    });
  });
});
