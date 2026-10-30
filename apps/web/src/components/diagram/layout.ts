import dagre from "@dagrejs/dagre";
import type { ArchitectureSpec, EdgeSpec, NodeSpec } from "@/lib/types";

export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 72;
export const NODESEP = 40;
export const MIN_RANKSEP = 80;
export const RANKSEP = MIN_RANKSEP;

// Edge label estimation constants shared with DiagramEdge rendering
export const LABEL_FONT_PX = 11;
export const LABEL_CHAR_WIDTH_PX = 7;
export const LABEL_PADDING_X = 16; // 8px left + 8px right (px-2)
export const LABEL_BORDER_X = 2; // 1px left + 1px right border
export const MAX_LABEL_TEXT_WIDTH = 150; // max-w-[150px]
export const MAX_LABEL_TOTAL_WIDTH = MAX_LABEL_TEXT_WIDTH + LABEL_PADDING_X + LABEL_BORDER_X; // 168
export const LABEL_HEIGHT = 26;

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
 * Rules (BUILD_PLAN.md:436):
 * - rankdir: 'LR' (left to right)
 * - nodesep: 40
 * - ranksep: 80
 * - node dimensions: 220 by 72 pixels
 * - Dagre returns center coordinates (x, y); we convert to top-left for standard canvas rendering.
 * - Deterministic output: input nodes and edges are sorted deterministically before graph layout.
 */
export function computeLayout(spec: ArchitectureSpec): LayoutResult {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: "LR",
    nodesep: NODESEP,
    ranksep: RANKSEP,
  });
  g.setDefaultEdgeLabel(() => ({}));

  // Sort nodes by id for deterministic layout computation
  const sortedNodes = [...spec.nodes].sort((a, b) => a.id.localeCompare(b.id));
  const nodeMap = new Map<string, NodeSpec>();

  for (const node of sortedNodes) {
    nodeMap.set(node.id, node);
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
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

    // Convert center (x, y) coordinates to top-left
    const x = Math.round(dagreNode.x - NODE_WIDTH / 2);
    const y = Math.round(dagreNode.y - NODE_HEIGHT / 2);

    positionedNodes.push({
      id: node.id,
      data: node,
      position: { x, y },
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
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

