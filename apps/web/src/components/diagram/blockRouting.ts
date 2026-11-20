/**
 * Pure deterministic obstacle-avoiding edge routing engine for Block diagram view.
 *
 * Implements Stage V3-4B2 (D-397):
 * - Guarantees zero edge-card collisions (edges never intersect card interiors).
 * - Adjacent edges (col -> col+1): route through inter-frame gutter with dedicated parallel lanes.
 * - Skip-column, backward, and same-column edges: route through bottom channel below all frames.
 * - Deterministic lane assignment without coordinate overlaps.
 * - Rounded corner SVG path generation (radius = 6px).
 */

import type { ArchitectureSpec, UnionArchitectureSpec } from "@/lib/types";
import type { BlockLayoutResult, BlockNodePosition } from "./blockLayout";

export interface Point {
  x: number;
  y: number;
}

export interface BlockEdgeRoute {
  edgeId: string;
  from: string;
  to: string;
  points: Point[];
  pathD: string;
  isBackward: boolean;
  isSkip: boolean;
  isAdjacent: boolean;
  isSameColumn: boolean;
  sourceColumnIndex: number;
  targetColumnIndex: number;
  channelLaneIndex?: number;
}

export interface BlockRoutingResult {
  routes: Map<string, BlockEdgeRoute>;
  totalWidth: number;
  totalHeight: number;
  channelHeight: number;
  maxColHeight: number;
  bottomChannelY: number;
}

// ============================================================================
// Routing Constants
// ============================================================================

/** Spacing between vertical lanes inside a column gutter */
export const GUTTER_LANE_GAP_X = 8;

/** Spacing between horizontal lanes inside the bottom channel */
export const CHANNEL_LANE_GAP_Y = 12;

/** Top margin of bottom channel below frames */
export const CHANNEL_MARGIN_TOP = 24;

/** Bottom margin of bottom channel */
export const CHANNEL_MARGIN_BOTTOM = 24;

/** Corner rounding radius for orthogonal path corners */
export const CORNER_RADIUS = 6;

// ============================================================================
// SVG Orthogonal Path Generator with Rounded Corners
// ============================================================================

/**
 * Converts an array of orthogonal 2D waypoints into an SVG path string `d`
 * with smooth quadratic bezier curves on corners.
 */
export function pointsToSvgPath(rawPoints: Point[], radius = CORNER_RADIUS): string {
  if (rawPoints.length === 0) return "";
  if (rawPoints.length === 1) {
    const pt = rawPoints[0]!;
    return `M ${pt.x} ${pt.y}`;
  }

  // 1. Collapse duplicate or collinear points
  const points: Point[] = [rawPoints[0]!];
  for (let i = 1; i < rawPoints.length; i++) {
    const prev = points[points.length - 1]!;
    const curr = rawPoints[i]!;
    if (Math.abs(curr.x - prev.x) < 0.001 && Math.abs(curr.y - prev.y) < 0.001) {
      continue;
    }
    // Check collinearity with previous two points
    if (points.length >= 2) {
      const pPrev = points[points.length - 2]!;
      const isCollinearX = Math.abs(pPrev.x - prev.x) < 0.001 && Math.abs(prev.x - curr.x) < 0.001;
      const isCollinearY = Math.abs(pPrev.y - prev.y) < 0.001 && Math.abs(prev.y - curr.y) < 0.001;
      if (isCollinearX || isCollinearY) {
        // Replace middle point with current
        points[points.length - 1] = curr;
        continue;
      }
    }
    points.push(curr);
  }

  if (points.length < 2) {
    const pt = points[0]!;
    return `M ${pt.x} ${pt.y}`;
  }

  let d = `M ${points[0]!.x} ${points[0]!.y}`;

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    const next = points[i + 1]!;

    const dPrev = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    const dNext = Math.hypot(next.x - curr.x, next.y - curr.y);

    const r = Math.min(radius, dPrev / 2, dNext / 2);

    if (r <= 0.5) {
      d += ` L ${curr.x} ${curr.y}`;
      continue;
    }

    // Direction vectors
    const vPrevX = (curr.x - prev.x) / dPrev;
    const vPrevY = (curr.y - prev.y) / dPrev;
    const vNextX = (next.x - curr.x) / dNext;
    const vNextY = (next.y - curr.y) / dNext;

    const cornerStartX = curr.x - vPrevX * r;
    const cornerStartY = curr.y - vPrevY * r;
    const cornerEndX = curr.x + vNextX * r;
    const cornerEndY = curr.y + vNextY * r;

    d += ` L ${cornerStartX} ${cornerStartY}`;
    d += ` Q ${curr.x} ${curr.y} ${cornerEndX} ${cornerEndY}`;
  }

  const last = points[points.length - 1]!;
  d += ` L ${last.x} ${last.y}`;

  return d;
}

