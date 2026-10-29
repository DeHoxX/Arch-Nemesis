import dagre from "@dagrejs/dagre";
import type { ArchitectureSpec, EdgeSpec, NodeSpec } from "@/lib/types";

export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 72;
export const NODESEP = 40;
export const RANKSEP = 80;

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
    g.setEdge(edge.from, edge.to);
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

