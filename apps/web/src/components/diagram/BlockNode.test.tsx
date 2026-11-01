import React from "react";
import { render, screen } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { BlockNode, type BlockNodeData } from "./BlockNode";

function renderBlockNode(dataOverrides: Partial<BlockNodeData> = {}) {
  const data: BlockNodeData = {
    id: "node_1",
    name: "Customer Intent Router",
    isEntry: false,
    isExit: false,
    ...dataOverrides,
  };

  return render(
    <ReactFlowProvider>
      <BlockNode
        id={data.id}
        data={data}
        type="blockNode"
        selected={false}
        zIndex={1}
        isConnectable={false}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
        dragging={false}
        draggable={false}
        deletable={false}
        selectable={false}
        parentId=""
      />
    </ReactFlowProvider>,
  );
}

describe("BlockNode component", () => {
  it("renders node name clearly", () => {
    renderBlockNode({ name: "Customer Intent Router" });

    expect(screen.getByText("Customer Intent Router")).toBeDefined();
  });

  it("renders role='img' and aria-label announcing name and entry/exit status without tabIndex", () => {
    renderBlockNode({ name: "Customer Ingress", isEntry: true, isExit: false });

    const el = screen.getByRole("img", { name: "Block: Customer Ingress, entry" });
    expect(el).toBeDefined();
    expect(el.getAttribute("tabindex")).toBeNull();
  });

  it("renders [Entry] text marker when isEntry is true", () => {
    renderBlockNode({ isEntry: true, isExit: false });

    const entryMarker = screen.getByText("[Entry]");
    expect(entryMarker).toBeDefined();
    expect(screen.queryByText("[Exit]")).toBeNull();
  });

  it("renders [Exit] text marker when isExit is true", () => {
    renderBlockNode({ isEntry: false, isExit: true });

    const exitMarker = screen.getByText("[Exit]");
    expect(exitMarker).toBeDefined();
    expect(screen.queryByText("[Entry]")).toBeNull();
  });

  it("renders both [Entry] and [Exit] when node is both entry and exit", () => {
    renderBlockNode({ isEntry: true, isExit: true });

    expect(screen.getByText("[Entry]")).toBeDefined();
    expect(screen.getByText("[Exit]")).toBeDefined();
  });

  it("renders no markers when neither entry nor exit", () => {
    renderBlockNode({ isEntry: false, isExit: false });

    expect(screen.queryByText("[Entry]")).toBeNull();
    expect(screen.queryByText("[Exit]")).toBeNull();
  });

  it("omits component type text, roles, badges, and lock icons", () => {
    const { container } = renderBlockNode({
      name: "Simple Node",
      isEntry: false,
      isExit: false,
    });

    // Does not render badges
    expect(container.querySelector(".badge")).toBeNull();
    // Does not render lock svg
    expect(container.querySelector("svg.lucide-lock")).toBeNull();
    // Neutral card container
    const rootEl = container.firstChild as HTMLElement;
    expect(rootEl.className).toContain("border-border/80");
    expect(rootEl.className).toContain("bg-card");
  });

  describe("shape rendering and hostile string safety", () => {
    it("renders pill shape for entry node", () => {
      renderBlockNode({ isEntry: true, isExit: false });
      const el = screen.getByRole("img");
      expect(el.className).toContain("rounded-full");
    });

    it("renders hexagon shape for AI model node", () => {
      renderBlockNode({ isEntry: false, isExit: false, needs_model: true });
      const el = screen.getByRole("img");
      expect(el.className).toContain("px-6");
      const polygon = document.querySelector("polygon");
      expect(polygon).toBeDefined();
    });

    it("renders rectangle shape for standard code node", () => {
      renderBlockNode({ isEntry: false, isExit: false, needs_model: false });
      const el = screen.getByRole("img");
      expect(el.className).toContain("rounded-lg");
    });

    it("renders diamond shape for decision node in block view", () => {
      const { container } = renderBlockNode({
        isEntry: false,
        isExit: false,
        edges: [
          { from: "node_1", to: "b", flows: "f1", condition: "risk > 50" },
          { from: "node_1", to: "c", flows: "f2" },
        ],
      });
      const el = screen.getByRole("img");
      expect(el.className).toContain("px-7");
      const polygon = container.querySelector("polygon");
      expect(polygon).not.toBeNull();
      expect(polygon?.getAttribute("points")).toContain("110,1");
    });

    it("renders hostile string literally without HTML execution", () => {
      const hostileName = "<img src=x onerror=alert(1) />";
      renderBlockNode({ name: hostileName });
      expect(screen.getByText(hostileName)).toBeDefined();
      expect(document.querySelector("img[src='x']")).toBeNull();
    });
  });
});
