import { describe, expect, it } from "vitest";
import type { ArchitectureSpec, NodeSpec } from "@/lib/types";
import {
  computeLayout,
  computeNodeDimensions,
  DIAMOND_INNER_WIDTH,
  DIAMOND_MAX_HEIGHT,
  DIAMOND_MIN_HEIGHT,
  estimateLabelWidth,
  HEXAGON_MAX_HEIGHT,
  HEXAGON_MIN_HEIGHT,
  MAX_LABEL_TOTAL_WIDTH,
  MIN_RANKSEP,
  NODE_WIDTH,
  RECT_MAX_HEIGHT,
  RECT_MIN_HEIGHT,
} from "./layout";

function makeNode(id: string, name: string): NodeSpec {
  return {
    id,
    name,
    type: "service",
    role: `Role of ${name}`,
    inputs: [],
    outputs: [],
    tech_options: [],
    needs_model: false,
  };
}

function checkNoOverlaps(
  nodes: { id: string; position: { x: number; y: number }; width: number; height: number }[],
) {
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      if (!a || !b) continue;

      const aLeft = a.position.x;
      const aRight = a.position.x + a.width;
      const aTop = a.position.y;
      const aBottom = a.position.y + a.height;

      const bLeft = b.position.x;
      const bRight = b.position.x + b.width;
      const bTop = b.position.y;
      const bBottom = b.position.y + b.height;

      const overlapsHorizontally = aLeft < bRight && aRight > bLeft;
      const overlapsVertically = aTop < bBottom && aBottom > bTop;

      const overlaps = overlapsHorizontally && overlapsVertically;
      expect(
        overlaps,
        `Node ${a.id} [${aLeft},${aTop}] overlaps with Node ${b.id} [${bLeft},${bTop}]`,
      ).toBe(false);
    }
  }
}

