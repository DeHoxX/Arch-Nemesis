import { describe, expect, it } from "vitest";

import type { ArchitectureSpec, EdgeSpec, NodeSpec } from "@/lib/types";
import { computeBlockLayout } from "./blockLayout";
import {
  type BlockEdgeRoute,
  computeBlockRoutes,
  type Point,
  pointsToSvgPath,
} from "./blockRouting";

/**
 * Geometric helper: checks whether segment (p1 -> p2) intersects the strict interior
 * of rectangle [xMin, xMax] x [yMin, yMax].
 */
function segmentIntersectsCardInterior(
  p1: Point,
  p2: Point,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
): boolean {
  // Check horizontal segment
  if (Math.abs(p1.y - p2.y) < 0.001) {
    const y = p1.y;
    if (y <= yMin || y >= yMax) return false;
    const segMinX = Math.min(p1.x, p2.x);
    const segMaxX = Math.max(p1.x, p2.x);
    return segMaxX > xMin && segMinX < xMax;
  }

  // Check vertical segment
  if (Math.abs(p1.x - p2.x) < 0.001) {
    const x = p1.x;
    if (x <= xMin || x >= xMax) return false;
    const segMinY = Math.min(p1.y, p2.y);
    const segMaxY = Math.max(p1.y, p2.y);
    return segMaxY > yMin && segMinY < yMax;
  }

  return false;
}

/**
 * Verifies that for every route of an edge, no segment crosses any node card's interior,
 * except at the exact start (source right handle) and end (target left handle).
 */
function assertZeroCardIntersections(
  routes: Map<string, BlockEdgeRoute>,
  _nodes: NodeSpec[],
  layoutNodes: { id: string; x: number; y: number; width: number; height: number }[],
) {
  for (const [edgeId, route] of routes.entries()) {
    const points = route.points;
    expect(points.length).toBeGreaterThanOrEqual(2);

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i]!;
      const p2 = points[i + 1]!;

      for (const card of layoutNodes) {
        const xMin = card.x;
        const xMax = card.x + card.width;
        const yMin = card.y;
        const yMax = card.y + card.height;

        const intersects = segmentIntersectsCardInterior(p1, p2, xMin, xMax, yMin, yMax);
        if (intersects) {
          throw new Error(
            `Collision detected: edge "${edgeId}" segment [(${p1.x}, ${p1.y}) -> (${p2.x}, ${p2.y})] intersects card "${card.id}" interior [${xMin}..${xMax}] x [${yMin}..${yMax}]`,
          );
        }
      }
    }
  }
}

