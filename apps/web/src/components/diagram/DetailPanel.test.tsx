import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ArchitectureSpec, NodeSpec } from "@/lib/types";
import { DetailPanel } from "./DetailPanel";

const mockSpec: ArchitectureSpec = {
  nodes: [
    {
      id: "intake_portal",
      name: "Intake Portal",
      type: "gateway",
      role: "Receives user input submissions",
      inputs: ["user submission"],
      outputs: ["parsed request"],
      tech_options: [],
      needs_model: false,
    },
    {
      id: "reasoning_engine",
      name: "Reasoning Engine",
      type: "neural agent",
      role: "Drafts comprehensive analysis based on inputs",
      inputs: ["parsed request"],
      outputs: ["preliminary draft"],
      tech_options: ["Gemini 1.5 Pro", "Vector DB"],
      needs_model: true,
    },
    {
      id: "human_review",
      name: "Human Review Desk",
      type: "workstation",
      role: "Review and sign off on drafts",
      inputs: ["preliminary draft"],
      outputs: ["final approval"],
      tech_options: [],
      needs_model: false,
    },
  ],
  edges: [
    { from: "intake_portal", to: "reasoning_engine", flows: "parsed request" },
    { from: "reasoning_engine", to: "human_review", flows: "preliminary draft" },
  ],
  constraints: [
    {
      id: "c1",
      text: "All drafts require licensed counsel approval before transmission.",
      kind: "human_gate",
      node_id: "human_review",
      a: null,
      b: null,
      covers: [],
    },
    {
      id: "c2",
      text: "Reasoning and Intake must communicate via encrypted payload.",
      kind: "encryption",
      node_id: null,
      a: "intake_portal",
      b: "reasoning_engine",
      covers: [],
    },
  ],
  entry_ids: ["intake_portal"],
  exit_ids: ["human_review"],
};

