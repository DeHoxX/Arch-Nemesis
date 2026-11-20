import { describe, expect, it } from "vitest";

import type { ArchitectureSpec, NodeSpec } from "@/lib/types";
import {
  BLOCK_NODE_HEIGHT,
  BLOCK_NODE_WIDTH,
  COLUMN_HEADER_HEIGHT,
  COLUMN_PADDING_X,
  computeBlockLayout,
  formatShortRole,
  orderLayers,
  orderLayersBase,
  resolveLayerDisplayNames,
} from "./blockLayout";

describe("blockLayout - Stage V3-4A", () => {
  // ==========================================================================
  // 1. Role Formatter Tests (Condition 7 & Fix 1)
  // ==========================================================================
  describe("formatShortRole", () => {
    it("returns empty string for null, undefined, or empty/whitespace input", () => {
      expect(formatShortRole(null)).toBe("");
      expect(formatShortRole(undefined)).toBe("");
      expect(formatShortRole("")).toBe("");
      expect(formatShortRole("   \n\t  ")).toBe("");
    });

    it("returns first sentence as-is when under 60 chars ending in period", () => {
      expect(formatShortRole("Ingests user orders from webhook.")).toBe(
        "Ingests user orders from webhook.",
      );
    });

    it("handles exclamation and question marks as sentence boundaries", () => {
      expect(formatShortRole("Validates authentication tokens! Then forwards.")).toBe(
        "Validates authentication tokens!",
      );
      expect(formatShortRole("Checks cache readiness? If missing, reloads.")).toBe(
        "Checks cache readiness?",
      );
    });

    it("stops at newline even if no punctuation exists", () => {
      expect(formatShortRole("First line without dot\nSecond line here")).toBe(
        "First line without dot",
      );
    });

    it("preserves exact 60 character sentence without truncation", () => {
      const sentence60 = "A".repeat(59) + ".";
      expect(sentence60.length).toBe(60);
      expect(formatShortRole(sentence60)).toBe(sentence60);
    });

    it("cuts at word boundary and appends '...' when sentence exceeds 60 chars", () => {
      const longRole =
        "Coordinates distributed transactions across multiple microservices with retry guarantees and dead-letter queues.";
      const formatted = formatShortRole(longRole);
      expect(formatted.length).toBeLessThanOrEqual(60);
      expect(formatted.endsWith("...")).toBe(true);
      expect(formatted).toBe(
        "Coordinates distributed transactions across multiple...",
      );
    });

    it("handles long continuous words without spaces by hard truncating at 57 chars plus '...'", () => {
      const longWord = "A".repeat(80) + ".";
      const formatted = formatShortRole(longWord);
      expect(formatted.length).toBe(60);
      expect(formatted).toBe("A".repeat(57) + "...");
    });
  });

  // ==========================================================================
  // 2. Parity Tests with ordering.py (Condition 2 & Fix 2)
  // ==========================================================================
  describe("Backend parity with ordering.py", () => {
    // Hand-Derived Spec 1: Linear Pipeline
    // a (Ingest) -> b (Processing) -> c (Storage)
    // DAG ranks: a=0, b=1, c=2
    // Layer min-ranks: Ingest=0, Processing=1, Storage=2
    it("mirrors Python order_layers on Spec 1 (Linear pipeline)", () => {
      const spec: ArchitectureSpec = {
        nodes: [
          {
            id: "a",
            name: "API Gateway",
            type: "service",
            role: "Entry",
            inputs: [],
            outputs: [],
            tech_options: [],
            needs_model: false,
            layer: "Ingest",
          },
          {
            id: "b",
            name: "Worker",
            type: "service",
            role: "Worker",
            inputs: [],
            outputs: [],
            tech_options: [],
            needs_model: false,
            layer: "Processing",
          },
          {
            id: "c",
            name: "Database",
            type: "database",
            role: "Storage",
            inputs: [],
            outputs: [],
            tech_options: [],
            needs_model: false,
            layer: "Storage",
          },
        ],
        edges: [
          { from: "a", to: "b", flows: "jobs" },
          { from: "b", to: "c", flows: "records" },
        ],
        constraints: [],
        entry_ids: ["a"],
        exit_ids: ["c"],
      };

      const base = orderLayersBase(spec);
      expect(base).toEqual(["Ingest", "Processing", "Storage"]);

      const layoutOrder = orderLayers(spec);
      expect(layoutOrder).toEqual(["Ingest", "Processing", "Storage"]);
    });

    // Hand-Derived Spec 2: Tie-break on identical min-rank
    // root (Intake) -> p1 (Validation), root -> p2 (Analytics)
    // DAG ranks: root=0, p1=1, p2=1
    // Layer min-ranks: Intake=0, Analytics=1, Validation=1
    // Tie-break: "analytics".casefold() < "validation".casefold() -> Analytics before Validation
    it("mirrors Python order_layers tie-breaking on Spec 2", () => {
      const spec: ArchitectureSpec = {
        nodes: [
          {
            id: "root",
            name: "Ingest Router",
            type: "router",
            role: "Routes data",
            inputs: [],
            outputs: [],
            tech_options: [],
            needs_model: false,
            layer: "Intake",
          },
          {
            id: "p1",
            name: "Schema Validator",
            type: "service",
            role: "Validates",
            inputs: [],
            outputs: [],
            tech_options: [],
            needs_model: false,
            layer: "Validation",
          },
          {
            id: "p2",
            name: "Metrics Aggregator",
            type: "service",
            role: "Aggregates",
            inputs: [],
            outputs: [],
            tech_options: [],
            needs_model: false,
            layer: "Analytics",
          },
        ],
        edges: [
          { from: "root", to: "p1", flows: "payload" },
          { from: "root", to: "p2", flows: "telemetry" },
        ],
        constraints: [],
        entry_ids: ["root"],
        exit_ids: ["p1", "p2"],
      };

      const base = orderLayersBase(spec);
      expect(base).toEqual(["Intake", "Analytics", "Validation"]);

      const layoutOrder = orderLayers(spec);
      expect(layoutOrder).toEqual(["Intake", "Analytics", "Validation"]);
    });

    // Hand-Derived Spec 3: Unlayered node + "Other parts" placement rule
    // n1 (Intake) -> n2 (null layer) -> n3 (Delivery)
    // DAG ranks: n1=0, n2=1, n3=2
    // Layer min-ranks: Intake=0, Other parts=1, Delivery=2
    // Base order (Python order_layers): ["Intake", "Other parts", "Delivery"]
    // Frontend layout order (Condition 2 rule): ["Intake", "Delivery", "Other parts"]
    it("mirrors base ordering and enforces 'Other parts' rightmost placement on Spec 3", () => {
      const spec: ArchitectureSpec = {
        nodes: [
          {
            id: "n1",
            name: "Producer",
            type: "service",
            role: "Produces",
            inputs: [],
            outputs: [],
            tech_options: [],
            needs_model: false,
            layer: "Intake",
          },
          {
            id: "n2",
            name: "Sidecar Cache",
            type: "cache",
            role: "Caches",
            inputs: [],
            outputs: [],
            tech_options: [],
            needs_model: false,
            layer: null, // Unassigned -> "Other parts"
          },
          {
            id: "n3",
            name: "Consumer",
            type: "service",
            role: "Consumes",
            inputs: [],
            outputs: [],
            tech_options: [],
            needs_model: false,
            layer: "Delivery",
          },
        ],
        edges: [
          { from: "n1", to: "n2", flows: "events" },
          { from: "n2", to: "n3", flows: "cached" },
        ],
        constraints: [],
        entry_ids: ["n1"],
        exit_ids: ["n3"],
      };

      // Base Python mirror: "Other parts" ranks at index 1
      const base = orderLayersBase(spec);
      expect(base).toEqual(["Intake", "Other parts", "Delivery"]);

      // Layout rule: "Other parts" is shifted to the final rightmost column
      const layoutOrder = orderLayers(spec);
      expect(layoutOrder).toEqual(["Intake", "Delivery", "Other parts"]);
    });

    it("normalizes case and whitespace variants according to Python min(variants)", () => {
      const spec: ArchitectureSpec = {
        nodes: [
          {
            id: "n1",
            name: "N1",
            type: "service",
            role: "R",
            inputs: [],
            outputs: [],
            tech_options: [],
            needs_model: false,
            layer: "  core   logic  ",
          },
          {
            id: "n2",
            name: "N2",
            type: "service",
            role: "R",
            inputs: [],
            outputs: [],
            tech_options: [],
            needs_model: false,
            layer: "Core Logic",
          },
        ],
        edges: [],
        constraints: [],
        entry_ids: [],
        exit_ids: [],
      };

      const displayNames = resolveLayerDisplayNames(spec);
      // "Core Logic" has 'C' (ASCII 67) which is < 'c' (ASCII 99) in "core logic"
      expect(displayNames["core logic"]).toBe("Core Logic");
    });

    // Fix 2 (a): Parity test with layer names "Ingest" and "ingest" in different nodes
    // In Python: min({'Ingest', 'ingest'}) is 'Ingest' because code point 'I' (73) < 'i' (105).
    // Both nodes map to canonical display name 'Ingest', producing a single merged column.
    it("mirrors Python display-name resolution with 'Ingest' and 'ingest' variants", () => {
      const spec: ArchitectureSpec = {
        nodes: [
          {
            id: "n1",
            name: "API Gateway",
            type: "service",
            role: "Receives requests",
            inputs: [],
            outputs: [],
            tech_options: [],
            needs_model: false,
            layer: "ingest",
          },
          {
            id: "n2",
            name: "Webhook Receiver",
            type: "service",
            role: "Receives webhooks",
            inputs: [],
            outputs: [],
            tech_options: [],
            needs_model: false,
            layer: "Ingest",
          },
        ],
        edges: [],
        constraints: [],
        entry_ids: ["n1", "n2"],
        exit_ids: [],
      };

      const displayNames = resolveLayerDisplayNames(spec);
      expect(displayNames["ingest"]).toBe("Ingest");

      const base = orderLayersBase(spec);
      expect(base).toEqual(["Ingest"]);

      const layout = computeBlockLayout(spec);
      expect(layout.columns.map((c) => c.name)).toEqual(["Ingest"]);
      expect(layout.nodes.map((n) => n.layer)).toEqual(["Ingest", "Ingest"]);
    });

    // Fix 2 (b): Tie on min rank between "Ärzte" and "Analytics"
    // In Python:
    // DAG rank of both is 0.
    // Python casefold:
    // 'Ärzte'.casefold() = 'ärzte' (code point for 'ä' is U+00E4 = 228)
    // 'Analytics'.casefold() = 'analytics' (code point for 'a' is U+0061 = 97)
    // In Python tuple comparison: (0, 'analytics', 'Analytics') < (0, 'ärzte', 'Ärzte') because 97 < 228.
    // Result in Python is ['Analytics', 'Ärzte'].
    it("mirrors Python code-point ordering on min rank tie between 'Ärzte' and 'Analytics'", () => {
      const spec: ArchitectureSpec = {
        nodes: [
          {
            id: "n_aerzte",
            name: "Doctors Portal",
            type: "service",
            role: "Portal",
            inputs: [],
            outputs: [],
            tech_options: [],
            needs_model: false,
            layer: "Ärzte",
          },
          {
            id: "n_analytics",
            name: "Telemetry Pipeline",
            type: "service",
            role: "Telemetry",
            inputs: [],
            outputs: [],
            tech_options: [],
            needs_model: false,
            layer: "Analytics",
          },
        ],
        edges: [],
        constraints: [],
        entry_ids: ["n_aerzte", "n_analytics"],
        exit_ids: [],
      };

      const base = orderLayersBase(spec);
      expect(base).toEqual(["Analytics", "Ärzte"]);

      const layoutOrder = orderLayers(spec);
      expect(layoutOrder).toEqual(["Analytics", "Ärzte"]);
    });
  });

  // ==========================================================================
  // 3. Fallback for Unlayered Designs (Condition 3)
  // ==========================================================================
  describe("DAG Depth Fallback for unlayered designs", () => {
    it("groups nodes into Stage 1, Stage 2, Stage 3 columns based on DAG depth", () => {
      const spec: ArchitectureSpec = {
        nodes: [
          {
            id: "s1",
            name: "Entry S1",
            type: "service",
            role: "R",
            inputs: [],
            outputs: [],
            tech_options: [],
            needs_model: false,
            layer: "", // empty
          },
          {
            id: "s2",
            name: "Mid S2",
            type: "service",
            role: "R",
            inputs: [],
            outputs: [],
            tech_options: [],
            needs_model: false,
            layer: "   ", // whitespace only
          },
          {
            id: "s3",
            name: "Sink S3",
            type: "service",
            role: "R",
            inputs: [],
            outputs: [],
            tech_options: [],
            needs_model: false,
            layer: null, // null
          },
        ],
        edges: [
          { from: "s1", to: "s2", flows: "f1" },
          { from: "s2", to: "s3", flows: "f2" },
        ],
        constraints: [],
        entry_ids: ["s1"],
        exit_ids: ["s3"],
      };

      const layout = computeBlockLayout(spec);
      expect(layout.columns.map((c) => c.name)).toEqual([
        "Stage 1",
        "Stage 2",
        "Stage 3",
      ]);

      const nodeColMap = new Map(layout.nodes.map((n) => [n.id, n.layer]));
      expect(nodeColMap.get("s1")).toBe("Stage 1");
      expect(nodeColMap.get("s2")).toBe("Stage 2");
      expect(nodeColMap.get("s3")).toBe("Stage 3");
    });
  });

  // ==========================================================================
  // 4. Determinism & Sorting (Condition 4)
  // ==========================================================================
  describe("Determinism and Column Sorting", () => {
    it("produces identical node coordinates when input nodes and edges are shuffled", () => {
      const nodeA: NodeSpec = {
        id: "a",
        name: "Alpha",
        type: "service",
        role: "A",
        inputs: [],
        outputs: [],
        tech_options: [],
        needs_model: false,
        layer: "Ingest",
      };
      const nodeB: NodeSpec = {
        id: "b",
        name: "Beta",
        type: "service",
        role: "B",
        inputs: [],
        outputs: [],
        tech_options: [],
        needs_model: false,
        layer: "Processing",
      };
      const nodeC: NodeSpec = {
        id: "c",
        name: "Gamma",
        type: "service",
        role: "C",
        inputs: [],
        outputs: [],
        tech_options: [],
        needs_model: false,
        layer: "Processing",
      };

      const specOriginal: ArchitectureSpec = {
        nodes: [nodeA, nodeB, nodeC],
        edges: [
          { from: "a", to: "b", flows: "f1" },
          { from: "b", to: "c", flows: "f2" },
        ],
        constraints: [],
        entry_ids: ["a"],
        exit_ids: ["c"],
      };

      const specShuffled: ArchitectureSpec = {
        nodes: [nodeC, nodeA, nodeB],
        edges: [
          { from: "b", to: "c", flows: "f2" },
          { from: "a", to: "b", flows: "f1" },
        ],
        constraints: [],
        entry_ids: ["a"],
        exit_ids: ["c"],
      };

      const layout1 = computeBlockLayout(specOriginal);
      const layout2 = computeBlockLayout(specShuffled);

      expect(layout1.columns).toEqual(layout2.columns);
      expect(layout1.nodes).toEqual(layout2.nodes);
      expect(layout1.edges).toEqual(layout2.edges);
      expect(layout1.width).toBe(layout2.width);
      expect(layout1.height).toBe(layout2.height);
    });

    it("orders nodes within column by flowOrder first when provided", () => {
      const spec: ArchitectureSpec = {
        nodes: [
          {
            id: "x",
            name: "X",
            type: "service",
            role: "X",
            inputs: [],
            outputs: [],
            tech_options: [],
            needs_model: false,
            layer: "Work",
          },
          {
            id: "y",
            name: "Y",
            type: "service",
            role: "Y",
            inputs: [],
            outputs: [],
            tech_options: [],
            needs_model: false,
            layer: "Work",
          },
        ],
        edges: [],
        constraints: [],
        entry_ids: [],
        exit_ids: [],
      };

      // By default without flowOrder: sorted alphabetically ("x" then "y")
      const layoutDefault = computeBlockLayout(spec);
      expect(layoutDefault.nodes.map((n) => n.id)).toEqual(["x", "y"]);

      // With flowOrder: "y" should appear before "x"
      const layoutWithFlow = computeBlockLayout(spec, ["y", "x"]);
      expect(layoutWithFlow.nodes.map((n) => n.id)).toEqual(["y", "x"]);
      const firstNode = layoutWithFlow.nodes[0];
      const secondNode = layoutWithFlow.nodes[1];
      expect(firstNode).toBeDefined();
      expect(secondNode).toBeDefined();
      if (firstNode && secondNode) {
        expect(firstNode.id).toBe("y");
        expect(firstNode.y).toBeLessThan(secondNode.y);
      }
    });
  });

  // ==========================================================================
  // 5. Backward Edges Detection (Condition 6)
  // ==========================================================================
  describe("Backward Edges Detection", () => {
    it("flags edges where targetColumnIndex <= sourceColumnIndex as isBackward", () => {
      const spec: ArchitectureSpec = {
        nodes: [
          {
            id: "in",
            name: "In",
            type: "service",
            role: "In",
            inputs: [],
            outputs: [],
            tech_options: [],
            needs_model: false,
            layer: "StageA",
          },
          {
            id: "mid1",
            name: "Mid1",
            type: "service",
            role: "Mid1",
            inputs: [],
            outputs: [],
            tech_options: [],
            needs_model: false,
            layer: "StageB",
          },
          {
            id: "mid2",
            name: "Mid2",
            type: "service",
            role: "Mid2",
            inputs: [],
            outputs: [],
            tech_options: [],
            needs_model: false,
            layer: "StageB",
          },
        ],
        edges: [
          // Forward: col 0 -> col 1
          { from: "in", to: "mid1", flows: "forward" },
          // Backward / intra-column: col 1 -> col 1
          { from: "mid1", to: "mid2", flows: "intra" },
          // Backward loop: col 1 -> col 0
          { from: "mid2", to: "in", flows: "loop" },
        ],
        constraints: [],
        entry_ids: ["in"],
        exit_ids: ["mid2"],
      };

      const layout = computeBlockLayout(spec);
      const edgeMap = new Map(layout.edges.map((e) => [e.id, e]));

      expect(edgeMap.get("in->mid1")?.isBackward).toBe(false);
      expect(edgeMap.get("mid1->mid2")?.isBackward).toBe(true);
      expect(edgeMap.get("mid2->in")?.isBackward).toBe(true);
    });
  });

  // ==========================================================================
  // 6. Non-Overlapping Invariant Property Test (Condition 8)
  // ==========================================================================
  describe("Non-Overlapping and Bounding Box Invariants", () => {
    it("ensures no two nodes overlap and all nodes sit inside assigned columns for up to 25 nodes", () => {
      // Build a 25-node graph across 5 layers with branching and backward edges
      const layers = ["Ingest", "Validation", "Transform", "Dispatch", "Other parts"];
      const nodes: NodeSpec[] = [];
      const edges = [];

      for (let i = 0; i < 25; i++) {
        const layer = layers[i % layers.length];
        nodes.push({
          id: `node_${i}`,
          name: `Service Node ${i}`,
          type: "service",
          role: `Handles process step ${i} cleanly.`,
          inputs: [],
          outputs: [],
          tech_options: ["TypeScript"],
          needs_model: i % 4 === 0,
          layer,
        });

        if (i > 0) {
          edges.push({
            from: `node_${i - 1}`,
            to: `node_${i}`,
            flows: `payload_${i}`,
          });
        }
      }

      // Add cross-layer edges
      edges.push({ from: "node_0", to: "node_10", flows: "jump" });
      edges.push({ from: "node_15", to: "node_2", flows: "feedback" });

      const spec: ArchitectureSpec = {
        nodes,
        edges,
        constraints: [],
        entry_ids: ["node_0"],
        exit_ids: ["node_24"],
      };

      const layout = computeBlockLayout(spec);
      expect(layout.nodes.length).toBe(25);

      const colMap = new Map(layout.columns.map((c) => [c.id, c]));

      // 1. Verify every node sits completely inside its assigned column box
      for (const node of layout.nodes) {
        const col = colMap.get(node.layer);
        expect(col).toBeDefined();
        if (!col) continue;

        // Horizontally inside column
        expect(node.x).toBeGreaterThanOrEqual(col.x);
        expect(node.x + BLOCK_NODE_WIDTH).toBeLessThanOrEqual(col.x + col.width);
        expect(node.x).toBe(col.x + COLUMN_PADDING_X);

        // Vertically inside column below header
        expect(node.y).toBeGreaterThanOrEqual(col.y + COLUMN_HEADER_HEIGHT);
        expect(node.y + BLOCK_NODE_HEIGHT).toBeLessThanOrEqual(col.y + col.height);
      }

      // 2. Verify no two nodes overlap: dx >= 240 OR dy >= 92
      for (let i = 0; i < layout.nodes.length; i++) {
        for (let j = i + 1; j < layout.nodes.length; j++) {
          const n1 = layout.nodes[i];
          const n2 = layout.nodes[j];
          if (!n1 || !n2) continue;

          const dx = Math.abs(n1.x - n2.x);
          const dy = Math.abs(n1.y - n2.y);

          const hasNoOverlap = dx >= BLOCK_NODE_WIDTH || dy >= BLOCK_NODE_HEIGHT;
          expect(hasNoOverlap).toBe(true);
        }
      }
    });
  });
});