describe("blockRouting - Stage V3-4B2", () => {
  // ==========================================================================
  // 1. Fixture: 14-node, 7-column design with skip and backward edges
  // ==========================================================================
  const layers7 = ["Ingest", "Auth", "Validate", "Transform", "Enrich", "Store", "Export"];
  const nodes14: NodeSpec[] = [];
  for (let i = 0; i < 14; i++) {
    const layer = layers7[i % layers7.length]!;
    nodes14.push({
      id: `node_${i}`,
      name: `Service Node ${i}`,
      type: "service",
      role: `Processes stage ${layer}`,
      inputs: [],
      outputs: [],
      tech_options: [],
      needs_model: i === 4,
      layer,
    });
  }

  const edges14: EdgeSpec[] = [
    // Adjacent forward edges
    { from: "node_0", to: "node_1", flows: "f1" },
    { from: "node_1", to: "node_2", flows: "f2" },
    { from: "node_2", to: "node_3", flows: "f3" },
    { from: "node_3", to: "node_4", flows: "f4" },
    { from: "node_4", to: "node_5", flows: "f5" },
    { from: "node_5", to: "node_6", flows: "f6" },
    // Parallel adjacent edges
    { from: "node_7", to: "node_8", flows: "f7" },
    // Skip-column forward edge (skips Auth and Validate to hit Transform)
    { from: "node_0", to: "node_3", flows: "bypass" },
    // Backward loop edge (Store to Ingest)
    { from: "node_5", to: "node_0", flows: "retry_loop" },
    // Another backward edge
    { from: "node_6", to: "node_2", flows: "feedback" },
  ];

  const spec14: ArchitectureSpec = {
    nodes: nodes14,
    edges: edges14,
    constraints: [],
    entry_ids: ["node_0", "node_7"],
    exit_ids: ["node_6", "node_13"],
  };

  // ==========================================================================
  // 2. Fixture: 25-node complex DAG across 5 layers with branching & loops
  // ==========================================================================
  const layers5 = ["Ingest", "Processing", "Validation", "Storage", "Analytics"];
  const nodes25: NodeSpec[] = [];
  const edges25: EdgeSpec[] = [];

  for (let i = 0; i < 25; i++) {
    const layer = layers5[i % layers5.length]!;
    nodes25.push({
      id: `node25_${i}`,
      name: `Cluster Node ${i}`,
      type: "service",
      role: `Step ${i}`,
      inputs: [],
      outputs: [],
      tech_options: [],
      needs_model: i % 3 === 0,
      layer,
    });

    if (i > 0) {
      edges25.push({
        from: `node25_${i - 1}`,
        to: `node25_${i}`,
        flows: `stream_${i}`,
      });
    }
  }

  // Cross-cutting skip and backward edges
  edges25.push({ from: "node25_0", to: "node25_10", flows: "skip_long" });
  edges25.push({ from: "node25_20", to: "node25_1", flows: "backward_long" });
  edges25.push({ from: "node25_15", to: "node25_3", flows: "backward_mid" });
  edges25.push({ from: "node25_4", to: "node25_18", flows: "skip_fast" });

  const spec25: ArchitectureSpec = {
    nodes: nodes25,
    edges: edges25,
    constraints: [],
    entry_ids: ["node25_0"],
    exit_ids: ["node25_24"],
  };

  it("requirement 1: no route segment intersects any card rectangle (14-node / 7-column fixture)", () => {
    const layout = computeBlockLayout(spec14);
    const routing = computeBlockRoutes(spec14, layout);

    expect(routing.routes.size).toBe(edges14.length);
    assertZeroCardIntersections(routing.routes, spec14.nodes, layout.nodes);
  });

  it("requirement 1: no route segment intersects any card rectangle (25-node fixture)", () => {
    const layout = computeBlockLayout(spec25);
    const routing = computeBlockRoutes(spec25, layout);

    expect(routing.routes.size).toBe(edges25.length);
    assertZeroCardIntersections(routing.routes, spec25.nodes, layout.nodes);
  });

  it("requirement 2: no two routes share a lane at overlapping coordinates in the bottom channel", () => {
    const layout = computeBlockLayout(spec14);
    const routing = computeBlockRoutes(spec14, layout);

    const channelYValues: number[] = [];
    for (const route of routing.routes.values()) {
      if (route.isSkip || route.isBackward || route.isSameColumn) {
        // Channel route: middle segment has horizontal channel Y
        const channelPt = route.points[2];
        expect(channelPt).toBeDefined();
        if (channelPt) {
          channelYValues.push(channelPt.y);
        }
      }
    }

    // Verify all channel Y coordinates are strictly distinct (no two share same lane)
    const uniqueY = new Set(channelYValues);
    expect(uniqueY.size).toBe(channelYValues.length);
  });

  it("requirement 3: produces strictly stable output for shuffled edge input", () => {
    const layout = computeBlockLayout(spec14);

    const shuffledEdges = [...edges14].reverse();
    const shuffledSpec: ArchitectureSpec = {
      ...spec14,
      edges: shuffledEdges,
    };

    const routingOriginal = computeBlockRoutes(spec14, layout);
    const routingShuffled = computeBlockRoutes(shuffledSpec, layout);

    expect(routingOriginal.routes.size).toBe(routingShuffled.routes.size);
    for (const [id, r1] of routingOriginal.routes.entries()) {
      const r2 = routingShuffled.routes.get(id);
      expect(r2).toBeDefined();
      expect(r1.pathD).toBe(r2?.pathD);
      expect(r1.points).toEqual(r2?.points);
    }
  });

  it("requirement 4: every edge in the spec receives a valid route", () => {
    const layout = computeBlockLayout(spec14);
    const routing = computeBlockRoutes(spec14, layout);

    for (const edge of edges14) {
      const key = `${edge.from}->${edge.to}`;
      const route = routing.routes.get(key);
      expect(route).toBeDefined();
      expect(route?.pathD.length).toBeGreaterThan(10);
      expect(route?.pathD.startsWith("M")).toBe(true);
    }
  });

  it("requirement 5: correctly routes same-column edge through channel without hitting intermediate cards", () => {
    const sameColSpec: ArchitectureSpec = {
      nodes: [
        {
          id: "top_node",
          name: "Top Node",
          type: "service",
          role: "Top",
          inputs: [],
          outputs: [],
          tech_options: [],
          needs_model: false,
          layer: "Processing",
        },
        {
          id: "middle_node",
          name: "Middle Node",
          type: "service",
          role: "Middle obstacle",
          inputs: [],
          outputs: [],
          tech_options: [],
          needs_model: false,
          layer: "Processing",
        },
        {
          id: "bottom_node",
          name: "Bottom Node",
          type: "service",
          role: "Bottom",
          inputs: [],
          outputs: [],
          tech_options: [],
          needs_model: false,
          layer: "Processing",
        },
      ],
      edges: [
        // Same-column edge: top node directly to bottom node, jumping over middle node
        { from: "top_node", to: "bottom_node", flows: "same_col_jump" },
      ],
      constraints: [],
      entry_ids: ["top_node"],
      exit_ids: ["bottom_node"],
    };

    const layout = computeBlockLayout(sameColSpec);
    const routing = computeBlockRoutes(sameColSpec, layout);

    const route = routing.routes.get("top_node->bottom_node");
    expect(route).toBeDefined();
    expect(route?.isSameColumn).toBe(true);

    assertZeroCardIntersections(routing.routes, sameColSpec.nodes, layout.nodes);
  });

  // ==========================================================================
  // Path generator tests
  // ==========================================================================
  describe("pointsToSvgPath", () => {
    it("returns empty string for empty points", () => {
      expect(pointsToSvgPath([])).toBe("");
    });

    it("generates straight line for two points", () => {
      const p = pointsToSvgPath([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ]);
      expect(p).toBe("M 0 0 L 100 0");
    });

    it("generates rounded bezier corner for orthogonal 3-point corner", () => {
      const p = pointsToSvgPath(
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
        ],
        6,
      );
      expect(p).toContain("M 0 0");
      expect(p).toContain("Q 100 0");
      expect(p).toContain("100 100");
    });
  });
});
