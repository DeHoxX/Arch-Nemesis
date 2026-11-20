import React from "react";
import { render, screen } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BLOCK_NODE_HEIGHT,
  BLOCK_NODE_WIDTH,
  formatShortRole,
} from "./blockLayout";
import { BlockNode, type BlockNodeData } from "./BlockNode";

function renderBlockNode(dataOverrides: Partial<BlockNodeData> = {}) {
  const data: BlockNodeData = {
    id: "node_1",
    name: "Customer Intent Router",
    role: "Directs incoming requests to the correct pipeline.",
    layer: "Ingest",
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

describe("BlockNode component (Stage V3-4B)", () => {
  beforeEach(() => {
    document.documentElement.className = "dark";
  });

  afterEach(() => {
    document.documentElement.className = "";
  });

  it("renders node name clearly with text-[13px] and line-clamp-2", () => {
    renderBlockNode({ name: "Customer Intent Router" });

    const nameEl = screen.getByText("Customer Intent Router");
    expect(nameEl).toBeDefined();
    expect(nameEl.classList.contains("line-clamp-2")).toBe(true);
    expect(nameEl.classList.contains("text-[13px]")).toBe(true);
  });

  it("renders single role line via formatShortRole with text-[11px] and text-text-muted", () => {
    const fullRole =
      "Coordinates transactions across multiple distributed services. Second sentence.";
    renderBlockNode({
      role: fullRole,
    });

    const expectedShortRole = formatShortRole(fullRole);
    const roleEl = screen.getByText(expectedShortRole);
    expect(roleEl).toBeDefined();
    expect(roleEl.getAttribute("title")).toBe(fullRole);
    expect(roleEl.classList.contains("text-[11px]")).toBe(true);
    expect(roleEl.classList.contains("text-text-muted")).toBe(true);
  });

  it("renders target handle at Left and source handle at Right", () => {
    const { container } = renderBlockNode();
    const leftHandle = container.querySelector('[data-handlepos="left"]');
    const rightHandle = container.querySelector('[data-handlepos="right"]');
    expect(leftHandle).not.toBeNull();
    expect(rightHandle).not.toBeNull();
  });

  it("renders role='img' and aria-label announcing name and layer", () => {
    renderBlockNode({ name: "Customer Ingress", layer: "Ingest", isEntry: true });

    const el = screen.getByRole("img", { name: "Node: Customer Ingress, Layer: Ingest" });
    expect(el).toBeDefined();
    expect(el.getAttribute("tabindex")).toBeNull();
  });

  it("falls back to 'Other parts' in aria-label when layer is empty", () => {
    renderBlockNode({ name: "Unlayered Node", layer: "" });

    const el = screen.getByRole("img", { name: "Node: Unlayered Node, Layer: Other parts" });
    expect(el).toBeDefined();
  });

  it("renders Entry pill with emerald badge classes when isEntry is true", () => {
    renderBlockNode({ isEntry: true, isExit: false });

    const entryPill = screen.getByText("Entry");
    expect(entryPill).toBeDefined();
    expect(entryPill.classList.contains("text-emerald-700")).toBe(true);
    expect(entryPill.classList.contains("dark:text-emerald-400")).toBe(true);
    expect(screen.queryByText("Exit")).toBeNull();
  });

  it("renders Exit pill with violet badge classes when isExit is true", () => {
    renderBlockNode({ isEntry: false, isExit: true });

    const exitPill = screen.getByText("Exit");
    expect(exitPill).toBeDefined();
    expect(exitPill.classList.contains("text-violet-700")).toBe(true);
    expect(exitPill.classList.contains("dark:text-violet-400")).toBe(true);
    expect(screen.queryByText("Entry")).toBeNull();
  });

  it("renders AI model pill with amber badge classes when needs_model is true", () => {
    renderBlockNode({ needs_model: true });

    const aiPill = screen.getByText("AI");
    expect(aiPill).toBeDefined();
    expect(aiPill.classList.contains("text-amber-700")).toBe(true);
    expect(aiPill.classList.contains("dark:text-amber-400")).toBe(true);
  });

  it("renders Agent pill with amber badge classes when ai_role is 'agent'", () => {
    renderBlockNode({ ai_role: "agent" });

    const agentPill = screen.getByText("Agent");
    expect(agentPill).toBeDefined();
    expect(agentPill.classList.contains("text-amber-700")).toBe(true);
    expect(agentPill.classList.contains("dark:text-amber-400")).toBe(true);
  });

  it("renders all pills (Entry, Exit, AI) together when applicable", () => {
    renderBlockNode({ isEntry: true, isExit: true, needs_model: true });

    expect(screen.getByText("Entry")).toBeDefined();
    expect(screen.getByText("Exit")).toBeDefined();
    expect(screen.getByText("AI")).toBeDefined();
  });

  it("does not render SVG polygon shapes (hexagon, diamond, pill) in Block view", () => {
    const { container } = renderBlockNode({
      isEntry: true,
      needs_model: true,
    });

    expect(container.querySelector("polygon")).toBeNull();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("has fixed card dimensions matching BLOCK_NODE_WIDTH and BLOCK_NODE_HEIGHT", () => {
    const { container } = renderBlockNode();
    const cardEl = container.firstElementChild as HTMLElement;

    expect(cardEl.style.width).toBe(`${BLOCK_NODE_WIDTH}px`);
    expect(cardEl.style.height).toBe(`${BLOCK_NODE_HEIGHT}px`);
  });

  it("applies dual-theme token classes border-line, bg-surface, and dark:bg-card", () => {
    const { container } = renderBlockNode();
    const cardEl = container.firstElementChild as HTMLElement;

    expect(cardEl.classList.contains("border-line")).toBe(true);
    expect(cardEl.classList.contains("bg-surface")).toBe(true);
    expect(cardEl.classList.contains("dark:bg-card")).toBe(true);
  });

  it("renders hostile string safely as literal text without HTML injection", () => {
    const hostileName = "<script>alert('xss')</script>";
    renderBlockNode({ name: hostileName });

    expect(screen.getByText(hostileName)).toBeDefined();
    expect(document.querySelector("script")).toBeNull();
  });

  describe("diffStatus styling", () => {
    it("renders added node with emerald ring and New badge", () => {
      renderBlockNode({ name: "New Worker", diffStatus: "added" });

      expect(screen.getByText("New Worker")).toBeDefined();
      expect(screen.getByText("New")).toBeDefined();
      const el = screen.getByRole("img");
      expect(el.classList.contains("ring-emerald-500")).toBe(true);
      expect(el.getAttribute("aria-label")).toBe("Node: New Worker, Layer: Ingest, added");
    });

    it("renders removed node with dashed rose ring, opacity-70, and Removed badge", () => {
      renderBlockNode({ name: "Dead Sink", diffStatus: "removed" });

      expect(screen.getByText("Dead Sink")).toBeDefined();
      expect(screen.getByText("Removed")).toBeDefined();
      const el = screen.getByRole("img");
      expect(el.classList.contains("ring-rose-500")).toBe(true);
      expect(el.classList.contains("border-dashed")).toBe(true);
      expect(el.classList.contains("opacity-70")).toBe(true);
      expect(el.getAttribute("aria-label")).toBe("Node: Dead Sink, Layer: Ingest, removed");
    });

    it("renders edited node with sky ring and Edited badge", () => {
      renderBlockNode({ name: "Modified Engine", diffStatus: "edited" });

      expect(screen.getByText("Modified Engine")).toBeDefined();
      expect(screen.getByText("Edited")).toBeDefined();
      const el = screen.getByRole("img");
      expect(el.classList.contains("ring-sky-500")).toBe(true);
      expect(el.getAttribute("aria-label")).toBe("Node: Modified Engine, Layer: Ingest, edited");
    });
  });
});
