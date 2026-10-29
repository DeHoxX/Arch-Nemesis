import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ArchitectureSpec } from "@/lib/types";
import { FallbackList } from "./FallbackList";

const mockSpec: ArchitectureSpec = {
  nodes: [
    {
      id: "node_b",
      name: "Analysis Worker",
      type: "worker",
      role: "Processes incoming telemetry and scores anomalies",
      inputs: ["telemetry batch"],
      outputs: ["anomaly score"],
      tech_options: [],
      needs_model: true,
    },
    {
      id: "node_a",
      name: "Gateway Service",
      type: "api_gateway",
      role: "Ingests raw telemetry streams from client devices",
      inputs: ["raw stream"],
      outputs: ["telemetry batch"],
      tech_options: [],
      needs_model: false,
    },
    {
      id: "node_c",
      name: "Alert Dispatcher",
      type: "notifier",
      role: "Pushes notifications to on-call engineers",
      inputs: ["anomaly score"],
      outputs: ["pager notification"],
      tech_options: [],
      needs_model: false,
    },
  ],
  edges: [
    { from: "node_a", to: "node_b", flows: "telemetry batch" },
    { from: "node_b", to: "node_c", flows: "anomaly score" },
  ],
  constraints: [],
  entry_ids: ["node_a"],
  exit_ids: ["node_c"],
};

describe("FallbackList component", () => {
  it("renders components in the exact sequence specified by flowOrder", () => {
    // flowOrder: node_a -> node_b -> node_c (reverse of spec.nodes declaration)
    const flowOrder = ["node_a", "node_b", "node_c"];

    render(<FallbackList spec={mockSpec} flowOrder={flowOrder} />);

    const headings = screen.getAllByRole("heading", { level: 4 });
    expect(headings.length).toBe(3);
    expect(headings[0]?.textContent).toBe("Gateway Service");
    expect(headings[1]?.textContent).toBe("Analysis Worker");
    expect(headings[2]?.textContent).toBe("Alert Dispatcher");
  });

  it("displays name, type, role, and the names of target nodes it sends to", () => {
    const flowOrder = ["node_a", "node_b", "node_c"];
    render(<FallbackList spec={mockSpec} flowOrder={flowOrder} />);

    // Node A
    expect(screen.getByText("Gateway Service")).toBeDefined();
    expect(screen.getByText("api_gateway")).toBeDefined();
    expect(
      screen.getByText("Ingests raw telemetry streams from client devices"),
    ).toBeDefined();
    // Sends to target name: "Analysis Worker" (not "node_b")
    expect(screen.getByText("Analysis Worker", { selector: "span" })).toBeDefined();

    // Node C is an exit node: sends to None
    expect(screen.getByText("None (exit node)")).toBeDefined();
  });

  it("displays AI model badge for model-using components", () => {
    render(
      <FallbackList
        spec={mockSpec}
        flowOrder={["node_a", "node_b", "node_c"]}
      />,
    );

    expect(screen.getByText("AI model")).toBeDefined();
  });

  it("invokes onSelectNode when a component item is clicked or activated with Enter/Space", async () => {
    const user = userEvent.setup();
    const handleSelect = vi.fn();

    render(
      <FallbackList
        spec={mockSpec}
        flowOrder={["node_a", "node_b", "node_c"]}
        selectedNodeId="node_a"
        onSelectNode={handleSelect}
      />,
    );

    const items = screen.getAllByRole("button");
    expect(items[0]?.getAttribute("aria-pressed")).toBe("true");

    // Click second item
    const secondItem = items[1];
    expect(secondItem).toBeDefined();
    if (secondItem) {
      await user.click(secondItem);
      expect(handleSelect).toHaveBeenCalledWith("node_b");
    }

    // Press Enter on third item
    handleSelect.mockClear();
    const thirdItem = items[2];
    expect(thirdItem).toBeDefined();
    if (thirdItem) {
      thirdItem.focus();
      await user.keyboard("{Enter}");
      expect(handleSelect).toHaveBeenCalledWith("node_c");
    }
  });
});