// ============================================================================
// Pure Route Computation
// ============================================================================

interface InternalEdge {
  id: string;
  from: string;
  to: string;
  source: BlockNodePosition;
  target: BlockNodePosition;
  isAdjacentForward: boolean;
  isBackward: boolean;
  isSkip: boolean;
  isSameColumn: boolean;
  sourceColIndex: number;
  targetColIndex: number;
}

/**
 * Computes deterministic obstacle-avoiding edge routes for the block diagram.
 */
export function computeBlockRoutes(
  spec: ArchitectureSpec | UnionArchitectureSpec,
  layout: BlockLayoutResult,
): BlockRoutingResult {
  const nodeMap = new Map<string, BlockNodePosition>();
  for (const node of layout.nodes) {
    nodeMap.set(node.id, node);
  }

  const columnMap = new Map<number, (typeof layout.columns)[number]>();
  for (const col of layout.columns) {
    columnMap.set(col.index, col);
  }

  const numColumns = layout.columns.length;
  const maxColHeight = layout.height;

  // 1. Collect valid edges and categorize
  const internalEdges: InternalEdge[] = [];
  const rawEdges = spec.edges || [];

  for (const edge of rawEdges) {
    const sourceNode = nodeMap.get(edge.from);
    const targetNode = nodeMap.get(edge.to);

    if (sourceNode && targetNode) {
      const sCol = sourceNode.columnIndex;
      const tCol = targetNode.columnIndex;

      const isAdjacentForward = tCol === sCol + 1;
      const isBackward = tCol < sCol;
      const isSameColumn = tCol === sCol;
      const isSkip = tCol > sCol + 1;

      internalEdges.push({
        id: `${edge.from}->${edge.to}`,
        from: edge.from,
        to: edge.to,
        source: sourceNode,
        target: targetNode,
        isAdjacentForward,
        isBackward,
        isSkip,
        isSameColumn,
        sourceColIndex: sCol,
        targetColIndex: tCol,
      });
    }
  }

  // 2. Separate into adjacent forward edges and channel edges
  const adjacentEdges = internalEdges.filter((e) => e.isAdjacentForward);
  const channelEdges = internalEdges.filter((e) => !e.isAdjacentForward);

  // Deterministically sort channel edges by:
  // sourceCol, targetCol, source.y, target.y, edge.id
  channelEdges.sort((a, b) => {
    if (a.sourceColIndex !== b.sourceColIndex) return a.sourceColIndex - b.sourceColIndex;
    if (a.targetColIndex !== b.targetColIndex) return a.targetColIndex - b.targetColIndex;
    if (a.source.y !== b.target.y) return a.source.y - b.source.y;
    if (a.target.y !== b.target.y) return a.target.y - b.target.y;
    return a.id.localeCompare(b.id);
  });

  // Assign horizontal channel lanes (y coordinates)
  const channelLaneCount = channelEdges.length;
  const channelBaseY = maxColHeight + CHANNEL_MARGIN_TOP;
  const channelHeight =
    channelLaneCount > 0
      ? CHANNEL_MARGIN_TOP + (channelLaneCount - 1) * CHANNEL_LANE_GAP_Y + CHANNEL_MARGIN_BOTTOM
      : 0;

  const edgeChannelLaneY = new Map<string, number>();
  channelEdges.forEach((e, idx) => {
    edgeChannelLaneY.set(e.id, channelBaseY + idx * CHANNEL_LANE_GAP_Y);
  });

  // 3. Assign vertical lanes in each gutter
  // Gutter g is the space between Column g-1 and Column g (g from 0 to numColumns)
  // - Gutter 0: left of Column 0 (for up-legs targeting Column 0)
  // - Gutter g (1 <= g < numColumns): between Column g-1 and Column g
  // - Gutter numColumns: right of last column (for down-legs leaving last column)
  interface GutterRequest {
    edgeId: string;
    type: "adjacent" | "down" | "up";
    sourceY: number;
    targetY: number;
  }

  const gutterRequests = new Map<number, GutterRequest[]>();
  for (let g = 0; g <= numColumns; g++) {
    gutterRequests.set(g, []);
  }

  // Register adjacent forward edges in gutter sCol + 1
  for (const e of adjacentEdges) {
    const g = e.sourceColIndex + 1;
    gutterRequests.get(g)?.push({
      edgeId: e.id,
      type: "adjacent",
      sourceY: e.source.y,
      targetY: e.target.y,
    });
  }

  // Register channel edges: down-leg in gutter sCol + 1, up-leg in gutter tCol
  for (const e of channelEdges) {
    const downGutter = e.sourceColIndex + 1;
    gutterRequests.get(downGutter)?.push({
      edgeId: e.id,
      type: "down",
      sourceY: e.source.y,
      targetY: e.target.y,
    });

    const upGutter = e.targetColIndex;
    gutterRequests.get(upGutter)?.push({
      edgeId: e.id,
      type: "up",
      sourceY: e.source.y,
      targetY: e.target.y,
    });
  }

  // Determine x-coordinate for each gutter lane
  const edgeDownX = new Map<string, number>();
  const edgeUpX = new Map<string, number>();
  const edgeAdjX = new Map<string, number>();

  for (let g = 0; g <= numColumns; g++) {
    const reqs = gutterRequests.get(g) ?? [];
    if (reqs.length === 0) continue;

    // Deterministically sort requests in gutter:
    // down first, then adjacent, then up; tie-break by sourceY then edgeId
    reqs.sort((a, b) => {
      const typeOrder = { down: 0, adjacent: 1, up: 2 };
      if (typeOrder[a.type] !== typeOrder[b.type]) {
        return typeOrder[a.type] - typeOrder[b.type];
      }
      if (a.sourceY !== b.sourceY) return a.sourceY - b.sourceY;
      return a.edgeId.localeCompare(b.edgeId);
    });

    // Compute gutter center
    let gutterCenter: number;
    if (g === 0) {
      // Left of column 0
      const col0 = columnMap.get(0);
      const col0X = col0 ? col0.x : 0;
      gutterCenter = col0X - 25;
    } else if (g === numColumns) {
      // Right of last column
      const lastCol = columnMap.get(numColumns - 1);
      const lastColRight = lastCol ? lastCol.x + lastCol.width : 280;
      gutterCenter = lastColRight + 25;
    } else {
      // Between col g-1 and col g
      const prevCol = columnMap.get(g - 1);
      const currCol = columnMap.get(g);
      const prevRight = prevCol ? prevCol.x + prevCol.width : (g - 1) * 370 + 280;
      const currLeft = currCol ? currCol.x : g * 370;
      gutterCenter = (prevRight + currLeft) / 2;
    }

    const count = reqs.length;
    reqs.forEach((r, idx) => {
      const laneX = gutterCenter + (idx - (count - 1) / 2) * GUTTER_LANE_GAP_X;
      if (r.type === "adjacent") {
        edgeAdjX.set(r.edgeId, laneX);
      } else if (r.type === "down") {
        edgeDownX.set(r.edgeId, laneX);
      } else if (r.type === "up") {
        edgeUpX.set(r.edgeId, laneX);
      }
    });
  }

  // 4. Construct waypoints and SVG path for each edge
  const routes = new Map<string, BlockEdgeRoute>();

  for (const e of internalEdges) {
    const srcHandleX = e.source.x + e.source.width;
    const srcHandleY = e.source.y + e.source.height / 2;
    const tgtHandleX = e.target.x;
    const tgtHandleY = e.target.y + e.target.height / 2;

    const points: Point[] = [];

    if (e.isAdjacentForward) {
      // Gutter between col and col+1
      const laneX = edgeAdjX.get(e.id) ?? (srcHandleX + tgtHandleX) / 2;

      points.push({ x: srcHandleX, y: srcHandleY });
      points.push({ x: laneX, y: srcHandleY });
      points.push({ x: laneX, y: tgtHandleY });
      points.push({ x: tgtHandleX, y: tgtHandleY });
    } else {
      // Channel route below all frames
      const downX = edgeDownX.get(e.id) ?? (srcHandleX + 25);
      const upX = edgeUpX.get(e.id) ?? (tgtHandleX - 25);
      const channelY = edgeChannelLaneY.get(e.id) ?? (channelBaseY + 20);

      points.push({ x: srcHandleX, y: srcHandleY });
      points.push({ x: downX, y: srcHandleY });
      points.push({ x: downX, y: channelY });
      points.push({ x: upX, y: channelY });
      points.push({ x: upX, y: tgtHandleY });
      points.push({ x: tgtHandleX, y: tgtHandleY });
    }

    const pathD = pointsToSvgPath(points, CORNER_RADIUS);

    routes.set(e.id, {
      edgeId: e.id,
      from: e.from,
      to: e.to,
      points,
      pathD,
      isBackward: e.isBackward,
      isSkip: e.isSkip,
      isAdjacent: e.isAdjacentForward,
      isSameColumn: e.isSameColumn,
      sourceColumnIndex: e.sourceColIndex,
      targetColumnIndex: e.targetColIndex,
    });
  }

  const totalHeight = maxColHeight + channelHeight;
  const totalWidth = layout.width;

  return {
    routes,
    totalWidth,
    totalHeight,
    channelHeight,
    maxColHeight,
    bottomChannelY: channelBaseY,
  };
}
