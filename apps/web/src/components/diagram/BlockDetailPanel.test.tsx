import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ArchitectureSpec, ConstraintSpec, EdgeSpec, NodeSpec } from "@/lib/types";
import { BlockDetailPanel } from "./BlockDetailPanel";

const mockSpec: ArchitectureSpec = {
  nodes: [
    {
      id: "node_a",
      name: "API Gateway",
      type: "service",
      role: "Routes incoming HTTP requests to internal microservices.",
      layer: "Ingestion",
      inputs: ["Raw HTTP Request"],
      outputs: ["Validated Payload"],
      tech_options: [],
      needs_model: false,
    },
    {
      id: "node_b",
      name: "Processing Worker",
      type: "worker",
      role: "Processes telemetry and writes to database.",
      layer: "Processing",
      inputs: ["Validated Payload"],
      outputs: ["Database Record"],
      tech_options: [],
      needs_model: false,
    },
  ],
  edges: [
    {
      from: "node_a",
      to: "node_b",
      flows: "Validated telemetry payload over gRPC",
      condition: "when payload size < 10MB",
    },
  ],
  constraints: [
    {
      id: "c1",
      text: "API Gateway must authenticate all inbound tokens.",
      kind: "human_gate",
      node_id: "node_a",
      a: null,
      b: null,
      covers: [],
    },
  ],
  entry_ids: ["node_a"],
  exit_ids: ["node_b"],
};

