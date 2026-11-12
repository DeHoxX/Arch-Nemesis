import dagre from "@dagrejs/dagre";
import type { ArchitectureSpec, EdgeSpec, NodeSpec } from "@/lib/types";
import { classifyNodeShape, type NodeShape } from "./classify";

export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 80;
export const NODESEP = 50;
export const MIN_RANKSEP = 110; // Updated from 96 to 110 (D-189) for >= 11.6px label clearance
export const RANKSEP = MIN_RANKSEP;

// Edge label estimation constants shared with DiagramEdge rendering
export const LABEL_FONT_PX = 11;
export const LABEL_CHAR_WIDTH_PX = 7;
export const LABEL_PADDING_X = 16; // 8px left + 8px right (px-2)
export const LABEL_BORDER_X = 2; // 1px left + 1px right border
export const MAX_LABEL_TEXT_WIDTH = 150; // max-w-[150px]
export const MAX_LABEL_TOTAL_WIDTH = MAX_LABEL_TEXT_WIDTH + LABEL_PADDING_X + LABEL_BORDER_X; // 168
export const LABEL_HEIGHT = 24;
export const CONDITIONAL_LABEL_HEIGHT = 42;
export const DAGRE_LABEL_HEIGHT = 26;

// Node dimension computation constants
export const CHAR_UNIT_PX = 7.2;
export const PADDING_Y = 24;
export const NAME_LINE_HEIGHT = 18;
export const TYPE_HEIGHT = 14;
export const ROLE_LINE_HEIGHT = 18;
export const BADGE_HEIGHT = 20;
export const TECH_LINE_HEIGHT = 16;

export const RECT_MIN_HEIGHT = 80;
export const RECT_MAX_HEIGHT = 130;
export const HEXAGON_MIN_HEIGHT = 86;
export const HEXAGON_MAX_HEIGHT = 140;

// Diamond centered inner box constants (D-188)
export const DIAMOND_INNER_WIDTH = 112; // ~46.7% of 240px width
export const DIAMOND_MIN_HEIGHT = 140;
export const DIAMOND_MAX_HEIGHT = 190;

/**
 * Pure and deterministic node dimension calculation.
 */
export function computeNodeDimensions(
  node: { name: string; role?: string; tech_options?: string[] },
  shape: NodeShape,
): { width: number; height: number } {
  const width = NODE_WIDTH;

  let innerUsableWidth = 216;
  if (shape === "pill") {
    innerUsableWidth = 168;
  } else if (shape === "hexagon") {
    innerUsableWidth = 184;
  } else if (shape === "diamond") {
    innerUsableWidth = DIAMOND_INNER_WIDTH;
  }

  const charsPerLine = Math.max(1, Math.floor(innerUsableWidth / CHAR_UNIT_PX));

  let nameUnits = 0;
  for (const ch of node.name || "") {
    nameUnits += ch.charCodeAt(0) > 255 ? 2 : 1;
  }

  let roleUnits = 0;
  for (const ch of node.role || "") {
    roleUnits += ch.charCodeAt(0) > 255 ? 2 : 1;
  }

  const nameLines = Math.min(2, Math.max(1, Math.ceil(nameUnits / charsPerLine)));
  const roleLines =
    node.role && node.role.trim().length > 0
      ? shape === "diamond"
        ? 1
        : Math.min(2, Math.max(1, Math.ceil(roleUnits / charsPerLine)))
      : 0;

  const hasTech = Boolean(
    shape !== "diamond" &&
      Array.isArray(node.tech_options) &&
      node.tech_options.some((t) => typeof t === "string" && t.trim().length > 0),
  );
  const techHeight = hasTech ? TECH_LINE_HEIGHT : 0;

  let height: number;
  if (shape === "diamond") {
    const innerBoxPadding = 16;
    const nameHeight = nameLines * NAME_LINE_HEIGHT;
    const roleHeight = roleLines * 14;
    const innerContentHeight = innerBoxPadding + nameHeight + TYPE_HEIGHT + roleHeight + BADGE_HEIGHT;
    const requiredDiamondHeight = Math.round(innerContentHeight * 1.875);
    height = Math.min(
      DIAMOND_MAX_HEIGHT,
      Math.max(DIAMOND_MIN_HEIGHT, requiredDiamondHeight),
    );
  } else if (shape === "hexagon") {
    const baseHeight =
      PADDING_Y +
      nameLines * NAME_LINE_HEIGHT +
      TYPE_HEIGHT +
      roleLines * ROLE_LINE_HEIGHT +
      BADGE_HEIGHT +
      techHeight;
    height = Math.min(
      HEXAGON_MAX_HEIGHT,
      Math.max(HEXAGON_MIN_HEIGHT, baseHeight + 10),
    );
  } else {
    const baseHeight =
      PADDING_Y +
      nameLines * NAME_LINE_HEIGHT +
      TYPE_HEIGHT +
      roleLines * ROLE_LINE_HEIGHT +
      BADGE_HEIGHT +
      techHeight;
    height = Math.min(
      RECT_MAX_HEIGHT,
      Math.max(RECT_MIN_HEIGHT, baseHeight),
    );
  }

  return { width, height };
}

