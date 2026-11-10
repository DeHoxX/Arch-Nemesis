import { describe, expect, it } from "vitest";
import type { ArchitectureSpec, NodeSpec } from "@/lib/types";
import { computeFocusLineage, isEdgeInFocus } from "./focus";

function createMockNode(id: string): NodeSpec {
  return {
    id,
    name: `Node ${id}`,
    type: "service",
    role: `Role for ${id}`,
    inputs: [],
    outputs: [],
    tech_options: [],
    needs_model: false,
  };
}

function createMockSpec(
  nodeIds: string[],
  edges: { from: string; to: string; flows?: string }[] = [],
): Pick<ArchitectureSpec, "nodes"> & { edges: ArchitectureSpec["edges"] } {
  return {
    nodes: nodeIds.map(createMockNode),
    edges: edges.map((e, idx) => ({
      id: `e${idx}`,
      from: e.from,
      to: e.to,
      flows: e.flows || `flow_${e.from}_${e.to}`,
    })),
  };
}

describe("focus.ts pure lineage computation", () => {
  describe("inactive states", () => {
    it("returns inactive lineage when selectedNodeId is null or undefined", () => {
      const spec = createMockSpec(["a", "b"], [{ from: "a", to: "b" }]);
      const lineageNull = computeFocusLineage(spec, null);
      expect(lineageNull.isActive).toBe(false);
      expect(lineageNull.selectedNodeId).toBeNull();
      expect(lineageNull.focusedNodeIds.size).toBe(0);
      expect(isEdgeInFocus(lineageNull, "a", "b")).toBe(true);

      const lineageUndef = computeFocusLineage(spec, undefined);
      expect(lineageUndef.isActive).toBe(false);
    });

    it("returns inactive lineage when selectedNodeId does not exist in spec.nodes", () => {
      const spec = createMockSpec(["a", "b"], [{ from: "a", to: "b" }]);
      const lineage = computeFocusLineage(spec, "non_existent_node");
      expect(lineage.isActive).toBe(false);
      expect(lineage.selectedNodeId).toBeNull();
      expect(lineage.focusedNodeIds.size).toBe(0);
      expect(isEdgeInFocus(lineage, "a", "b")).toBe(true);
    });
  });

  describe("linear pipeline graph", () => {
    // a -> b -> c -> d
    const spec = createMockSpec(
      ["a", "b", "c", "d"],
      [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
        { from: "c", to: "d" },
      ],
    );

    it("focuses ancestors and descendants for a middle node", () => {
      const lineage = computeFocusLineage(spec, "b");
      expect(lineage.isActive).toBe(true);
      expect(lineage.selectedNodeId).toBe("b");

      // Ancestors of b: a, b
      expect(lineage.ancestorsAndSelf.has("a")).toBe(true);
      expect(lineage.ancestorsAndSelf.has("b")).toBe(true);
      expect(lineage.ancestorsAndSelf.size).toBe(2);

      // Descendants of b: b, c, d
      expect(lineage.descendantsAndSelf.has("b")).toBe(true);
      expect(lineage.descendantsAndSelf.has("c")).toBe(true);
      expect(lineage.descendantsAndSelf.has("d")).toBe(true);
      expect(lineage.descendantsAndSelf.size).toBe(3);

      // Total focused: a, b, c, d (all 4 in this single pipeline)
      expect(lineage.focusedNodeIds.size).toBe(4);

      // All edges along the pipeline are focused
      expect(isEdgeInFocus(lineage, "a", "b")).toBe(true);
      expect(isEdgeInFocus(lineage, "b", "c")).toBe(true);
      expect(isEdgeInFocus(lineage, "c", "d")).toBe(true);
    });
  });

  describe("diamond graph branching", () => {
    // entry -> b -> exit
    // entry -> c -> exit
    const spec = createMockSpec(
      ["entry", "b", "c", "exit"],
      [
        { from: "entry", to: "b" },
        { from: "entry", to: "c" },
        { from: "b", to: "exit" },
        { from: "c", to: "exit" },
      ],
    );

    it("focuses only the branch containing the selected node and excludes parallel branch", () => {
      const lineage = computeFocusLineage(spec, "b");
      expect(lineage.isActive).toBe(true);

      // Node c in the parallel branch must NOT be focused
      expect(lineage.focusedNodeIds.has("b")).toBe(true);
      expect(lineage.focusedNodeIds.has("entry")).toBe(true);
      expect(lineage.focusedNodeIds.has("exit")).toBe(true);
      expect(lineage.focusedNodeIds.has("c")).toBe(false);
      expect(lineage.focusedNodeIds.size).toBe(3);

      // Edges on b's path are focused
      expect(isEdgeInFocus(lineage, "entry", "b")).toBe(true);
      expect(isEdgeInFocus(lineage, "b", "exit")).toBe(true);

      // Edges on c's path are NOT focused
      expect(isEdgeInFocus(lineage, "entry", "c")).toBe(false);
      expect(isEdgeInFocus(lineage, "c", "exit")).toBe(false);
    });
  });

  describe("bypass shortcut edge", () => {
    // a -> b -> c
    // a -> c (direct bypass skipping b)
    const spec = createMockSpec(
      ["a", "b", "c"],
      [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
        { from: "a", to: "c" },
      ],
    );

    it("keeps bypass shortcut edge dimmed when both ends belong to focused nodes but neither partition contains both", () => {
      const lineage = computeFocusLineage(spec, "b");
      expect(lineage.isActive).toBe(true);

      expect(lineage.ancestorsAndSelf.has("a")).toBe(true);
      expect(lineage.ancestorsAndSelf.has("b")).toBe(true);
      expect(lineage.ancestorsAndSelf.has("c")).toBe(false);

      expect(lineage.descendantsAndSelf.has("a")).toBe(false);
      expect(lineage.descendantsAndSelf.has("b")).toBe(true);
      expect(lineage.descendantsAndSelf.has("c")).toBe(true);

      // Paths through b are focused
      expect(isEdgeInFocus(lineage, "a", "b")).toBe(true);
      expect(isEdgeInFocus(lineage, "b", "c")).toBe(true);

      // The bypass edge a -> c connects an ancestor directly to a descendant without passing through b
      // Neither ancestorsAndSelf nor descendantsAndSelf contains BOTH a and c
      expect(isEdgeInFocus(lineage, "a", "c")).toBe(false);
    });
  });

  describe("cycles and self-loops safety", () => {
    // a -> b -> a (cycle)
    // b -> c
    const cyclicSpec = createMockSpec(
      ["a", "b", "c"],
      [
        { from: "a", to: "b" },
        { from: "b", to: "a" },
        { from: "b", to: "c" },
        { from: "c", to: "c" }, // self loop
      ],
    );

    it("terminates safely and handles cycles without infinite recursion", () => {
      const lineage = computeFocusLineage(cyclicSpec, "a");
      expect(lineage.isActive).toBe(true);
      expect(lineage.ancestorsAndSelf.has("a")).toBe(true);
      expect(lineage.ancestorsAndSelf.has("b")).toBe(true);
      expect(lineage.descendantsAndSelf.has("a")).toBe(true);
      expect(lineage.descendantsAndSelf.has("b")).toBe(true);
      expect(lineage.descendantsAndSelf.has("c")).toBe(true);
      expect(lineage.focusedNodeIds.size).toBe(3);

      expect(isEdgeInFocus(lineage, "a", "b")).toBe(true);
      expect(isEdgeInFocus(lineage, "b", "a")).toBe(true);
      expect(isEdgeInFocus(lineage, "b", "c")).toBe(true);
      expect(isEdgeInFocus(lineage, "c", "c")).toBe(true);
    });
  });

  describe("large graph scale (25 nodes)", () => {
    it("handles 25-node pipeline with branches accurately", () => {
      const nodeIds = Array.from({ length: 25 }, (_, i) => `n${i}`);
      const edges = [];
      for (let i = 0; i < 24; i++) {
        edges.push({ from: `n${i}`, to: `n${i + 1}` });
      }
      const spec = createMockSpec(nodeIds, edges);

      const lineage = computeFocusLineage(spec, "n10");
      expect(lineage.isActive).toBe(true);
      // Ancestors: n0..n10 = 11 nodes
      expect(lineage.ancestorsAndSelf.size).toBe(11);
      // Descendants: n10..n24 = 15 nodes
      expect(lineage.descendantsAndSelf.size).toBe(15);
      // All 25 nodes are in this linear chain
      expect(lineage.focusedNodeIds.size).toBe(25);
    });
  });
});

