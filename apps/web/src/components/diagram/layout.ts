import dagre from "@dagrejs/dagre";
import type { ArchitectureSpec, EdgeSpec, NodeSpec } from "@/lib/types";
import { classifyNodeShape, type NodeShape } from "./classify";

export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 80;
export const NODESEP = 50;
export const MIN_RANKSEP = 96;
export const RANKSEP = MIN_RANKSEP;

// Edge label estimation constants shared with DiagramEdge rendering
export const LABEL_FONT_PX = 11;
export const LABEL_CHAR_WIDTH_PX = 7;
export const LABEL_PADDING_X = 16; // 8px left + 8px right (px-2)
export const LABEL_BORDER_X = 2; // 1px left + 1px right border
export const MAX_LABEL_TEXT_WIDTH = 150; // max-w-[150px]
export const MAX_LABEL_TOTAL_WIDTH = MAX_LABEL_TEXT_WIDTH + LABEL_PADDING_X + LABEL_BORDER_X; // 168
export const LABEL_HEIGHT = 26;

// Node dimension computation constants
export const CHAR_UNIT_PX = 7.2;
export const PADDING_Y = 24;
export const NAME_LINE_HEIGHT = 18;
export const TYPE_HEIGHT = 14;
export const ROLE_LINE_HEIGHT = 18;
export const BADGE_HEIGHT = 20;

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
 *
 * Rules (Stage B4e1 & D-188 Fix):
 * - Fixed width: 240px.
 * - Dynamic height computed from name and role text lines, clamped per shape.
 * - Usable text widths with safety margins:
 *     rectangle: 216px (px-3)
 *     pill: 168px (px-8)
 *     hexagon: 184px (px-7)
 *     diamond: 112px (centered inner box restricted to central rhombus region)
 * - Name max 2 lines; role max 2 lines (max 1 line for diamond).
 * - Clamps:
 *     rectangle / pill: [80, 130] px
 *     hexagon: [86, 140] px
 *     diamond: [140, 190] px
 */
export function computeNodeDimensions(
  node: { name: string; role?: string },
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

  let height: number;
  if (shape === "diamond") {
    // Rhombus geometry: inner box corners at (W_box, H_box) must satisfy (W_box / W) + (H_box / H) <= 1
    // With W = 240 and W_box = 112 (DIAMOND_INNER_WIDTH), W_box / W = 112 / 240 = 0.4667.
    // Thus H_box / H <= 1 - 0.4667 = 0.5333, which requires H >= H_box * 1.875.
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
      BADGE_HEIGHT;
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
      BADGE_HEIGHT;
    height = Math.min(
      RECT_MAX_HEIGHT,
      Math.max(RECT_MIN_HEIGHT, baseHeight),
    );
  }

  return { width, height };
}

/**
 * Pure and deterministic edge label pixel width estimation.
 *
 * Rules:
 * - Truncates at 40 characters matching DiagramEdge display rules.
 * - Monospace character counting: ASCII is 1 char unit (~7px), wide/CJK is 2 units (~14px).
 * - Clamps text width at MAX_LABEL_TEXT_WIDTH (150px).
 * - Adds horizontal padding (16px) and border (2px).
 * - Total return width is strictly bounded in [0, MAX_LABEL_TOTAL_WIDTH].
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
}

export interface LayoutResult {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  width: number;
  height: number;
}

/**
 * Pure DAG layout calculation using @dagrejs/dagre.
 *
 * Rules (Stage B4e1):
 * - rankdir: 'TB' (top to bottom)
 * - nodesep: 50
 * - ranksep: 96
 * - node width: 240 pixels; height computed dynamically from text
 * - Dagre returns center coordinates (x, y); we convert to top-left for standard canvas rendering.
 * - Deterministic output: input nodes and edges are sorted deterministically before graph layout.
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
        height: LABEL_HEIGHT,
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

  const positionedEdges: PositionedEdge[] = sortedEdges.map((edge, idx) => ({
    id: `e-${edge.from}-${edge.to}-${idx}`,
    source: edge.from,
    target: edge.to,
    data: edge,
  }));

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