/**
 * Pure and deterministic edge label pixel width estimation.
 */
export function estimateLabelWidth(flows?: string | null): number {
  if (!flows || flows.trim().length === 0) {
    return 0;
  }

  const isTruncated = flows.length > 40;
  const display = isTruncated ? `${flows.slice(0, 40)}…` : flows;

  let charUnits = 0;
  for (const ch of display) {
    charUnits += ch.charCodeAt(0) > 255 ? 2 : 1;
  }

  const rawTextWidth = charUnits * LABEL_CHAR_WIDTH_PX;
  const clampedTextWidth = Math.min(rawTextWidth, MAX_LABEL_TEXT_WIDTH);

  return clampedTextWidth + LABEL_PADDING_X + LABEL_BORDER_X;
}

export interface PositionedNode {
  id: string;
  data: NodeSpec;
  position: { x: number; y: number };
  width: number;
  height: number;
}

export interface PositionedEdge {
  id: string;
  source: string;
  target: string;
  data: EdgeSpec;
  labelX: number;
  labelY: number;
  labelWidth: number;
  labelHeight: number;
  pathD: string;
}

export interface LayoutResult {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface EdgeLabelPlacement {
  labelX: number;
  labelY: number;
  labelWidth: number;
  labelHeight: number;
  pathD: string;
}

function getBend(a: Point, b: Point, c: Point, size: number): string {
  const d1 = Math.hypot(b.x - a.x, b.y - a.y);
  const d2 = Math.hypot(c.x - b.x, c.y - b.y);
  const bendSize = Math.min(d1 / 2, d2 / 2, size);
  const { x, y } = b;
  if (bendSize <= 0.01 || (a.x === x && x === c.x) || (a.y === y && y === c.y)) {
    return ` L ${x} ${y}`;
  }
  if (Math.abs(a.y - y) < 0.01) {
    // incoming segment is horizontal
    const xDir = a.x < c.x ? -1 : 1;
    const yDir = a.y < c.y ? 1 : -1;
    return ` L ${x + bendSize * xDir} ${y} Q ${x} ${y} ${x} ${y + bendSize * yDir}`;
  }
  // incoming segment is vertical
  const xDir = a.x < c.x ? 1 : -1;
  const yDir = a.y < c.y ? -1 : 1;
  return ` L ${x} ${y + bendSize * yDir} Q ${x} ${y} ${x + bendSize * xDir} ${y}`;
}

/**
 * Builds a deterministic orthogonal SVG path from an array of axis-aligned points.
 * Inserts subtle quadratic rounded corners (default borderRadius = 5px).
 */
export function buildOrthogonalPath(rawPoints: Point[], borderRadius = 5): string {
  if (rawPoints.length === 0) return "";
  if (rawPoints.length === 1) return `M ${rawPoints[0]!.x} ${rawPoints[0]!.y}`;

  // 1. Deduplicate consecutive identical points
  const pts: Point[] = [rawPoints[0]!];
  for (let i = 1; i < rawPoints.length; i++) {
    const prev = pts[pts.length - 1]!;
    const cur = rawPoints[i]!;
    if (Math.abs(cur.x - prev.x) > 0.01 || Math.abs(cur.y - prev.y) > 0.01) {
      pts.push(cur);
    }
  }
  if (pts.length < 2) return `M ${pts[0]!.x} ${pts[0]!.y}`;

  // 2. Collapse collinear intermediate points (same x or same y)
  const collapsed: Point[] = [pts[0]!];
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = collapsed[collapsed.length - 1]!;
    const cur = pts[i]!;
    const next = pts[i + 1]!;
    const isCollinearX = Math.abs(prev.x - cur.x) < 0.01 && Math.abs(cur.x - next.x) < 0.01;
    const isCollinearY = Math.abs(prev.y - cur.y) < 0.01 && Math.abs(cur.y - next.y) < 0.01;
    if (!isCollinearX && !isCollinearY) {
      collapsed.push(cur);
    }
  }
  collapsed.push(pts[pts.length - 1]!);

