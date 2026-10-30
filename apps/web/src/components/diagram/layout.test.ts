import { describe, expect, it } from "vitest";
import type { ArchitectureSpec, NodeSpec } from "@/lib/types";
import {
  computeLayout,
  estimateLabelWidth,
  MAX_LABEL_TOTAL_WIDTH,
  MIN_RANKSEP,
  NODE_HEIGHT,
  NODE_WIDTH,
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

describe("computeLayout DAG layout engine", () => {
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

    // Verify all nodes have fixed 220x72 size
    for (const node of layout.nodes) {
      expect(node.width).toBe(NODE_WIDTH);
      expect(node.height).toBe(NODE_HEIGHT);
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

    // Left-to-right monotonicity: x(client) < x(gateway) < x(worker) < x(db)
    const client = nodeMap.get("client")!;
    const gateway = nodeMap.get("gateway")!;
    const worker = nodeMap.get("worker")!;
    const db = nodeMap.get("db")!;

    expect(client.position.x).toBeLessThan(gateway.position.x);
    expect(gateway.position.x).toBeLessThan(worker.position.x);
    expect(worker.position.x).toBeLessThan(db.position.x);
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

    expect(src.position.x).toBeLessThan(branchA.position.x);
    expect(src.position.x).toBeLessThan(branchB.position.x);
    expect(branchA.position.x).toBeLessThan(sink.position.x);
    expect(branchB.position.x).toBeLessThan(sink.position.x);

    // branch_a and branch_b share horizontal rank but must not overlap vertically
    expect(Math.abs(branchA.position.y - branchB.position.y)).toBeGreaterThanOrEqual(
      NODE_HEIGHT,
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

    expect(webhook.position.x).toBeLessThan(normalizer.position.x);
    expect(batch.position.x).toBeLessThan(normalizer.position.x);
    expect(normalizer.position.x).toBeLessThan(storage.position.x);

    // The two entry nodes must have vertical clearance
    expect(Math.abs(webhook.position.y - batch.position.y)).toBeGreaterThanOrEqual(
      NODE_HEIGHT,
    );
  });

  describe("Dynamic rank separation based on edge label width", () => {
    it("keeps gap at MIN_RANKSEP (80px) for short labels (1-2 words)", () => {
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

      const gap = tgt.position.x - (src.position.x + src.width);
      expect(gap).toBe(MIN_RANKSEP);
      expect(gap).toBe(80);

      const labelWidth = estimateLabelWidth("auth");
      expect(labelWidth).toBeLessThanOrEqual(80);

      // Label box centered at midpoint does not intersect source or target
      const midpoint = src.position.x + src.width + gap / 2;
      const labelLeft = midpoint - labelWidth / 2;
      const labelRight = midpoint + labelWidth / 2;

      expect(labelLeft).toBeGreaterThanOrEqual(src.position.x + src.width);
      expect(labelRight).toBeLessThanOrEqual(tgt.position.x);
    });

    it("keeps gap at MIN_RANKSEP (80px) when flows text is empty or missing", () => {
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

      const gap = tgt.position.x - (src.position.x + src.width);
      expect(gap).toBe(MIN_RANKSEP);
      expect(gap).toBe(80);
      expect(estimateLabelWidth("")).toBe(0);
    });

    it("expands rank gap for labels wider than 80px so label does not intersect node rectangles", () => {
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
      // "Article Snippets" = 16 chars * 7px + 18px = 130px
      expect(labelWidth).toBe(130);
      expect(labelWidth).toBeGreaterThan(80);

      const gap = tgt.position.x - (src.position.x + src.width);
      // In Dagre, gap is ranksep (80) + labelWidth (130) = 210px
      expect(gap).toBe(210);
      expect(gap).toBeGreaterThan(MIN_RANKSEP);

      // Verify clearance: label centered at midpoint has 40px margin on both sides
      const srcRight = src.position.x + src.width;
      const tgtLeft = tgt.position.x;
      const midpoint = srcRight + gap / 2;
      const labelLeft = midpoint - labelWidth / 2;
      const labelRight = midpoint + labelWidth / 2;

      // Real number assertions
      expect(labelLeft - srcRight).toBe(40);
      expect(tgtLeft - labelRight).toBe(40);
      expect(labelLeft).toBeGreaterThan(srcRight);
      expect(labelRight).toBeLessThan(tgtLeft);
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
      const src = layout.nodes.find((n) => n.id === "src")!;
      const tgt = layout.nodes.find((n) => n.id === "tgt")!;

      const labelWidth = estimateLabelWidth(longFlow);
      expect(labelWidth).toBe(MAX_LABEL_TOTAL_WIDTH);
      expect(labelWidth).toBe(168);

      const gap = tgt.position.x - (src.position.x + src.width);
      expect(gap).toBe(MIN_RANKSEP + MAX_LABEL_TOTAL_WIDTH);
      expect(gap).toBe(248);

      // Verify label centered at midpoint does not intersect either node
      const srcRight = src.position.x + src.width;
      const tgtLeft = tgt.position.x;
      const midpoint = srcRight + gap / 2;
      const labelLeft = midpoint - labelWidth / 2;
      const labelRight = midpoint + labelWidth / 2;

      expect(labelLeft - srcRight).toBe(40);
      expect(tgtLeft - labelRight).toBe(40);
    });

    it("uses the widest label when several edges leave one node to the next rank", () => {
      const spec: ArchitectureSpec = {
        nodes: [
          makeNode("src", "Source"),
          makeNode("b1", "Branch 1"),
          makeNode("b2", "Branch 2"),
        ],
        edges: [
          { from: "src", to: "b1", flows: "short" },
          { from: "src", to: "b2", flows: "Article Snippets" }, // 130px
        ],
        constraints: [],
        entry_ids: ["src"],
        exit_ids: ["b1", "b2"],
      };

      const layout = computeLayout(spec);
      const src = layout.nodes.find((n) => n.id === "src")!;
      const b1 = layout.nodes.find((n) => n.id === "b1")!;
      const b2 = layout.nodes.find((n) => n.id === "b2")!;

      // Both target nodes belong to the next rank; both must share the widened gap of 210px
      const gap1 = b1.position.x - (src.position.x + src.width);
      const gap2 = b2.position.x - (src.position.x + src.width);

      expect(gap1).toBe(210);
      expect(gap2).toBe(210);
      expect(b1.position.x).toBe(b2.position.x);

      checkNoOverlaps(layout.nodes);
    });

    it("handles diamond graphs with wide labels without node overlaps or label-node collision", () => {
      const spec: ArchitectureSpec = {
        nodes: [
          makeNode("src", "Source"),
          makeNode("b1", "Branch 1"),
          makeNode("b2", "Branch 2"),
          makeNode("sink", "Sink"),
        ],
        edges: [
          { from: "src", to: "b1", flows: "Article Snippets" }, // 130px
          { from: "src", to: "b2", flows: "auth" }, // short
          { from: "b1", to: "sink", flows: "ok" }, // short
          { from: "b2", to: "sink", flows: "Escalation Ticket" }, // 137px
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

      expect(src.position.x).toBeLessThan(b1.position.x);
      expect(src.position.x).toBeLessThan(b2.position.x);
      expect(b1.position.x).toBeLessThan(sink.position.x);
      expect(b2.position.x).toBeLessThan(sink.position.x);

      // Verify vertical separation between branches
      expect(Math.abs(b1.position.y - b2.position.y)).toBeGreaterThanOrEqual(NODE_HEIGHT);
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

      expect(n1.position.x).toBeLessThan(n2.position.x);
      expect(n2.position.x).toBeLessThan(n3.position.x);
    });

    it("correctly handles wide and CJK characters in estimateLabelWidth capped at max width", () => {
      // 6 CJK characters = 6 * 2 units * 7px = 84px + 18px = 102px
      const cjkWidth = estimateLabelWidth("架构设计审查");
      expect(cjkWidth).toBe(102);

      // Long CJK string: capped at MAX_LABEL_TOTAL_WIDTH (168px)
      const longCjk = "架构设计审查与自动化合规验证流程系统";
      const longCjkWidth = estimateLabelWidth(longCjk);
      expect(longCjkWidth).toBe(MAX_LABEL_TOTAL_WIDTH);
      expect(longCjkWidth).toBe(168);
    });
  });
});
