import React from "react";
import { render, screen } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { BlockNode, type BlockNodeData } from "./BlockNode";
import { computeNodeDimensions, DIAMOND_INNER_WIDTH } from "./layout";

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

  it("renders target handle at Left and source handle at Right", () => {
    const { container } = renderBlockNode();
    const leftHandle = container.querySelector('[data-handlepos="left"]');
    const rightHandle = container.querySelector('[data-handlepos="right"]');
    expect(leftHandle).not.toBeNull();
    expect(rightHandle).not.toBeNull();
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
      expect(el.className).toContain("px-8");
    });

    it("renders hexagon shape for AI model node", () => {
      renderBlockNode({ isEntry: false, isExit: false, needs_model: true });
      const el = screen.getByRole("img");
      expect(el.className).toContain("px-7");
      const polygon = document.querySelector("polygon");
      expect(polygon).toBeDefined();
    });

    it("renders rectangle shape for standard code node", () => {
      renderBlockNode({ isEntry: false, isExit: false, needs_model: false });
      const el = screen.getByRole("img");
      expect(el.className).toContain("rounded-lg");
      expect(el.className).toContain("px-3");
    });

    it("renders diamond shape with centered inner box in block view", () => {
      const { container } = renderBlockNode({
        isEntry: false,
        isExit: false,
        name: "Claim Evaluator",
        edges: [
          { from: "node_1", to: "b", flows: "f1", condition: "risk > 50" },
          { from: "node_1", to: "c", flows: "f2" },
        ],
      });
      const el = screen.getByRole("img");
      expect(el).toBeDefined();

      const innerBox = container.querySelector(".diamond-inner-box");
      expect(innerBox).not.toBeNull();
      expect(innerBox?.getAttribute("style")).toContain(`width: ${DIAMOND_INNER_WIDTH}px`);
      expect(innerBox?.textContent).toContain("Claim Evaluator");

      const polygon = container.querySelector("polygon");
      expect(polygon).not.toBeNull();
      expect(polygon?.getAttribute("points")).toContain("120,1");
    });

    it("renders diamond with component dimensions matching computeNodeDimensions output", () => {
      const nodeSpec = { name: "Policy Evaluation Gateway" };
      const dims = computeNodeDimensions(nodeSpec, "diamond");

      const { container } = renderBlockNode({
        isEntry: false,
        isExit: false,
        ...nodeSpec,
        width: dims.width,
        height: dims.height,
        edges: [
          { from: "node_1", to: "b", flows: "f1", condition: "score > 90" },
          { from: "node_1", to: "c", flows: "f2" },
        ],
      });

      const rootEl = container.firstElementChild as HTMLElement;
      expect(rootEl.style.width).toBe(`${dims.width}px`);
      expect(rootEl.style.height).toBe(`${dims.height}px`);

      const innerBox = container.querySelector(".diamond-inner-box") as HTMLElement;
      expect(innerBox).not.toBeNull();
      expect(innerBox.style.width).toBe(`${DIAMOND_INNER_WIDTH}px`);
      expect(innerBox.style.maxHeight).toBe(`${Math.round(dims.height * 0.52)}px`);
    });

    it("renders hostile string literally without HTML execution", () => {
      const hostileName = "<img src=x onerror=alert(1) />";
      renderBlockNode({ name: hostileName });
      expect(screen.getByText(hostileName)).toBeDefined();
      expect(document.querySelector("img[src='x']")).toBeNull();
    });
  });

  describe("BlockNode diff styling (Phase 7C3a)", () => {
    it("renders added block node with emerald ring, New badge, and updated aria-label", () => {
      renderBlockNode({
        name: "New Data Pipeline",
        isEntry: false,
        isExit: false,
        diffStatus: "added",
      });

      expect(screen.getByText("New Data Pipeline")).toBeDefined();
      expect(screen.getByText("New")).toBeDefined();

      const el = screen.getByRole("img");
      expect(el.className).toContain("ring-emerald-500");
      expect(el.getAttribute("aria-label")).toBe("Block: New Data Pipeline, added");
    });

    it("renders removed block node with dashed rose ring, opacity-70, Removed badge, and updated aria-label", () => {
      renderBlockNode({
        name: "Legacy Queue",
        isEntry: true,
        isExit: false,
        diffStatus: "removed",
      });

      expect(screen.getByText("Legacy Queue")).toBeDefined();
      expect(screen.getByText("Removed")).toBeDefined();

      const el = screen.getByRole("img");
      expect(el.className).toContain("ring-rose-500");
      expect(el.className).toContain("border-dashed");
      expect(el.className).toContain("opacity-70");
      expect(el.getAttribute("aria-label")).toBe("Block: Legacy Queue, entry, removed");
    });

    it("renders edited block node with sky ring, Edited badge, and updated aria-label", () => {
      renderBlockNode({
        name: "Updated Worker",
        isEntry: false,
        isExit: false,
        diffStatus: "edited",
      });

      expect(screen.getByText("Updated Worker")).toBeDefined();
      expect(screen.getByText("Edited")).toBeDefined();

      const el = screen.getByRole("img");
      expect(el.className).toContain("ring-sky-500");
      expect(el.getAttribute("aria-label")).toBe("Block: Updated Worker, edited");
    });

    it("renders unchanged block node with standard styling and aria-label", () => {
      renderBlockNode({
        name: "Stable Worker",
        isEntry: false,
        isExit: false,
        diffStatus: "unchanged",
      });

      expect(screen.getByText("Stable Worker")).toBeDefined();
      expect(screen.queryByText("New")).toBeNull();
      expect(screen.queryByText("Removed")).toBeNull();
      expect(screen.queryByText("Edited")).toBeNull();

      const el = screen.getByRole("img");
      expect(el.className).not.toContain("ring-emerald-500");
      expect(el.className).not.toContain("ring-rose-500");
      expect(el.className).not.toContain("ring-sky-500");
      expect(el.getAttribute("aria-label")).toBe("Block: Stable Worker");
    });

    describe("Class tests: structural indicators preserved across diffStatus x taxonomy (D-231)", () => {
      const diffStatuses = ["added", "removed", "edited", "unchanged"] as const;

      describe.each(diffStatuses)("when diffStatus is %s", (status) => {
        it("preserves entry marker [Entry] and neutral border", () => {
          renderBlockNode({
            name: "Ingress Block",
            isEntry: true,
            isExit: false,
            diffStatus: status,
          });
          expect(screen.getByText("[Entry]")).toBeDefined();
          const el = screen.getByRole("img");
          expect(el.className).toContain("border-border/80");
        });

        it("preserves exit marker [Exit] and neutral border", () => {
          renderBlockNode({
            name: "Egress Block",
            isEntry: false,
            isExit: true,
            diffStatus: status,
          });
          expect(screen.getByText("[Exit]")).toBeDefined();
          const el = screen.getByRole("img");
          expect(el.className).toContain("border-border/80");
        });

        it("preserves model hexagon SVG stroke stroke-border/80", () => {
          const { container } = renderBlockNode({
            name: "Model Block",
            needs_model: true,
            diffStatus: status,
          });
          const polygon = container.querySelector("polygon");
          expect(polygon).not.toBeNull();
          expect(polygon?.getAttribute("class")).toContain("stroke-border/80");
        });

        it("preserves plain neutral border border-border/80", () => {
          renderBlockNode({
            name: "Plain Block",
            isEntry: false,
            isExit: false,
            needs_model: false,
            diffStatus: status,
          });
          const el = screen.getByRole("img");
          expect(el.className).toContain("border-border/80");
        });
      });
    });
  });

  describe("Block diagram node text centering (Stage 1B addition, D-327)", () => {
    it("renders root container with flex-col items-center justify-center text-center", () => {
      const { container } = renderBlockNode({ name: "Core Processor" });
      const rootEl = container.firstElementChild as HTMLElement;
      expect(rootEl.className).toContain("flex");
      expect(rootEl.className).toContain("flex-col");
      expect(rootEl.className).toContain("items-center");
      expect(rootEl.className).toContain("justify-center");
      expect(rootEl.className).toContain("text-center");
    });

    it("centers node name with text-center and line-clamp-2", () => {
      renderBlockNode({ name: "Account Balances Ledger" });
      const nameEl = screen.getByText("Account Balances Ledger");
      expect(nameEl.className).toContain("text-center");
      expect(nameEl.className).toContain("line-clamp-2");
      expect(nameEl.className).toContain("break-words");
    });

    it("renders [Entry] marker in a centered group with the name", () => {
      renderBlockNode({ name: "API Gateway", isEntry: true, isExit: false });
      const entryMarker = screen.getByText("[Entry]");
      expect(entryMarker).toBeDefined();
      const markerRow = entryMarker.parentElement;
      expect(markerRow).not.toBeNull();
      expect(markerRow?.className).toContain("items-center");
      expect(markerRow?.className).toContain("justify-center");
    });

    it("renders very long names (100+ chars) clamped and centered without breaking layout", () => {
      const longName = "VeryLongMicroserviceNameWithoutSpacesThatMustWrapAndStayCenteredInsideTheBlockContainer".repeat(2);
      renderBlockNode({ name: longName });
      const nameEl = screen.getByText(longName);
      expect(nameEl).toBeDefined();
      expect(nameEl.className).toContain("text-center");
      expect(nameEl.className).toContain("break-words");
    });

    it("renders hostile strings (<script>, **md**) safely centered as literal plain text", () => {
      const hostileName = "<script>alert('xss')</script>";
      const mdName = "**markdown bold**";

      renderBlockNode({ name: hostileName });
      expect(screen.getByText(hostileName)).toBeDefined();
      expect(document.querySelector("script")).toBeNull();

      renderBlockNode({ name: mdName });
      expect(screen.getByText(mdName)).toBeDefined();
      expect(document.querySelector("strong")).toBeNull();
    });
  });
});