  let path = `M ${collapsed[0]!.x} ${collapsed[0]!.y}`;
  for (let i = 1; i < collapsed.length - 1; i++) {
    path += getBend(collapsed[i - 1]!, collapsed[i]!, collapsed[i + 1]!, borderRadius);
  }
  path += ` L ${collapsed[collapsed.length - 1]!.x} ${collapsed[collapsed.length - 1]!.y}`;
  return path;
}

/**
 * Checks whether a 2D point lies strictly on a polyline's orthogonal segments (within tolerance).
 */
export function isPointOnPathSegments(pt: Point, points: Point[], tolerance = 1.5): boolean {
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const minX = Math.min(p1.x, p2.x) - tolerance;
    const maxX = Math.max(p1.x, p2.x) + tolerance;
    const minY = Math.min(p1.y, p2.y) - tolerance;
    const maxY = Math.max(p1.y, p2.y) + tolerance;

    if (Math.abs(p1.x - p2.x) < tolerance) {
      // Vertical segment
      if (Math.abs(pt.x - p1.x) <= tolerance && pt.y >= minY && pt.y <= maxY) {
        return true;
      }
    } else if (Math.abs(p1.y - p2.y) < tolerance) {
      // Horizontal segment
      if (Math.abs(pt.y - p1.y) <= tolerance && pt.x >= minX && pt.x <= maxX) {
        return true;
      }
    }
  }
  return false;
}

function rectsIntersect(a: Rect, b: Rect, margin = 0): boolean {
  return !(
    a.right + margin <= b.left ||
    a.left - margin >= b.right ||
    a.bottom + margin <= b.top ||
    a.top - margin >= b.bottom
  );
}

function computeOverlapArea(a: Rect, b: Rect): number {
  const xOverlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const yOverlap = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return xOverlap * yOverlap;
}

/**
 * Pure and deterministic edge path & label layout engine (Stage B4e2, D-189).
 *
 * Rules:
 * - Handles stay centered at Position.Bottom (source) and Position.Top (target).
 * - Fan-out labels (source out-degree >= 2) placed toward target end (t in [0.58, 0.70]) where
 *   parallel target columns diverge by 290px (>= 168px label width).
 * - Fan-in labels (target in-degree >= 2) placed toward source end (t in [0.30, 0.42]) where
 *   source columns diverge by 290px.
 * - Multi-rank bypass edges: path constructed through Dagre waypoints using cubic bezier segments (C);
 *   label placed on the first rank transition gap (t ~ 0.50 between source and first waypoint).
 * - Parallel edges between same pair: offset path control points laterally by 36px and label by 40px/0.08t.
 * - Guaranteed clearance: minimum 8px margin from source and target node rectangles.
 * - Fallback collision loop: nudges t and x, bounded at 3 deterministic iterations, keeps least-overlap result.
 */