describe("computeLayout DAG layout engine (Top-to-Bottom TB)", () => {
  it("positions nodes without overlapping boxes and connects every edge endpoint", () => {
    const spec: ArchitectureSpec = {
      nodes: [
        makeNode("client", "Web Client"),
        makeNode("gateway", "API Gateway"),
        makeNode("worker", "Background Worker"),
        makeNode("db", "PostgreSQL Database"),
      ],
      edges: [
        { from: "client", to: "gateway", flows: "HTTP Request" },
        { from: "gateway", to: "worker", flows: "Task Queue" },
        { from: "worker", to: "db", flows: "SQL Insert" },
      ],
      constraints: [],
      entry_ids: ["client"],
      exit_ids: ["db"],
    };

    const layout = computeLayout(spec);
    expect(layout.nodes).toHaveLength(4);
    expect(layout.edges).toHaveLength(3);

    // Verify all nodes have fixed 240px width and bounded heights
    for (const node of layout.nodes) {
      expect(node.width).toBe(NODE_WIDTH);
      expect(node.height).toBeGreaterThanOrEqual(RECT_MIN_HEIGHT);
      expect(node.height).toBeLessThanOrEqual(DIAMOND_MAX_HEIGHT);
    }

    // No overlaps
    checkNoOverlaps(layout.nodes);

    // Every edge has valid source and target nodes with coordinates
    const nodeMap = new Map(layout.nodes.map((n) => [n.id, n]));
    for (const edge of layout.edges) {
      const src = nodeMap.get(edge.source);
      const tgt = nodeMap.get(edge.target);
      expect(src).toBeDefined();
      expect(tgt).toBeDefined();
      expect(typeof src?.position.x).toBe("number");
      expect(typeof tgt?.position.x).toBe("number");
    }

    // Top-to-bottom monotonicity: y(client) < y(gateway) < y(worker) < y(db)
    const client = nodeMap.get("client")!;
    const gateway = nodeMap.get("gateway")!;
    const worker = nodeMap.get("worker")!;
    const db = nodeMap.get("db")!;

    expect(client.position.y).toBeLessThan(gateway.position.y);
    expect(gateway.position.y).toBeLessThan(worker.position.y);
    expect(worker.position.y).toBeLessThan(db.position.y);
  });

  it("produces deterministic output across repeated runs regardless of input node ordering", () => {
    const spec1: ArchitectureSpec = {
      nodes: [
        makeNode("n1", "Node 1"),
        makeNode("n2", "Node 2"),
        makeNode("n3", "Node 3"),
      ],
      edges: [
        { from: "n1", to: "n2", flows: "f1" },
        { from: "n2", to: "n3", flows: "f2" },
      ],
      constraints: [],
      entry_ids: ["n1"],
      exit_ids: ["n3"],
    };

    // Reverse order
    const spec2: ArchitectureSpec = {
      nodes: [
        makeNode("n3", "Node 3"),
        makeNode("n1", "Node 1"),
        makeNode("n2", "Node 2"),
      ],
      edges: [
        { from: "n2", to: "n3", flows: "f2" },
        { from: "n1", to: "n2", flows: "f1" },
      ],
      constraints: [],
      entry_ids: ["n1"],
      exit_ids: ["n3"],
    };

    const layout1 = computeLayout(spec1);
    const layout2 = computeLayout(spec2);

    const positions1 = layout1.nodes.map((n) => ({ id: n.id, pos: n.position }));
    const positions2 = layout2.nodes.map((n) => ({ id: n.id, pos: n.position }));

    expect(positions1).toEqual(positions2);
  });

  it("handles a diamond graph (fork and join) without node collision", () => {
    // Diamond: source -> branch_a, branch_b -> sink
    const spec: ArchitectureSpec = {
      nodes: [
        makeNode("source", "Source"),
        makeNode("branch_a", "Branch A"),
        makeNode("branch_b", "Branch B"),
        makeNode("sink", "Sink"),
      ],
      edges: [
        { from: "source", to: "branch_a", flows: "Flow A" },
        { from: "source", to: "branch_b", flows: "Flow B" },
        { from: "branch_a", to: "sink", flows: "Join A" },
        { from: "branch_b", to: "sink", flows: "Join B" },
      ],
      constraints: [],
      entry_ids: ["source"],
      exit_ids: ["sink"],
    };

    const layout = computeLayout(spec);
    expect(layout.nodes).toHaveLength(4);
    checkNoOverlaps(layout.nodes);

    const nodeMap = new Map(layout.nodes.map((n) => [n.id, n]));
    const src = nodeMap.get("source")!;
    const branchA = nodeMap.get("branch_a")!;
    const branchB = nodeMap.get("branch_b")!;
    const sink = nodeMap.get("sink")!;

    expect(src.position.y).toBeLessThan(branchA.position.y);
    expect(src.position.y).toBeLessThan(branchB.position.y);
    expect(branchA.position.y).toBeLessThan(sink.position.y);
    expect(branchB.position.y).toBeLessThan(sink.position.y);

    // branch_a and branch_b share vertical rank but must not overlap horizontally
    expect(Math.abs(branchA.position.x - branchB.position.x)).toBeGreaterThanOrEqual(
      NODE_WIDTH,
    );
  });

  it("handles a two-entry graph with convergence without collision", () => {
    // Two entries converging into a single processor and exit
    const spec: ArchitectureSpec = {
      nodes: [
        makeNode("entry_webhook", "Webhook Ingress"),
        makeNode("entry_batch", "Batch File Poller"),
        makeNode("normalizer", "Data Normalizer"),
        makeNode("storage", "Final Storage"),
      ],
      edges: [
        { from: "entry_webhook", to: "normalizer", flows: "Raw JSON" },
        { from: "entry_batch", to: "normalizer", flows: "CSV records" },
        { from: "normalizer", to: "storage", flows: "Clean records" },
      ],
      constraints: [],
      entry_ids: ["entry_webhook", "entry_batch"],
      exit_ids: ["storage"],
    };

    const layout = computeLayout(spec);
    expect(layout.nodes).toHaveLength(4);
    checkNoOverlaps(layout.nodes);

    const nodeMap = new Map(layout.nodes.map((n) => [n.id, n]));
    const webhook = nodeMap.get("entry_webhook")!;
    const batch = nodeMap.get("entry_batch")!;
    const normalizer = nodeMap.get("normalizer")!;
    const storage = nodeMap.get("storage")!;

    expect(webhook.position.y).toBeLessThan(normalizer.position.y);
    expect(batch.position.y).toBeLessThan(normalizer.position.y);
    expect(normalizer.position.y).toBeLessThan(storage.position.y);

    // The two entry nodes must have horizontal clearance
    expect(Math.abs(webhook.position.x - batch.position.x)).toBeGreaterThanOrEqual(
      NODE_WIDTH,
    );
  });

  describe("Dynamic rank separation based on edge label width", () => {
    it("keeps gap at MIN_RANKSEP (96px) for short labels (1-2 words)", () => {
      const spec: ArchitectureSpec = {
        nodes: [makeNode("src", "Source"), makeNode("tgt", "Target")],
        edges: [{ from: "src", to: "tgt", flows: "auth" }],
        constraints: [],
        entry_ids: ["src"],
        exit_ids: ["tgt"],
      };

      const layout = computeLayout(spec);
      const src = layout.nodes.find((n) => n.id === "src")!;
      const tgt = layout.nodes.find((n) => n.id === "tgt")!;

      const gap = tgt.position.y - (src.position.y + src.height);
      expect(gap).toBe(MIN_RANKSEP);
      expect(gap).toBe(96);

      const labelWidth = estimateLabelWidth("auth");
      expect(labelWidth).toBeLessThanOrEqual(MIN_RANKSEP);
    });

    it("keeps gap at MIN_RANKSEP (96px) when flows text is empty or missing", () => {
      const spec: ArchitectureSpec = {
        nodes: [makeNode("src", "Source"), makeNode("tgt", "Target")],
        edges: [{ from: "src", to: "tgt", flows: "" }],
        constraints: [],
        entry_ids: ["src"],
        exit_ids: ["tgt"],
      };

      const layout = computeLayout(spec);
      const src = layout.nodes.find((n) => n.id === "src")!;
      const tgt = layout.nodes.find((n) => n.id === "tgt")!;

      const gap = tgt.position.y - (src.position.y + src.height);
      expect(gap).toBe(MIN_RANKSEP);
      expect(gap).toBe(96);
      expect(estimateLabelWidth("")).toBe(0);
    });

    it("expands rank gap for labels wider than 96px so label does not intersect node rectangles", () => {
      const flows = "Article Snippets";
      const spec: ArchitectureSpec = {
        nodes: [makeNode("src", "Source"), makeNode("tgt", "Target")],
        edges: [{ from: "src", to: "tgt", flows }],
        constraints: [],
        entry_ids: ["src"],
        exit_ids: ["tgt"],
      };

      const layout = computeLayout(spec);
      const src = layout.nodes.find((n) => n.id === "src")!;
      const tgt = layout.nodes.find((n) => n.id === "tgt")!;

      const labelWidth = estimateLabelWidth(flows);
      expect(labelWidth).toBe(130);
      expect(labelWidth).toBeGreaterThan(MIN_RANKSEP);

      const gap = tgt.position.y - (src.position.y + src.height);
      expect(gap).toBeGreaterThan(MIN_RANKSEP);
      checkNoOverlaps(layout.nodes);
    });

    it("caps very long labels (>40 chars) at MAX_LABEL_TOTAL_WIDTH without unbounded gap growth", () => {
      const longFlow = "draft summary with full precedent citations and statutory references";
      const spec: ArchitectureSpec = {
        nodes: [makeNode("src", "Source"), makeNode("tgt", "Target")],
        edges: [{ from: "src", to: "tgt", flows: longFlow }],
        constraints: [],
        entry_ids: ["src"],
        exit_ids: ["tgt"],
      };

      const layout = computeLayout(spec);
      const labelWidth = estimateLabelWidth(longFlow);
      expect(labelWidth).toBe(MAX_LABEL_TOTAL_WIDTH);
      expect(labelWidth).toBe(168);
      checkNoOverlaps(layout.nodes);
    });

    it("handles diamond graphs with wide labels without node overlaps", () => {
      const spec: ArchitectureSpec = {
        nodes: [
          makeNode("src", "Source"),
          makeNode("b1", "Branch 1"),
          makeNode("b2", "Branch 2"),
          makeNode("sink", "Sink"),
        ],
        edges: [
          { from: "src", to: "b1", flows: "Article Snippets" },
          { from: "src", to: "b2", flows: "auth" },
          { from: "b1", to: "sink", flows: "ok" },
          { from: "b2", to: "sink", flows: "Escalation Ticket" },
        ],
        constraints: [],
        entry_ids: ["src"],
        exit_ids: ["sink"],
      };

      const layout = computeLayout(spec);
      expect(layout.nodes).toHaveLength(4);
      checkNoOverlaps(layout.nodes);

      const nodeMap = new Map(layout.nodes.map((n) => [n.id, n]));
      const src = nodeMap.get("src")!;
      const b1 = nodeMap.get("b1")!;
      const b2 = nodeMap.get("b2")!;
      const sink = nodeMap.get("sink")!;

      expect(src.position.y).toBeLessThan(b1.position.y);
      expect(src.position.y).toBeLessThan(b2.position.y);
      expect(b1.position.y).toBeLessThan(sink.position.y);
      expect(b2.position.y).toBeLessThan(sink.position.y);

      // Verify horizontal separation between branches
      expect(Math.abs(b1.position.x - b2.position.x)).toBeGreaterThanOrEqual(NODE_WIDTH);
    });

    it("handles edges that skip a rank without covering passed nodes", () => {
      const spec: ArchitectureSpec = {
        nodes: [
          makeNode("n1", "Node 1"),
          makeNode("n2", "Node 2"),
          makeNode("n3", "Node 3"),
        ],
        edges: [
          { from: "n1", to: "n2", flows: "step 1" },
          { from: "n2", to: "n3", flows: "step 2" },
          { from: "n1", to: "n3", flows: "long jump" },
        ],
        constraints: [],
        entry_ids: ["n1"],
        exit_ids: ["n3"],
      };

      const layout = computeLayout(spec);
      expect(layout.nodes).toHaveLength(3);
      checkNoOverlaps(layout.nodes);

      const n1 = layout.nodes.find((n) => n.id === "n1")!;
      const n2 = layout.nodes.find((n) => n.id === "n2")!;
      const n3 = layout.nodes.find((n) => n.id === "n3")!;

      expect(n1.position.y).toBeLessThan(n2.position.y);
      expect(n2.position.y).toBeLessThan(n3.position.y);
    });

    it("correctly handles wide and CJK characters in estimateLabelWidth capped at max width", () => {
      const cjkWidth = estimateLabelWidth("架构设计审查");
      expect(cjkWidth).toBe(102);

      const longCjk = "架构设计审查与自动化合规验证流程系统";
      const longCjkWidth = estimateLabelWidth(longCjk);
      expect(longCjkWidth).toBe(MAX_LABEL_TOTAL_WIDTH);
      expect(longCjkWidth).toBe(168);
    });
  });

  describe("computeNodeDimensions pure dimension calculation", () => {
    it("assigns minimum height for short text with minimal or empty role", () => {
      const node = { name: "DB", role: "" };
      expect(DIAMOND_INNER_WIDTH).toBe(112);

      const rectDims = computeNodeDimensions(node, "rectangle");
      expect(rectDims.width).toBe(NODE_WIDTH);
      expect(rectDims.height).toBe(RECT_MIN_HEIGHT);
      expect(rectDims.height).toBe(80);

      const pillDims = computeNodeDimensions(node, "pill");
      expect(pillDims.width).toBe(NODE_WIDTH);
      expect(pillDims.height).toBe(RECT_MIN_HEIGHT);
      expect(pillDims.height).toBe(80);

      const hexDims = computeNodeDimensions(node, "hexagon");
      expect(hexDims.width).toBe(NODE_WIDTH);
      expect(hexDims.height).toBe(HEXAGON_MIN_HEIGHT);
      expect(hexDims.height).toBe(86);

      const diamondDims = computeNodeDimensions(node, "diamond");
      expect(diamondDims.width).toBe(NODE_WIDTH);
      expect(diamondDims.height).toBe(DIAMOND_MIN_HEIGHT);
      expect(diamondDims.height).toBe(140);
    });

    it("clamps at maximum height for long text across all shapes", () => {
      const node = {
        name: "Enterprise Architecture Multi-Region Transaction Orchestration Gateway Service",
        role: "Coordinates end-to-end distributed transaction commits across all primary and backup replica clusters",
      };

      const rectDims = computeNodeDimensions(node, "rectangle");
      expect(rectDims.height).toBe(RECT_MAX_HEIGHT);
      expect(rectDims.height).toBe(130);

      const pillDims = computeNodeDimensions(node, "pill");
      expect(pillDims.height).toBe(RECT_MAX_HEIGHT);
      expect(pillDims.height).toBe(130);

      const hexDims = computeNodeDimensions(node, "hexagon");
      expect(hexDims.height).toBe(HEXAGON_MAX_HEIGHT);
      expect(hexDims.height).toBe(140);

      const diamondDims = computeNodeDimensions(node, "diamond");
      expect(diamondDims.height).toBeGreaterThanOrEqual(DIAMOND_MIN_HEIGHT);
      expect(diamondDims.height).toBeLessThanOrEqual(DIAMOND_MAX_HEIGHT);
      expect(diamondDims.height).toBeGreaterThanOrEqual(
        computeNodeDimensions({ name: "A", role: "" }, "diamond").height,
      );
    });

    it("ensures each shape strictly respects its own clamp range", () => {
      const testCases = [
        { name: "A", role: "" },
        { name: "Simple Node", role: "Short role" },
        { name: "Medium Service Component", role: "Handles data transformation and validation rules" },
        { name: "Complex Branching Engine With Extended Nomenclature", role: "Executes deep risk analysis and routes" },
      ];

      for (const tc of testCases) {
        const rect = computeNodeDimensions(tc, "rectangle");
        expect(rect.height).toBeGreaterThanOrEqual(RECT_MIN_HEIGHT);
        expect(rect.height).toBeLessThanOrEqual(RECT_MAX_HEIGHT);

        const pill = computeNodeDimensions(tc, "pill");
        expect(pill.height).toBeGreaterThanOrEqual(RECT_MIN_HEIGHT);
        expect(pill.height).toBeLessThanOrEqual(RECT_MAX_HEIGHT);

        const hex = computeNodeDimensions(tc, "hexagon");
        expect(hex.height).toBeGreaterThanOrEqual(HEXAGON_MIN_HEIGHT);
        expect(hex.height).toBeLessThanOrEqual(HEXAGON_MAX_HEIGHT);

        const diamond = computeNodeDimensions(tc, "diamond");
        expect(diamond.height).toBeGreaterThanOrEqual(DIAMOND_MIN_HEIGHT);
        expect(diamond.height).toBeLessThanOrEqual(DIAMOND_MAX_HEIGHT);
      }
    });

    it("calculates diamond taller than rectangle for the exact same text and within the new clamp", () => {
      const node = {
        name: "Customer Intent Classifier",
        role: "Evaluates sentiment and routes payload",
      };

      const rect = computeNodeDimensions(node, "rectangle");
      const hex = computeNodeDimensions(node, "hexagon");
      const diamond = computeNodeDimensions(node, "diamond");

      expect(diamond.height).toBeGreaterThan(hex.height);
      expect(diamond.height).toBeGreaterThan(rect.height);
      expect(diamond.height).toBeGreaterThanOrEqual(DIAMOND_MIN_HEIGHT);
      expect(diamond.height).toBeLessThanOrEqual(DIAMOND_MAX_HEIGHT);
    });

    it("does not throw on 100-character unbroken string and stays clamped", () => {
      const unbroken = "A".repeat(100);
      const node = { name: unbroken, role: unbroken };

      expect(() => computeNodeDimensions(node, "diamond")).not.toThrow();
      const dims = computeNodeDimensions(node, "diamond");
      expect(dims.width).toBe(240);
      expect(dims.height).toBeGreaterThanOrEqual(DIAMOND_MIN_HEIGHT);
      expect(dims.height).toBeLessThanOrEqual(DIAMOND_MAX_HEIGHT);
      expect(dims.height).toBeGreaterThanOrEqual(
        computeNodeDimensions({ name: "A", role: "" }, "diamond").height,
      );

      const spec: ArchitectureSpec = {
        nodes: [
          {
            id: "unbroken_node",
            name: unbroken,
            type: "service",
            role: unbroken,
            inputs: [],
            outputs: [],
            tech_options: [],
            needs_model: false,
          },
        ],
        edges: [],
        constraints: [],
        entry_ids: ["unbroken_node"],
        exit_ids: ["unbroken_node"],
      };

      expect(() => computeLayout(spec)).not.toThrow();
      const layout = computeLayout(spec);
      expect(layout.nodes[0]!.width).toBe(240);
      expect(layout.nodes[0]!.height).toBe(RECT_MAX_HEIGHT);
    });

    it("does not execute hostile HTML string and computes cleanly within diamond clamp", () => {
      const hostileNode = {
        name: "<script>alert('xss')</script>",
        role: "<img src=x onerror=alert('xss') />",
      };

      expect(() => computeNodeDimensions(hostileNode, "diamond")).not.toThrow();
      const dims = computeNodeDimensions(hostileNode, "diamond");
      expect(dims.width).toBe(240);
      expect(dims.height).toBeGreaterThanOrEqual(DIAMOND_MIN_HEIGHT);
      expect(dims.height).toBeLessThanOrEqual(DIAMOND_MAX_HEIGHT);
    });
  });
});