describe("DetailPanel component", () => {
  it("renders null when no node is selected", () => {
    const { container } = render(<DetailPanel node={null} spec={mockSpec} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders exact section sequence for a node with suggestions and AI model", () => {
    const aiNode = mockSpec.nodes[1] as NodeSpec; // reasoning_engine
    render(<DetailPanel node={aiNode} spec={mockSpec} />);

    // 1. Name and type
    expect(screen.getByText("Reasoning Engine")).toBeDefined();
    expect(screen.getByText("neural agent")).toBeDefined();

    // 2. Role
    expect(screen.getByText("Role")).toBeDefined();
    expect(
      screen.getByText("Drafts comprehensive analysis based on inputs"),
    ).toBeDefined();

    // 3. Connected from / Sends to using node names (not IDs)
    expect(screen.getByText("Connected from")).toBeDefined();
    expect(screen.getByText("Intake Portal")).toBeDefined();
    expect(screen.getByText("Sends to")).toBeDefined();
    expect(screen.getByText("Human Review Desk")).toBeDefined();

    // 4. Inputs
    expect(screen.getByText("Inputs")).toBeDefined();
    expect(screen.getByText("parsed request")).toBeDefined();

    // 5. Outputs
    expect(screen.getByText("Outputs")).toBeDefined();
    expect(screen.getByText("preliminary draft")).toBeDefined();

    // 6. Suggestions (not verified) for tech_options
    expect(screen.getByText("Suggestions (not verified)")).toBeDefined();
    expect(screen.getByText("Gemini 1.5 Pro")).toBeDefined();
    expect(screen.getByText("Vector DB")).toBeDefined();

    // 7. Rules this part takes part in
    expect(screen.getByText("Rules this part takes part in")).toBeDefined();
    expect(
      screen.getByText(
        "Reasoning and Intake must communicate via encrypted payload.",
      ),
    ).toBeDefined();

    // AI model statement
    expect(screen.getByText("This part uses an AI model.")).toBeDefined();
  });

  it("hides Suggestions section when tech_options is empty", () => {
    const entryNode = mockSpec.nodes[0] as NodeSpec; // intake_portal (no tech_options)
    render(<DetailPanel node={entryNode} spec={mockSpec} />);

    expect(screen.queryByText("Suggestions (not verified)")).toBeNull();
  });

  it("displays fallback indicators for entry/exit edge endpoints and empty inputs/outputs", () => {
    const isolatedNode: NodeSpec = {
      id: "isolated",
      name: "Isolated Node",
      type: "standalone",
      role: "Performs standalone evaluation",
      inputs: [],
      outputs: [],
      tech_options: [],
      needs_model: false,
    };

    render(<DetailPanel node={isolatedNode} spec={mockSpec} />);

    expect(screen.getByText("None (entry node)")).toBeDefined();
    expect(screen.getByText("None (exit node)")).toBeDefined();
    const noneElements = screen.getAllByText("None");
    expect(noneElements.length).toBeGreaterThanOrEqual(2);
  });

  it("calls onClose when the close button is clicked", async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();

    render(
      <DetailPanel
        node={mockSpec.nodes[0] as NodeSpec}
        spec={mockSpec}
        onClose={handleClose}
      />,
    );

    const closeBtn = screen.getByRole("button", { name: "Close details" });
    await user.click(closeBtn);
    expect(handleClose).toHaveBeenCalledOnce();
  });

  it("displays condition on Sends to target when edge has condition", () => {
    const specWithCond: ArchitectureSpec = {
      ...mockSpec,
      edges: [
        {
          from: "intake_portal",
          to: "reasoning_engine",
          flows: "payload",
          condition: "priority == 'urgent'",
        },
      ],
    };

    render(
      <DetailPanel
        node={specWithCond.nodes[0] as NodeSpec}
        spec={specWithCond}
      />,
    );

    expect(screen.getByText("Reasoning Engine")).toBeDefined();
    expect(screen.getByText("(when: priority == 'urgent')")).toBeDefined();
  });

  it("displays Tools (suggested) section for agent nodes with tools", () => {
    const agentNode: NodeSpec = {
      id: "agent_node",
      name: "Autonomous Researcher",
      type: "agent",
      role: "Conducts deep legal and financial analysis",
      inputs: ["brief"],
      outputs: ["memo"],
      tech_options: [],
      needs_model: true,
      ai_role: "agent",
      tools: ["sec_filings_api", "statute_search"],
    };

    render(<DetailPanel node={agentNode} spec={mockSpec} />);

    expect(screen.getByText("Tools (suggested)")).toBeDefined();
    expect(screen.getByText("sec_filings_api")).toBeDefined();
    expect(screen.getByText("statute_search")).toBeDefined();
  });

  it("omits shortcut buttons when onPrefillChat is not provided", () => {
    render(<DetailPanel node={mockSpec.nodes[0] as NodeSpec} spec={mockSpec} />);

    expect(screen.queryByRole("button", { name: "Ask about this node" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove this node" })).toBeNull();
  });

  it("renders both shortcut buttons when onPrefillChat is provided, and passes exact prefill text", async () => {
    const user = userEvent.setup();
    const handlePrefill = vi.fn();
    const targetNode = mockSpec.nodes[0] as NodeSpec; // Intake Portal

    render(
      <DetailPanel
        node={targetNode}
        spec={mockSpec}
        onPrefillChat={handlePrefill}
      />,
    );

    const askBtn = screen.getByRole("button", { name: "Ask about this node" });
    const removeBtn = screen.getByRole("button", { name: "Remove this node" });
    expect(askBtn).toBeDefined();
    expect(removeBtn).toBeDefined();

    // 1. Click 'Ask about this node'
    await user.click(askBtn);
    expect(handlePrefill).toHaveBeenCalledTimes(1);
    expect(handlePrefill).toHaveBeenLastCalledWith(
      "Tell me about the 'Intake Portal' part: why is it needed and what could go wrong?",
    );

    // 2. Click 'Remove this node'
    await user.click(removeBtn);
    expect(handlePrefill).toHaveBeenCalledTimes(2);
    expect(handlePrefill).toHaveBeenLastCalledWith(
      "Remove the 'Intake Portal' part and fix the connections around it",
    );
  });

  it("handles hostile node name literally in shortcut prefill strings", async () => {
    const user = userEvent.setup();
    const handlePrefill = vi.fn();
    const hostileNode: NodeSpec = {
      id: "hostile_node",
      name: "<script>alert('xss')</script> and 'quotes'",
      type: "service",
      role: "Untrusted evaluation",
      inputs: [],
      outputs: [],
      tech_options: [],
      needs_model: false,
    };

    render(
      <DetailPanel
        node={hostileNode}
        spec={mockSpec}
        onPrefillChat={handlePrefill}
      />,
    );

    const askBtn = screen.getByRole("button", { name: "Ask about this node" });
    await user.click(askBtn);
    expect(handlePrefill).toHaveBeenCalledWith(
      "Tell me about the '<script>alert('xss')</script> and 'quotes'' part: why is it needed and what could go wrong?",
    );

    const removeBtn = screen.getByRole("button", { name: "Remove this node" });
    await user.click(removeBtn);
    expect(handlePrefill).toHaveBeenCalledWith(
      "Remove the '<script>alert('xss')</script> and 'quotes'' part and fix the connections around it",
    );
  });

  it("disables shortcut buttons when disabledShortcuts is true", () => {
    render(
      <DetailPanel
        node={mockSpec.nodes[0] as NodeSpec}
        spec={mockSpec}
        onPrefillChat={vi.fn()}
        disabledShortcuts={true}
      />,
    );

    const askBtn = screen.getByRole("button", { name: "Ask about this node" }) as HTMLButtonElement;
    const removeBtn = screen.getByRole("button", { name: "Remove this node" }) as HTMLButtonElement;

    expect(askBtn.disabled).toBe(true);
    expect(removeBtn.disabled).toBe(true);
  });
});