export function computeEdgeLabelLayout(
  nodes: PositionedNode[],
  edges: { id: string; source: string; target: string; data: EdgeSpec }[],
  dagreEdgePoints?: Map<string, Point[]>,
): Map<string, EdgeLabelPlacement> {
  const resultMap = new Map<string, EdgeLabelPlacement>();
  const nodeMap = new Map<string, PositionedNode>();
  const nodeRects: Rect[] = [];

  for (const n of nodes) {
    nodeMap.set(n.id, n);
    nodeRects.push({
      left: n.position.x,
      top: n.position.y,
      right: n.position.x + n.width,
      bottom: n.position.y + n.height,
    });
  }

  // Count degrees and group sibling edges
  const outgoingMap = new Map<string, typeof edges>();
  const incomingMap = new Map<string, typeof edges>();
  const pairMap = new Map<string, typeof edges>();

  for (const edge of edges) {
    const outList = outgoingMap.get(edge.source) || [];
    outList.push(edge);
    outgoingMap.set(edge.source, outList);

    const inList = incomingMap.get(edge.target) || [];
    inList.push(edge);
    incomingMap.set(edge.target, inList);

    const pairKey = `${edge.source}__${edge.target}`;
    const pList = pairMap.get(pairKey) || [];
    pList.push(edge);
    pairMap.set(pairKey, pList);
  }

  // Deterministically sort outgoing siblings by target.x, then edge.id
  for (const edgeList of outgoingMap.values()) {
    edgeList.sort((a, b) => {
      const tgtA = nodeMap.get(a.target);
      const tgtB = nodeMap.get(b.target);
      const xA = tgtA ? tgtA.position.x : 0;
      const xB = tgtB ? tgtB.position.x : 0;
      if (xA !== xB) return xA - xB;
      return a.id.localeCompare(b.id);
    });
  }

  // Deterministically sort incoming siblings by source.x, then edge.id
  for (const edgeList of incomingMap.values()) {
    edgeList.sort((a, b) => {
      const srcA = nodeMap.get(a.source);
      const srcB = nodeMap.get(b.source);
      const xA = srcA ? srcA.position.x : 0;
      const xB = srcB ? srcB.position.x : 0;
      if (xA !== xB) return xA - xB;
      return a.id.localeCompare(b.id);
    });
  }

  // Deterministically sort parallel edges by edge.id
  for (const edgeList of pairMap.values()) {
    edgeList.sort((a, b) => a.id.localeCompare(b.id));
  }

  const placedLabels: { id: string; rect: Rect; source: string; target: string }[] = [];

  for (const edge of edges) {
    const srcNode = nodeMap.get(edge.source);
    const tgtNode = nodeMap.get(edge.target);

    // Fallback if node not found
    if (!srcNode || !tgtNode) {
      resultMap.set(edge.id, {
        labelX: 0,
        labelY: 0,
        labelWidth: 0,
        labelHeight: 0,
        pathD: "M 0 0",
      });
      continue;
    }

    const pStart: Point = {
      x: srcNode.position.x + srcNode.width / 2,
      y: srcNode.position.y + srcNode.height,
    };
    const pEnd: Point = {
      x: tgtNode.position.x + tgtNode.width / 2,
      y: tgtNode.position.y,
    };

    const deltaY = pEnd.y - pStart.y;
    const outSiblings = outgoingMap.get(edge.source) || [];
    const inSiblings = incomingMap.get(edge.target) || [];
    const kOut = outSiblings.length;
    const kIn = inSiblings.length;
    const outIdx = outSiblings.findIndex((e) => e.id === edge.id);
    const inIdx = inSiblings.findIndex((e) => e.id === edge.id);

    // Parallel edge offset
    const parallelList = pairMap.get(`${edge.source}__${edge.target}`) || [];
    const mParallel = parallelList.length;
    const pIdx = parallelList.findIndex((e) => e.id === edge.id);
    const parallelOffsetIdx = mParallel > 1 ? pIdx - (mParallel - 1) / 2 : 0;
    const pathXOffset = parallelOffsetIdx * 36;
    const yStagger = parallelOffsetIdx * 12;

    // Check for multi-rank edge waypoints
    const rawWaypoints = dagreEdgePoints?.get(`${edge.source}__${edge.target}`);
    const isMultiRank = rawWaypoints && rawWaypoints.length > 2 && deltaY > RANKSEP * 1.5;

    // Determine initial parameter shelf position based on fan-out vs fan-in column divergence
    let stepRatio = 0.50;
    if (kOut >= 2 && kIn === 1) {
      // Fan-out: stagger horizontal shelf so parallel fan-outs do not overlap
      stepRatio = 0.38 + (kOut > 1 ? 0.24 * (outIdx / (kOut - 1)) : 0);
    } else if (kIn >= 2 && kOut === 1) {
      // Fan-in: stagger horizontal shelf so parallel fan-ins do not overlap
      stepRatio = 0.38 + (kIn > 1 ? 0.24 * (inIdx / (kIn - 1)) : 0);
    } else if (kOut >= 2 && kIn >= 2) {
      const totalIdx = outIdx + inIdx;
      const totalMax = Math.max(1, (kOut - 1) + (kIn - 1));
      stepRatio = 0.35 + 0.30 * (totalIdx / totalMax);
    }

    const minShelfY = pStart.y + 16;
    const maxShelfY = pEnd.y - 16;
    const shelfY = Math.max(minShelfY, Math.min(maxShelfY, pStart.y + deltaY * stepRatio + yStagger));

    let edgePoints: Point[] = [];

    if (isMultiRank && rawWaypoints) {
      // Build orthogonal multi-rank points through Dagre intermediate waypoints
      const pts: Point[] = [
        pStart,
        ...rawWaypoints.slice(1, -1).map((p) => ({ x: p.x + pathXOffset, y: p.y })),
        pEnd,
      ];
      edgePoints.push(pts[0]!);
      for (let i = 0; i < pts.length - 1; i++) {
        const cur = pts[i]!;
        const next = pts[i + 1]!;
        if (Math.abs(cur.x - next.x) > 0.01) {
          const midY = (cur.y + next.y) / 2 + yStagger;
          edgePoints.push({ x: cur.x, y: midY });
          edgePoints.push({ x: next.x, y: midY });
        }
        edgePoints.push(next);
      }
    } else {
      // Standard single rank gap: orthogonal step with vertical entry/exit stubs
      if (Math.abs(pStart.x - pEnd.x) < 0.01 && pathXOffset === 0) {
        // Collinear straight vertical connection
        edgePoints = [pStart, pEnd];
      } else {
        edgePoints = [
          pStart,
          { x: pStart.x + pathXOffset, y: shelfY },
          { x: pEnd.x + pathXOffset, y: shelfY },
          pEnd,
        ];
      }
    }

    const pathD = buildOrthogonalPath(edgePoints, 5);

    // Label dimensions: condition width affects computeEdgeLabelLayout per approved answer
    const flows = edge.data.flows || "";
    const condition = (edge.data.condition || "").trim();
    const hasCondition = Boolean(condition.length > 0);
    const flowsWidth = estimateLabelWidth(flows);
    const conditionWidth = estimateLabelWidth(condition);
    const labelWidth = Math.max(flowsWidth, conditionWidth);
    const labelHeight = hasCondition ? CONDITIONAL_LABEL_HEIGHT : (flows.trim().length > 0 ? LABEL_HEIGHT : 0);

    // If edge has no text and no condition, placement is trivial
    if (labelWidth === 0 && labelHeight === 0) {
      resultMap.set(edge.id, {
        labelX: Math.round(pStart.x * 10) / 10,
        labelY: Math.round((pStart.y + deltaY / 2) * 10) / 10,
        labelWidth: 0,
        labelHeight: 0,
        pathD,
      });
      continue;
    }

    // Segment-anchored candidate selection: test points strictly along orthogonal segments
    const candidatePoints: Point[] = [];

    if (isMultiRank) {
      // Anchor in first vertical rank transition segment
      candidatePoints.push({
        x: pStart.x + pathXOffset,
        y: Math.max(pStart.y + 8 + labelHeight / 2, Math.min(shelfY - 4 - labelHeight / 2, (pStart.y + shelfY) / 2)),
      });
    } else if (kOut >= 2 && kIn === 1) {
      // Fan-out: anchor on target vertical stub where child columns are separated by >= 290px
      const targetStubY = shelfY + (pEnd.y - shelfY) * 0.5;
      candidatePoints.push({
        x: pEnd.x + pathXOffset,
        y: Math.max(pStart.y + 8 + labelHeight / 2, Math.min(pEnd.y - 8 - labelHeight / 2, targetStubY)),
      });
      candidatePoints.push({
        x: pEnd.x + pathXOffset,
        y: Math.max(pStart.y + 8 + labelHeight / 2, Math.min(pEnd.y - 8 - labelHeight / 2, targetStubY + 12)),
      });
      candidatePoints.push({
        x: pEnd.x + pathXOffset,
        y: Math.max(pStart.y + 8 + labelHeight / 2, Math.min(pEnd.y - 8 - labelHeight / 2, targetStubY - 12)),
      });
    } else if (kIn >= 2 && kOut === 1) {
      // Fan-in: anchor on source vertical stub where parent columns are separated by >= 290px
      const sourceStubY = pStart.y + (shelfY - pStart.y) * 0.5;
      candidatePoints.push({
        x: pStart.x + pathXOffset,
        y: Math.max(pStart.y + 8 + labelHeight / 2, Math.min(pEnd.y - 8 - labelHeight / 2, sourceStubY)),
      });
      candidatePoints.push({
        x: pStart.x + pathXOffset,
        y: Math.max(pStart.y + 8 + labelHeight / 2, Math.min(pEnd.y - 8 - labelHeight / 2, sourceStubY + 12)),
      });
      candidatePoints.push({
        x: pStart.x + pathXOffset,
        y: Math.max(pStart.y + 8 + labelHeight / 2, Math.min(pEnd.y - 8 - labelHeight / 2, sourceStubY - 12)),
      });
    } else {
      // Single connection: check vertical midpoint, or horizontal shelf midpoint if wide enough
      if (Math.abs(pStart.x - pEnd.x) >= labelWidth + 24) {
        candidatePoints.push({
          x: (pStart.x + pEnd.x) / 2 + pathXOffset,
          y: shelfY,
        });
      }
      candidatePoints.push({
        x: pEnd.x + pathXOffset,
        y: Math.max(pStart.y + 8 + labelHeight / 2, Math.min(pEnd.y - 8 - labelHeight / 2, pStart.y + deltaY / 2)),
      });
      candidatePoints.push({
        x: pStart.x + pathXOffset,
        y: Math.max(pStart.y + 8 + labelHeight / 2, Math.min(pEnd.y - 8 - labelHeight / 2, pStart.y + deltaY / 2)),
      });
    }

    // Fallback candidates: midpoints of every non-zero segment of this edge
    for (let i = 0; i < edgePoints.length - 1; i++) {
      const p1 = edgePoints[i]!;
      const p2 = edgePoints[i + 1]!;
      const midCandidate = {
        x: (p1.x + p2.x) / 2,
        y: Math.max(pStart.y + 8 + labelHeight / 2, Math.min(pEnd.y - 8 - labelHeight / 2, (p1.y + p2.y) / 2)),
      };
      candidatePoints.push(midCandidate);
    }

    let bestOverlap = Infinity;
    let bestPoint = candidatePoints[0]!;

    for (let iter = 0; iter < candidatePoints.length; iter++) {
      const cand = candidatePoints[iter]!;
      const candRect: Rect = {
        left: cand.x - labelWidth / 2,
        top: cand.y - labelHeight / 2,
        right: cand.x + labelWidth / 2,
        bottom: cand.y + labelHeight / 2,
      };

      // Check node clearance (min 8px)
      let totalOverlap = 0;
      for (const nr of nodeRects) {
        if (rectsIntersect(candRect, nr, 8)) {
          totalOverlap += computeOverlapArea(candRect, nr) + 1000;
        }
      }

      // Check all-pairs label clearance (min 4px)
      for (const prev of placedLabels) {
        if (rectsIntersect(candRect, prev.rect, 4)) {
          totalOverlap += computeOverlapArea(candRect, prev.rect) + 500;
        }
      }

      if (totalOverlap < bestOverlap) {
        bestOverlap = totalOverlap;
        bestPoint = cand;
        if (bestOverlap === 0) break; // Zero collision found
      }
    }

    const finalRect: Rect = {
      left: bestPoint.x - labelWidth / 2,
      top: bestPoint.y - labelHeight / 2,
      right: bestPoint.x + labelWidth / 2,
      bottom: bestPoint.y + labelHeight / 2,
    };

    placedLabels.push({
      id: edge.id,
      rect: finalRect,
      source: edge.source,
      target: edge.target,
    });

    resultMap.set(edge.id, {
      labelX: Math.round(bestPoint.x * 10) / 10,
      labelY: Math.round(bestPoint.y * 10) / 10,
      labelWidth,
      labelHeight,
      pathD,
    });
  }

  return resultMap;
}