describe("BlockDetailPanel component (Stage V3-4D1)", () => {
  it("renders null when no element is selected", () => {
    const { container } = render(<BlockDetailPanel spec={mockSpec} />);
    expect(container.firstChild).toBeNull();
  });

  describe("Node Mode", () => {
    it("renders node name, layer, full role, inputs, outputs, rules, and connection links", () => {
      const handleClose = vi.fn();
      const handleSelectNode = vi.fn();
      const handleSelectLayer = vi.fn();

      render(
        <BlockDetailPanel
          node={mockSpec.nodes[0]}
          spec={mockSpec}
          onClose={handleClose}
          onSelectNode={handleSelectNode}
          onSelectLayer={handleSelectLayer}
        />,
      );

      // Section header and role
      expect(screen.getByText("API Gateway")).toBeDefined();
      expect(screen.getByText("Routes incoming HTTP requests to internal microservices.")).toBeDefined();

      // Layer pill
      const layerBtn = screen.getByRole("button", { name: "Ingestion" });
      expect(layerBtn).toBeDefined();
      fireEvent.click(layerBtn);
      expect(handleSelectLayer).toHaveBeenCalledWith("Ingestion");

      // Inputs & Outputs
      expect(screen.getByText("Raw HTTP Request")).toBeDefined();
      expect(screen.getByText("Validated Payload")).toBeDefined();

      // Sends to connection (scoped with within to Sends to section, using View button)
      const sendsToHeading = screen.getByText("Sends to");
      const sendsToSection = sendsToHeading.parentElement as HTMLElement;
      expect(within(sendsToSection).getByText("Processing Worker")).toBeDefined();
      const jumpToReceiverBtn = within(sendsToSection).getByRole("button", { name: "View" });
      fireEvent.click(jumpToReceiverBtn);
      expect(handleSelectNode).toHaveBeenCalledWith("node_b");

      // Rules / Constraints
      expect(screen.getByText("API Gateway must authenticate all inbound tokens.")).toBeDefined();

      // Close button
      const closeBtn = screen.getByRole("button", { name: "Close details" });
      fireEvent.click(closeBtn);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it("renders Connected from connection row with accessible View button", () => {
      const handleSelectNode = vi.fn();

      render(
        <BlockDetailPanel
          node={mockSpec.nodes[1]}
          spec={mockSpec}
          onSelectNode={handleSelectNode}
        />,
      );

      const connectedFromHeading = screen.getByText("Connected from");
      const connectedFromSection = connectedFromHeading.parentElement as HTMLElement;
      expect(within(connectedFromSection).getByText("API Gateway")).toBeDefined();
      const jumpToSenderBtn = within(connectedFromSection).getByRole("button", { name: "View" });
      fireEvent.click(jumpToSenderBtn);
      expect(handleSelectNode).toHaveBeenCalledWith("node_a");
    });
  });

  describe("Layer Mode", () => {
    it("renders layer title, count, and member nodes with jump buttons", () => {
      const handleClose = vi.fn();
      const handleSelectNode = vi.fn();

      render(
        <BlockDetailPanel
          layer={{ name: "Ingestion", nodeIds: ["node_a"] }}
          spec={mockSpec}
          onClose={handleClose}
          onSelectNode={handleSelectNode}
        />,
      );

      expect(screen.getByText("Ingestion")).toBeDefined();
      expect(screen.getByText("1 component")).toBeDefined();
      expect(screen.getByText("API Gateway")).toBeDefined();

      const viewBtn = screen.getByRole("button", { name: "View" });
      fireEvent.click(viewBtn);
      expect(handleSelectNode).toHaveBeenCalledWith("node_a");

      const closeBtn = screen.getByRole("button", { name: "Close details" });
      fireEvent.click(closeBtn);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("Edge Mode", () => {
    it("renders source, target, full flows text, and condition with select buttons", () => {
      const handleClose = vi.fn();
      const handleSelectNode = vi.fn();

      render(
        <BlockDetailPanel
          edge={mockSpec.edges[0]}
          spec={mockSpec}
          onClose={handleClose}
          onSelectNode={handleSelectNode}
        />,
      );

      expect(screen.getByText("API Gateway")).toBeDefined();
      expect(screen.getByText("Processing Worker")).toBeDefined();
      expect(screen.getByText("Validated telemetry payload over gRPC")).toBeDefined();
      expect(screen.getByText("when payload size < 10MB")).toBeDefined();

      const selectButtons = screen.getAllByRole("button", { name: "Select" });
      expect(selectButtons).toHaveLength(2);

      const firstBtn = selectButtons[0];
      const secondBtn = selectButtons[1];
      expect(firstBtn).toBeDefined();
      expect(secondBtn).toBeDefined();

      if (firstBtn) fireEvent.click(firstBtn);
      expect(handleSelectNode).toHaveBeenCalledWith("node_a");

      if (secondBtn) fireEvent.click(secondBtn);
      expect(handleSelectNode).toHaveBeenCalledWith("node_b");

      const closeBtn = screen.getByRole("button", { name: "Close details" });
      fireEvent.click(closeBtn);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("Security & Untrusted Text (Rule 5)", () => {
    it("renders hostile HTML/XSS payloads safely as plain text without execution", () => {
      const hostileSender: NodeSpec = {
        id: "xss_sender",
        name: "<script>alert('xss-sender')</script>",
        type: "service",
        role: "Sender role",
        layer: "Ingest",
        inputs: [],
        outputs: [],
        tech_options: [],
        needs_model: false,
      };

      const hostileNode: NodeSpec = {
        id: "xss_node",
        name: "<script>alert('xss-name')</script>",
        type: "service",
        role: "<img src=x onerror=alert('xss-role') />",
        layer: "<svg onload=alert('xss-layer')>",
        inputs: ["<iframe src=javascript:alert('xss-in')></iframe>"],
        outputs: ["\"><script>alert('xss-out')</script>"],
        tech_options: [],
        needs_model: false,
      };

      const hostileReceiver: NodeSpec = {
        id: "xss_receiver",
        name: "<script>alert('xss-receiver')</script>",
        type: "service",
        role: "Receiver role",
        layer: "Storage",
        inputs: [],
        outputs: [],
        tech_options: [],
        needs_model: false,
      };

      const hostileEdgeIn: EdgeSpec = {
        from: "xss_sender",
        to: "xss_node",
        flows: "inflow",
      };

      const hostileEdgeOut: EdgeSpec = {
        from: "xss_node",
        to: "xss_receiver",
        flows: "<script>alert('xss-flow')</script>",
        condition: "<b onmouseover=alert('xss-cond')>bold</b>",
      };

      const hostileConstraint: ConstraintSpec = {
        id: "c_xss",
        text: "<script>alert('xss-rule')</script> for xss_node",
        kind: "rule",
        node_id: "xss_node",
        a: null,
        b: null,
        covers: [],
      };

      const hostileSpec: ArchitectureSpec = {
        nodes: [hostileSender, hostileNode, hostileReceiver],
        edges: [hostileEdgeIn, hostileEdgeOut],
        constraints: [hostileConstraint],
        entry_ids: ["xss_sender"],
        exit_ids: ["xss_receiver"],
      };

      const { container } = render(
        <BlockDetailPanel
          node={hostileNode}
          spec={hostileSpec}
        />,
      );

      // Verify no script, img, iframe, or svg tags were injected into DOM
      expect(container.querySelectorAll("script")).toHaveLength(0);
      expect(container.querySelectorAll("img")).toHaveLength(0);
      expect(container.querySelectorAll("iframe")).toHaveLength(0);
      // Only SVG icons from lucide-react should exist, none with onload
      const allSvgs = container.querySelectorAll("svg");
      allSvgs.forEach((svg) => {
        expect(svg.getAttribute("onload")).toBeNull();
      });

      // Verify plain text contains the literal string representation
      expect(screen.getByText("<script>alert('xss-name')</script>")).toBeDefined();
      expect(screen.getByText("<script>alert('xss-sender')</script>")).toBeDefined();
      expect(screen.getByText("<script>alert('xss-receiver')</script>")).toBeDefined();
      expect(screen.getByText("<img src=x onerror=alert('xss-role') />")).toBeDefined();
      expect(screen.getByText("<iframe src=javascript:alert('xss-in')></iframe>")).toBeDefined();
      expect(screen.getByText("\"><script>alert('xss-out')</script>")).toBeDefined();
      expect(screen.getByText("<script>alert('xss-rule')</script> for xss_node")).toBeDefined();
    });
  });
});
