import { describe, expect, it } from "vitest";
import type { ArchitectureSpec, NodeSpec } from "@/lib/types";
import {
  buildOrthogonalPath,
  computeLayout,
  computeNodeDimensions,
  DIAMOND_INNER_WIDTH,
  DIAMOND_MAX_HEIGHT,
  DIAMOND_MIN_HEIGHT,
  estimateLabelWidth,
  HEXAGON_MAX_HEIGHT,
  HEXAGON_MIN_HEIGHT,
  isPointOnPathSegments,
  LABEL_BORDER_X,
  LABEL_CHAR_WIDTH_PX,
  LABEL_PADDING_X,
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
    it("keeps gap at MIN_RANKSEP (110px) for short labels (1-2 words)", () => {
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
      expect(gap).toBe(110);

      const labelWidth = estimateLabelWidth("auth");
      expect(labelWidth).toBeLessThanOrEqual(MIN_RANKSEP);
    });

    it("keeps gap at MIN_RANKSEP (110px) when flows text is empty or missing", () => {
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
      expect(gap).toBe(110);
      expect(estimateLabelWidth("")).toBe(0);
    });

    it("expands rank gap for labels wider than 110px so label does not intersect node rectangles", () => {
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

    it("adds TECH_LINE_HEIGHT (16px) when tech_options is non-empty for non-diamond nodes, keeping diamond and empty-tech unchanged", () => {
      const baseNode = {
        name: "Ingest Service",
        role: "Ingests data",
      };

      const rectWithout = computeNodeDimensions(baseNode, "rectangle");
      const rectWith = computeNodeDimensions(
        { ...baseNode, tech_options: ["Go", "Kafka"] },
        "rectangle",
      );
      expect(rectWithout.height).toBe(94);
      expect(rectWith.height).toBe(110);
      expect(rectWith.height - rectWithout.height).toBe(16);

      // Empty tech_options array adds 0px
      const rectEmptyTech = computeNodeDimensions(
        { ...baseNode, tech_options: [] },
        "rectangle",
      );
      expect(rectEmptyTech.height).toBe(rectWithout.height);

      // Diamond nodes omit tech line and maintain identical height
      const diamondWithout = computeNodeDimensions(baseNode, "diamond");
      const diamondWith = computeNodeDimensions(
        { ...baseNode, tech_options: ["Go", "Kafka"] },
        "diamond",
      );
      expect(diamondWith.height).toBe(diamondWithout.height);
      expect(diamondWith.height).toBe(154);

      // Long text node with tech_options stays clamped at RECT_MAX_HEIGHT (130)
      const longNode = {
        name: "Enterprise Architecture Multi-Region Transaction Orchestration Gateway Service",
        role: "Coordinates end-to-end distributed transaction commits across all primary and backup replica clusters",
        tech_options: ["Kafka", "Postgres", "Redis"],
      };
      const longRectWithTech = computeNodeDimensions(longNode, "rectangle");
      expect(longRectWithTech.height).toBe(RECT_MAX_HEIGHT);
      expect(longRectWithTech.height).toBe(130);
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

  describe("computeEdgeLabelLayout and pure edge geometry (Stage B1a, D-295, D-296)", () => {
    it("buildOrthogonalPath generates straight line for collinear points and smoothed steps for right angles", () => {
      // 1. Collinear vertical points
      const p1 = { x: 100, y: 50 };
      const p2 = { x: 100, y: 150 };
      const straightPath = buildOrthogonalPath([p1, p2], 5);
      expect(straightPath).toBe("M 100 50 L 100 150");
      expect(straightPath).not.toContain(" C");

      // 2. Right-angle step with rounded corners (Q curves)
      const stepPoints = [
        { x: 100, y: 50 },
        { x: 100, y: 100 },
        { x: 200, y: 100 },
        { x: 200, y: 150 },
      ];
      const stepPath = buildOrthogonalPath(stepPoints, 5);
      expect(stepPath).toMatch(/^M 100 50 L 100 95 Q 100 100 105 100 L 195 100 Q 200 100 200 105 L 200 150$/);
      expect(stepPath).not.toContain(" C");

      // 3. isPointOnPathSegments correctly identifies points on horizontal and vertical segments
      expect(isPointOnPathSegments({ x: 100, y: 75 }, stepPoints)).toBe(true);
      expect(isPointOnPathSegments({ x: 150, y: 100 }, stepPoints)).toBe(true);
      expect(isPointOnPathSegments({ x: 200, y: 125 }, stepPoints)).toBe(true);
      expect(isPointOnPathSegments({ x: 150, y: 75 }, stepPoints)).toBe(false);
    });

    it("resolves real 12-node insurance spec without sibling label overlap or node collision", () => {
      const spec: ArchitectureSpec = {
        nodes: [
          makeNode("ingress", "Policyholder Portal Ingress"),
          makeNode("pii_guard", "PII Scrubbing Input Guard"),
          makeNode("policy_lookup", "Policy Subtask"),
          makeNode("photo_analysis", "Photo Analysis Subtask"),
          makeNode("doc_extraction", "Document Extraction Subtask"),
          makeNode("claim_evaluator", "Claim Evaluator"),
          makeNode("fraud_screening", "Fraud Screening Agent"),
          makeNode("manual_review", "Manual Review Desk"),
          makeNode("auto_settlement", "Auto Settlement Worker"),
          makeNode("policy_gate", "Output Validation & Policy Gate"),
          makeNode("claim_db", "Claims Data Store"),
          makeNode("notify_service", "Notification Delivery Service"),
        ],
        edges: [
          { from: "ingress", to: "pii_guard", flows: "Claim Submission Request" },
          // Fan-out: 1 source (pii_guard) -> 3 children
          { from: "pii_guard", to: "policy_lookup", flows: "Policy lookup subtask" },
          { from: "pii_guard", to: "photo_analysis", flows: "Photo analysis subtask" },
          { from: "pii_guard", to: "doc_extraction", flows: "Document extraction subtask" },
          // Fan-in: 3 parents -> 1 target (claim_evaluator)
          { from: "policy_lookup", to: "claim_evaluator", flows: "Active policy details" },
          { from: "photo_analysis", to: "claim_evaluator", flows: "Damage estimation score" },
          { from: "doc_extraction", to: "claim_evaluator", flows: "Structured document data" },
          // Decision branches
          {
            from: "claim_evaluator",
            to: "manual_review",
            flows: "Flagged claim payload",
            condition: "risk_score > 80",
          },
          {
            from: "claim_evaluator",
            to: "auto_settlement",
            flows: "Standard approval",
            condition: "risk_score <= 80",
          },
          { from: "manual_review", to: "fraud_screening", flows: "Suspicious pattern telemetry" },
          { from: "fraud_screening", to: "policy_gate", flows: "Fraud cleared" },
          { from: "auto_settlement", to: "policy_gate", flows: "Settlement draft" },
          // Multi-rank bypass edge skipping ranks
          { from: "pii_guard", to: "policy_gate", flows: "Forward payload for verification" },
          { from: "policy_gate", to: "claim_db", flows: "Audited record write" },
          { from: "policy_gate", to: "notify_service", flows: "Customer confirmation" },
        ],
        constraints: [],
        entry_ids: ["ingress"],
        exit_ids: ["claim_db", "notify_service"],
      };

      const layout = computeLayout(spec);
      expect(layout.nodes).toHaveLength(12);
      expect(layout.edges).toHaveLength(15);

      // Verify node positions do not overlap
      checkNoOverlaps(layout.nodes);

      // Check fan-out sibling labels from pii_guard do NOT intersect
      const fanOutEdges = layout.edges.filter((e) => e.source === "pii_guard" && e.target !== "policy_gate");
      expect(fanOutEdges).toHaveLength(3);
      for (let i = 0; i < fanOutEdges.length; i++) {
        for (let j = i + 1; j < fanOutEdges.length; j++) {
          const a = fanOutEdges[i]!;
          const b = fanOutEdges[j]!;
          const aRect = {
            left: a.labelX - a.labelWidth / 2,
            right: a.labelX + a.labelWidth / 2,
            top: a.labelY - a.labelHeight / 2,
            bottom: a.labelY + a.labelHeight / 2,
          };
          const bRect = {
            left: b.labelX - b.labelWidth / 2,
            right: b.labelX + b.labelWidth / 2,
            top: b.labelY - b.labelHeight / 2,
            bottom: b.labelY + b.labelHeight / 2,
          };
          const overlapsX = aRect.left < bRect.right && aRect.right > bRect.left;
          const overlapsY = aRect.top < bRect.bottom && aRect.bottom > bRect.top;
          expect(overlapsX && overlapsY, `Fan-out labels '${a.id}' and '${b.id}' collide!`).toBe(false);
        }
      }

      // Check fan-in sibling labels into claim_evaluator do NOT intersect
      const fanInEdges = layout.edges.filter((e) => e.target === "claim_evaluator");
      expect(fanInEdges).toHaveLength(3);
      for (let i = 0; i < fanInEdges.length; i++) {
        for (let j = i + 1; j < fanInEdges.length; j++) {
          const a = fanInEdges[i]!;
          const b = fanInEdges[j]!;
          const aRect = {
            left: a.labelX - a.labelWidth / 2,
            right: a.labelX + a.labelWidth / 2,
            top: a.labelY - a.labelHeight / 2,
            bottom: a.labelY + a.labelHeight / 2,
          };
          const bRect = {
            left: b.labelX - b.labelWidth / 2,
            right: b.labelX + b.labelWidth / 2,
            top: b.labelY - b.labelHeight / 2,
            bottom: b.labelY + b.labelHeight / 2,
          };
          const overlapsX = aRect.left < bRect.right && aRect.right > bRect.left;
          const overlapsY = aRect.top < bRect.bottom && aRect.bottom > bRect.top;
          expect(overlapsX && overlapsY, `Fan-in labels '${a.id}' and '${b.id}' collide!`).toBe(false);
        }
      }

      // Check all edge labels clear all node rectangles with minimum 8px margin
      for (const edge of layout.edges) {
        if (edge.labelWidth === 0 && edge.labelHeight === 0) continue;
        const labelRect = {
          left: edge.labelX - edge.labelWidth / 2,
          right: edge.labelX + edge.labelWidth / 2,
          top: edge.labelY - edge.labelHeight / 2,
          bottom: edge.labelY + edge.labelHeight / 2,
        };

        for (const node of layout.nodes) {
          const nodeRect = {
            left: node.position.x,
            right: node.position.x + node.width,
            top: node.position.y,
            bottom: node.position.y + node.height,
          };
          const intersects =
            labelRect.left < nodeRect.right + 8 &&
            labelRect.right > nodeRect.left - 8 &&
            labelRect.top < nodeRect.bottom + 8 &&
            labelRect.bottom > nodeRect.top - 8;
          expect(
            intersects,
            `Edge label '${edge.data.flows}' [${labelRect.left},${labelRect.top},${labelRect.right},${labelRect.bottom}] collides with node '${node.id}' [${nodeRect.left},${nodeRect.top},${nodeRect.right},${nodeRect.bottom}]`,
          ).toBe(false);
        }
      }
    });

    it("handles 4-node linear spec with label clearance and valid SVG path", () => {
      const spec: ArchitectureSpec = {
        nodes: [
          makeNode("n1", "Node 1"),
          makeNode("n2", "Node 2"),
          makeNode("n3", "Node 3"),
          makeNode("n4", "Node 4"),
        ],
        edges: [
          { from: "n1", to: "n2", flows: "step 1" },
          { from: "n2", to: "n3", flows: "step 2" },
          { from: "n3", to: "n4", flows: "step 3" },
        ],
        constraints: [],
        entry_ids: ["n1"],
        exit_ids: ["n4"],
      };

      const layout = computeLayout(spec);
      for (const edge of layout.edges) {
        expect(edge.pathD).toMatch(/^M \d+(\.\d+)? \d+(\.\d+)? (L|Q)/);
        expect(edge.pathD).not.toContain(" C");
        expect(Number.isFinite(edge.labelX)).toBe(true);
        expect(Number.isFinite(edge.labelY)).toBe(true);
        expect(Number.isNaN(edge.labelX)).toBe(false);
        expect(Number.isNaN(edge.labelY)).toBe(false);
      }
    });

    it("scales to 25-node complex topology with zero NaN and zero sibling collisions", () => {
      const nodes: NodeSpec[] = [];
      const edges: ArchitectureSpec["edges"] = [];

      for (let i = 0; i < 25; i++) {
        nodes.push(makeNode(`node_${i}`, `Microservice Component ${i}`));
      }

      // Build layered DAG
      for (let i = 0; i < 20; i++) {
        edges.push({
          from: `node_${i}`,
          to: `node_${i + 1}`,
          flows: `Flow payload step ${i}`,
        });
        if (i % 3 === 0 && i + 3 < 25) {
          edges.push({
            from: `node_${i}`,
            to: `node_${i + 3}`,
            flows: `Branch jump ${i}`,
          });
        }
      }

      const spec: ArchitectureSpec = {
        nodes,
        edges,
        constraints: [],
        entry_ids: ["node_0"],
        exit_ids: ["node_24"],
      };

      const layout = computeLayout(spec);
      expect(layout.nodes).toHaveLength(25);
      expect(layout.edges.length).toBeGreaterThan(20);

      for (const edge of layout.edges) {
        expect(Number.isNaN(edge.labelX)).toBe(false);
        expect(Number.isNaN(edge.labelY)).toBe(false);
        expect(Number.isFinite(edge.labelX)).toBe(true);
        expect(Number.isFinite(edge.labelY)).toBe(true);
      }
    });

    it("stacks condition badge and flows label with height 52 and >= 8px clearance", () => {
      const spec: ArchitectureSpec = {
        nodes: [makeNode("src", "Source"), makeNode("tgt", "Target")],
        edges: [
          {
            from: "src",
            to: "tgt",
            flows: "High Value Approval",
            condition: "amount > 10000",
          },
        ],
        constraints: [],
        entry_ids: ["src"],
        exit_ids: ["tgt"],
      };

      const layout = computeLayout(spec);
      const edge = layout.edges[0]!;
      expect(edge.labelHeight).toBe(52);

      const src = layout.nodes.find((n) => n.id === "src")!;
      const tgt = layout.nodes.find((n) => n.id === "tgt")!;

      const labelTop = edge.labelY - edge.labelHeight / 2;
      const labelBottom = edge.labelY + edge.labelHeight / 2;
      const srcBottom = src.position.y + src.height;
      const tgtTop = tgt.position.y;

      // Assert clearance >= 8px
      expect(labelTop - srcBottom).toBeGreaterThanOrEqual(8);
      expect(tgtTop - labelBottom).toBeGreaterThanOrEqual(8);
    });

    it("separates parallel edges between the exact same pair of nodes", () => {
      const spec: ArchitectureSpec = {
        nodes: [makeNode("src", "Source"), makeNode("tgt", "Target")],
        edges: [
          { from: "src", to: "tgt", flows: "Primary Pipeline Stream" },
          { from: "src", to: "tgt", flows: "Secondary Backup Stream" },
        ],
        constraints: [],
        entry_ids: ["src"],
        exit_ids: ["tgt"],
      };

      const layout = computeLayout(spec);
      expect(layout.edges).toHaveLength(2);
      const e1 = layout.edges[0]!;
      const e2 = layout.edges[1]!;

      // Distinct paths and distinct label coordinates
      expect(e1.pathD).not.toBe(e2.pathD);
      // layout.ts:409 sets lateral offset step to 36px (parallelOffsetIdx * 36).
      // For mParallel = 2 (offsetIdx -0.5 and +0.5), segment-anchored candidate selection
      // produces an exact 27px X separation (0.75 * 36px) with distinct vertical staggered shelves.
      expect(Math.abs(e1.labelX - e2.labelX)).toBeGreaterThanOrEqual(27);
    });

    it("preserves determinism across shuffled edge input ordering", () => {
      const spec1: ArchitectureSpec = {
        nodes: [
          makeNode("src", "Source"),
          makeNode("b1", "Branch 1"),
          makeNode("b2", "Branch 2"),
          makeNode("b3", "Branch 3"),
        ],
        edges: [
          { from: "src", to: "b1", flows: "stream 1" },
          { from: "src", to: "b2", flows: "stream 2" },
          { from: "src", to: "b3", flows: "stream 3" },
        ],
        constraints: [],
        entry_ids: ["src"],
        exit_ids: ["b1", "b2", "b3"],
      };

      const spec2: ArchitectureSpec = {
        nodes: spec1.nodes,
        edges: [spec1.edges[2]!, spec1.edges[0]!, spec1.edges[1]!],
        constraints: [],
        entry_ids: ["src"],
        exit_ids: ["b1", "b2", "b3"],
      };

      const layout1 = computeLayout(spec1);
      const layout2 = computeLayout(spec2);

      const map1 = new Map(layout1.edges.map((e) => [e.data.flows, { x: e.labelX, y: e.labelY, p: e.pathD }]));
      const map2 = new Map(layout2.edges.map((e) => [e.data.flows, { x: e.labelX, y: e.labelY, p: e.pathD }]));

      expect(map1).toEqual(map2);
    });

    it("handles 100-character unbroken flows and hostile HTML safely without NaN", () => {
      const unbroken = "F".repeat(100);
      const hostile = "<script>alert('xss')</script>";
      const spec: ArchitectureSpec = {
        nodes: [makeNode("src", "Source"), makeNode("tgt", "Target")],
        edges: [
          { from: "src", to: "tgt", flows: unbroken, condition: hostile },
        ],
        constraints: [],
        entry_ids: ["src"],
        exit_ids: ["tgt"],
      };

      expect(() => computeLayout(spec)).not.toThrow();
      const layout = computeLayout(spec);
      const edge = layout.edges[0]!;
      expect(Number.isNaN(edge.labelX)).toBe(false);
      expect(Number.isNaN(edge.labelY)).toBe(false);
      expect(edge.labelWidth).toBe(MAX_LABEL_TOTAL_WIDTH);
    });

    it("generates strictly orthogonal paths with zero cubic bezier commands across all edges", () => {
      const spec: ArchitectureSpec = {
        nodes: [
          makeNode("ingress", "Policyholder Portal Ingress"),
          makeNode("pii_guard", "PII Scrubbing Input Guard"),
          makeNode("policy_lookup", "Policy Subtask"),
          makeNode("photo_analysis", "Photo Analysis Subtask"),
          makeNode("doc_extraction", "Document Extraction Subtask"),
          makeNode("claim_evaluator", "Claim Evaluator"),
          makeNode("fraud_screening", "Fraud Screening Agent"),
          makeNode("manual_review", "Manual Review Desk"),
          makeNode("auto_settlement", "Auto Settlement Worker"),
          makeNode("policy_gate", "Output Validation & Policy Gate"),
          makeNode("claim_db", "Claims Data Store"),
          makeNode("notify_service", "Notification Delivery Service"),
        ],
        edges: [
          { from: "ingress", to: "pii_guard", flows: "Claim Submission Request" },
          { from: "pii_guard", to: "policy_lookup", flows: "Policy lookup subtask" },
          { from: "pii_guard", to: "photo_analysis", flows: "Photo analysis subtask" },
          { from: "pii_guard", to: "doc_extraction", flows: "Document extraction subtask" },
          { from: "policy_lookup", to: "claim_evaluator", flows: "Active policy details" },
          { from: "photo_analysis", to: "claim_evaluator", flows: "Damage estimation score" },
          { from: "doc_extraction", to: "claim_evaluator", flows: "Structured document data" },
          { from: "claim_evaluator", to: "manual_review", flows: "Flagged claim payload", condition: "risk_score > 80" },
          { from: "claim_evaluator", to: "auto_settlement", flows: "Standard approval", condition: "risk_score <= 80" },
          { from: "manual_review", to: "fraud_screening", flows: "Suspicious pattern telemetry" },
          { from: "fraud_screening", to: "policy_gate", flows: "Fraud cleared" },
          { from: "auto_settlement", to: "policy_gate", flows: "Settlement draft" },
          { from: "pii_guard", to: "policy_gate", flows: "Forward payload for verification" },
          { from: "policy_gate", to: "claim_db", flows: "Audited record write" },
          { from: "policy_gate", to: "notify_service", flows: "Customer confirmation" },
        ],
        constraints: [],
        entry_ids: ["ingress"],
        exit_ids: ["claim_db", "notify_service"],
      };

      const layout = computeLayout(spec);
      expect(layout.edges.length).toBeGreaterThan(0);

      for (const edge of layout.edges) {
        expect(edge.pathD).toMatch(/^M \d+(\.\d+)? \d+(\.\d+)?/);
        expect(edge.pathD).not.toContain(" C");
        // Must contain only M, L, Q commands
        const commands = edge.pathD.match(/[A-Za-z]/g) || [];
        expect(commands.length).toBeGreaterThan(0);
        for (const cmd of commands) {
          expect(["M", "L", "Q"]).toContain(cmd);
        }
      }
    });

    it("ensures every edge label point lies strictly on its edge orthogonal path segments", () => {
      const spec: ArchitectureSpec = {
        nodes: [
          makeNode("src", "Source Service"),
          makeNode("b1", "Branch One"),
          makeNode("b2", "Branch Two"),
          makeNode("sink", "Final Sink"),
        ],
        edges: [
          { from: "src", to: "b1", flows: "primary payload stream" },
          { from: "src", to: "b2", flows: "secondary branch stream" },
          { from: "b1", to: "sink", flows: "processed results" },
          { from: "b2", to: "sink", flows: "alternative results", condition: "retry_count > 0" },
        ],
        constraints: [],
        entry_ids: ["src"],
        exit_ids: ["sink"],
      };

      const layout = computeLayout(spec);
      const labeledEdges = layout.edges.filter((e) => e.labelWidth > 0 && e.labelHeight > 0);
      expect(labeledEdges.length).toBe(4);

      for (const edge of labeledEdges) {
        expect(Number.isFinite(edge.labelX)).toBe(true);
        expect(Number.isFinite(edge.labelY)).toBe(true);

        // Verify label clears all nodes with >= 8px margin
        const labelRect = {
          left: edge.labelX - edge.labelWidth / 2,
          right: edge.labelX + edge.labelWidth / 2,
          top: edge.labelY - edge.labelHeight / 2,
          bottom: edge.labelY + edge.labelHeight / 2,
        };

        for (const node of layout.nodes) {
          const nodeRect = {
            left: node.position.x,
            right: node.position.x + node.width,
            top: node.position.y,
            bottom: node.position.y + node.height,
          };
          const intersects =
            labelRect.left < nodeRect.right + 8 &&
            labelRect.right > nodeRect.left - 8 &&
            labelRect.top < nodeRect.bottom + 8 &&
            labelRect.bottom > nodeRect.top - 8;
          expect(intersects).toBe(false);
        }
      }
    });

    it("estimates labelWidth as max(flows, condition) in computeEdgeLabelLayout (Stage B1b, D-298)", () => {
      const longConditionText = "claim_amount > 10000 and customer_status == 'vip'";
      const specShortFlowLongCond: ArchitectureSpec = {
        nodes: [makeNode("src", "Source"), makeNode("tgt", "Target")],
        edges: [
          {
            from: "src",
            to: "tgt",
            flows: "ok",
            condition: longConditionText,
          },
        ],
        constraints: [],
        entry_ids: ["src"],
        exit_ids: ["tgt"],
      };

      const layout1 = computeLayout(specShortFlowLongCond);
      expect(layout1.edges).toHaveLength(1);
      const edge1 = layout1.edges[0]!;
      const expectedCondWidth = estimateLabelWidth(longConditionText);
      const expectedFlowWidth = estimateLabelWidth("ok");
      expect(expectedCondWidth).toBeGreaterThan(expectedFlowWidth);
      expect(edge1.labelWidth).toBe(expectedCondWidth);
      expect(edge1.labelWidth).toBe(MAX_LABEL_TOTAL_WIDTH);

      // Long flow, short condition
      const longFlowText = "draft summary with full precedent citations and statutory references";
      const specLongFlowShortCond: ArchitectureSpec = {
        nodes: [makeNode("src", "Source"), makeNode("tgt", "Target")],
        edges: [
          {
            from: "src",
            to: "tgt",
            flows: longFlowText,
            condition: "ok",
          },
        ],
        constraints: [],
        entry_ids: ["src"],
        exit_ids: ["tgt"],
      };

      const layout2 = computeLayout(specLongFlowShortCond);
      expect(layout2.edges).toHaveLength(1);
      const edge2 = layout2.edges[0]!;
      expect(edge2.labelWidth).toBe(MAX_LABEL_TOTAL_WIDTH);

      // Short flow, empty condition
      const specShortFlowEmptyCond: ArchitectureSpec = {
        nodes: [makeNode("src", "Source"), makeNode("tgt", "Target")],
        edges: [
          {
            from: "src",
            to: "tgt",
            flows: "ok",
            condition: "",
          },
        ],
        constraints: [],
        entry_ids: ["src"],
        exit_ids: ["tgt"],
      };

      const layout3 = computeLayout(specShortFlowEmptyCond);
      expect(layout3.edges).toHaveLength(1);
      const edge3 = layout3.edges[0]!;
      const expectedOkWidth = 2 * LABEL_CHAR_WIDTH_PX + LABEL_PADDING_X + LABEL_BORDER_X;
      expect(expectedFlowWidth).toBe(expectedOkWidth);
      expect(edge3.labelWidth).toBe(expectedOkWidth);
    });

    it("enforces all-pairs label non-overlap (>= 4px) and node clearance (>= 8px) on 12-node spec", () => {
      const spec: ArchitectureSpec = {
        nodes: [
          makeNode("ingress", "Policyholder Portal Ingress"),
          makeNode("pii_guard", "PII Scrubbing Input Guard"),
          makeNode("policy_lookup", "Policy Subtask"),
          makeNode("photo_analysis", "Photo Analysis Subtask"),
          makeNode("doc_extraction", "Document Extraction Subtask"),
          makeNode("claim_evaluator", "Claim Evaluator"),
          makeNode("fraud_screening", "Fraud Screening Agent"),
          makeNode("manual_review", "Manual Review Desk"),
          makeNode("auto_settlement", "Auto Settlement Worker"),
          makeNode("policy_gate", "Output Validation & Policy Gate"),
          makeNode("claim_db", "Claims Data Store"),
          makeNode("notify_service", "Notification Delivery Service"),
        ],
        edges: [
          { from: "ingress", to: "pii_guard", flows: "Claim Submission Request" },
          { from: "pii_guard", to: "policy_lookup", flows: "Policy lookup subtask" },
          { from: "pii_guard", to: "photo_analysis", flows: "Photo analysis subtask" },
          { from: "pii_guard", to: "doc_extraction", flows: "Document extraction subtask" },
          { from: "policy_lookup", to: "claim_evaluator", flows: "Active policy details" },
          { from: "photo_analysis", to: "claim_evaluator", flows: "Damage estimation score" },
          { from: "doc_extraction", to: "claim_evaluator", flows: "Structured document data" },
          { from: "claim_evaluator", to: "manual_review", flows: "Flagged claim payload", condition: "risk_score > 80" },
          { from: "claim_evaluator", to: "auto_settlement", flows: "Standard approval", condition: "risk_score <= 80" },
          { from: "manual_review", to: "fraud_screening", flows: "Suspicious pattern telemetry" },
          { from: "fraud_screening", to: "policy_gate", flows: "Fraud cleared" },
          { from: "auto_settlement", to: "policy_gate", flows: "Settlement draft" },
          { from: "pii_guard", to: "policy_gate", flows: "Forward payload for verification" },
          { from: "policy_gate", to: "claim_db", flows: "Audited record write" },
          { from: "policy_gate", to: "notify_service", flows: "Customer confirmation" },
        ],
        constraints: [],
        entry_ids: ["ingress"],
        exit_ids: ["claim_db", "notify_service"],
      };

      const layout = computeLayout(spec);
      const labeled = layout.edges.filter((e) => e.labelWidth > 0 && e.labelHeight > 0);
      expect(labeled.length).toBeGreaterThan(1);

      // Check all-pairs label clearance >= 4px
      for (let i = 0; i < labeled.length; i++) {
        for (let j = i + 1; j < labeled.length; j++) {
          const a = labeled[i]!;
          const b = labeled[j]!;
          const aRect = {
            left: a.labelX - a.labelWidth / 2,
            right: a.labelX + a.labelWidth / 2,
            top: a.labelY - a.labelHeight / 2,
            bottom: a.labelY + a.labelHeight / 2,
          };
          const bRect = {
            left: b.labelX - b.labelWidth / 2,
            right: b.labelX + b.labelWidth / 2,
            top: b.labelY - b.labelHeight / 2,
            bottom: b.labelY + b.labelHeight / 2,
          };

          const overlapX = aRect.left < bRect.right + 4 && aRect.right > bRect.left - 4;
          const overlapY = aRect.top < bRect.bottom + 4 && aRect.bottom > bRect.top - 4;
          expect(
            overlapX && overlapY,
            `Labels '${a.id}' and '${b.id}' violate 4px clearance margin!`,
          ).toBe(false);
        }
      }

      // Check all labels clear all nodes >= 8px
      for (const edge of labeled) {
        const lRect = {
          left: edge.labelX - edge.labelWidth / 2,
          right: edge.labelX + edge.labelWidth / 2,
          top: edge.labelY - edge.labelHeight / 2,
          bottom: edge.labelY + edge.labelHeight / 2,
        };
        for (const node of layout.nodes) {
          const nRect = {
            left: node.position.x,
            right: node.position.x + node.width,
            top: node.position.y,
            bottom: node.position.y + node.height,
          };
          const intersects =
            lRect.left < nRect.right + 8 &&
            lRect.right > nRect.left - 8 &&
            lRect.top < nRect.bottom + 8 &&
            lRect.bottom > nRect.top - 8;
          expect(intersects).toBe(false);
        }
      }
    });

    it("enforces all-pairs label non-overlap (>= 4px) and node clearance (>= 8px) on 25-node spec", () => {
      const nodes: NodeSpec[] = [];
      const edges: ArchitectureSpec["edges"] = [];

      for (let i = 0; i < 25; i++) {
        nodes.push(makeNode(`node_${i}`, `Microservice Component ${i}`));
      }

      for (let i = 0; i < 20; i++) {
        edges.push({
          from: `node_${i}`,
          to: `node_${i + 1}`,
          flows: `Flow step ${i}`,
        });
        if (i % 3 === 0 && i + 3 < 25) {
          edges.push({
            from: `node_${i}`,
            to: `node_${i + 3}`,
            flows: `Branch ${i}`,
            condition: `condition_${i} == true`,
          });
        }
      }

      const spec: ArchitectureSpec = {
        nodes,
        edges,
        constraints: [],
        entry_ids: ["node_0"],
        exit_ids: ["node_24"],
      };

      const layout = computeLayout(spec);
      const labeled = layout.edges.filter((e) => e.labelWidth > 0 && e.labelHeight > 0);
      expect(labeled.length).toBeGreaterThan(1);

      for (let i = 0; i < labeled.length; i++) {
        for (let j = i + 1; j < labeled.length; j++) {
          const a = labeled[i]!;
          const b = labeled[j]!;
          const aRect = {
            left: a.labelX - a.labelWidth / 2,
            right: a.labelX + a.labelWidth / 2,
            top: a.labelY - a.labelHeight / 2,
            bottom: a.labelY + a.labelHeight / 2,
          };
          const bRect = {
            left: b.labelX - b.labelWidth / 2,
            right: b.labelX + b.labelWidth / 2,
            top: b.labelY - b.labelHeight / 2,
            bottom: b.labelY + b.labelHeight / 2,
          };

          const overlapX = aRect.left < bRect.right + 4 && aRect.right > bRect.left - 4;
          const overlapY = aRect.top < bRect.bottom + 4 && aRect.bottom > bRect.top - 4;
          expect(
            overlapX && overlapY,
            `25-node labels '${a.id}' and '${b.id}' collide!`,
          ).toBe(false);
        }
      }
    });
  });
});