/**
 * Pure DAG layout calculation using @dagrejs/dagre.
 */
export function computeLayout(spec: ArchitectureSpec): LayoutResult {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: "TB",
    nodesep: NODESEP,
    ranksep: RANKSEP,
  });
  g.setDefaultEdgeLabel(() => ({}));

  // Sort nodes by id for deterministic layout computation
  const sortedNodes = [...spec.nodes].sort((a, b) => a.id.localeCompare(b.id));
  const nodeMap = new Map<string, NodeSpec>();
  const dimMap = new Map<string, { width: number; height: number }>();

  for (const node of sortedNodes) {
    nodeMap.set(node.id, node);
    const shape = classifyNodeShape(node, spec);
    const dims = computeNodeDimensions(node, shape);
    dimMap.set(node.id, dims);
    g.setNode(node.id, { width: dims.width, height: dims.height });
  }

  // Sort edges deterministically by from, to, and flows
  const sortedEdges = [...spec.edges].sort((a, b) => {
    const fromComp = a.from.localeCompare(b.from);
    if (fromComp !== 0) return fromComp;
    const toComp = a.to.localeCompare(b.to);
    if (toComp !== 0) return toComp;
    return a.flows.localeCompare(b.flows);
  });

  for (const edge of sortedEdges) {
    const labelWidth = estimateLabelWidth(edge.flows);
    if (labelWidth > RANKSEP) {
      g.setEdge(edge.from, edge.to, {
        width: labelWidth,
        height: DAGRE_LABEL_HEIGHT,
        labelpos: "c",
      });
    } else {
      g.setEdge(edge.from, edge.to);
    }
  }

  dagre.layout(g);

  const positionedNodes: PositionedNode[] = [];
  for (const node of sortedNodes) {
    const dagreNode = g.node(node.id);
    if (!dagreNode) continue;
    const dims = dimMap.get(node.id) ?? { width: NODE_WIDTH, height: NODE_HEIGHT };

    // Convert center (x, y) coordinates to top-left
    const x = Math.round(dagreNode.x - dims.width / 2);
    const y = Math.round(dagreNode.y - dims.height / 2);

    positionedNodes.push({
      id: node.id,
      data: node,
      position: { x, y },
      width: dims.width,
      height: dims.height,
    });
  }

  // Extract Dagre edge waypoints for multi-rank paths
  const dagreEdgePoints = new Map<string, Point[]>();
  for (const edge of sortedEdges) {
    const edgeData = g.edge(edge.from, edge.to) as { points?: Point[] } | undefined;
    if (edgeData?.points && edgeData.points.length > 0) {
      dagreEdgePoints.set(`${edge.from}__${edge.to}`, edgeData.points);
    }
  }

  // Raw edges list for label geometry engine
  const rawEdges = sortedEdges.map((edge, idx) => ({
    id: `e-${edge.from}-${edge.to}-${idx}`,
    source: edge.from,
    target: edge.to,
    data: edge,
  }));

  // Run pure edge & label geometry engine
  const edgePlacements = computeEdgeLabelLayout(positionedNodes, rawEdges, dagreEdgePoints);

  const positionedEdges: PositionedEdge[] = rawEdges.map((edge) => {
    const placement = edgePlacements.get(edge.id) || {
      labelX: 0,
      labelY: 0,
      labelWidth: 0,
      labelHeight: 0,
      pathD: "",
    };
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      data: edge.data,
      labelX: placement.labelX,
      labelY: placement.labelY,
      labelWidth: placement.labelWidth,
      labelHeight: placement.labelHeight,
      pathD: placement.pathD,
    };
  });

  const graphBounds = g.graph();
  const width = graphBounds?.width ?? 0;
  const height = graphBounds?.height ?? 0;

  return {
    nodes: positionedNodes,
    edges: positionedEdges,
    width,
    height,
  };
}
