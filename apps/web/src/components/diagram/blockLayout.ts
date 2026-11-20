/**
 * Pure deterministic layered layout calculation engine for Block diagram view.
 *
 * Implements Stage V3-4A (D-395):
 * - Left-to-right functional swimlane columns
 * - Exact mirror of backend order_layers (ordering.py:36-84) with "Other parts" rightmost
 * - DAG depth fallback ("Stage 1", "Stage 2"...) for unlayered designs
 * - Deterministic node coordinate calculations (sorted by flow-order or id)
 * - Font-derived card geometry (92px height for 240px width)
 * - Backward edge detection (targetColumnIndex <= sourceColumnIndex)
 * - Role line truncation (formatShortRole: first sentence, max 60 chars)
 */

import type { ArchitectureSpec, EdgeSpec, NodeSpec } from "@/lib/types";

// ============================================================================
// Layout Geometry Constants
// Derived from Ember Studio font metrics and spacing hierarchy (Condition 5)
// ============================================================================

/** Fixed node card width */
export const BLOCK_NODE_WIDTH = 240;

/**
 * Derived node card height: 92px
 * Font arithmetic:
 * - Card vertical padding: 8px top + 8px bottom (pt-2 pb-2) = 16px
 * - Node name: up to 2 lines @ text-xs (12px font, 16px line-height) = 32px
 * - Name-to-role vertical gap = 4px
 * - Role line: 1 line @ text-[11px] (11px font, 15px line-height) = 15px
 * - Role-to-badge vertical gap = 6px
 * - Badge row (Entry / Exit / AI model pills): 1 line @ text-[9px] = 18px
 * - Border-box top/bottom stroke allowance = 1px
 * Total = 16 + 32 + 4 + 15 + 6 + 18 + 1 = 92px
 */
export const BLOCK_NODE_HEIGHT = 92;

/** Total column container width */
export const COLUMN_WIDTH = 280;

/** Horizontal padding on left and right inside column: (280 - 240) / 2 = 20px */
export const COLUMN_PADDING_X = 20;

/** Horizontal gap between columns (channel for backward loop edges) */
export const COLUMN_GAP = 90;

/** Column header bar height (layer title + node count badge) */
export const COLUMN_HEADER_HEIGHT = 44;

/** Space between column header and first node card */
export const COLUMN_PADDING_TOP = 16;

/** Bottom padding of column container */
export const COLUMN_PADDING_BOTTOM = 20;

/** Vertical gap between successive node cards in the same column */
export const NODE_GAP_Y = 20;

/** Fallback layer name for unassigned/whitespace layers */
export const OTHER_PARTS_LAYER = "Other parts";

// ============================================================================
// Layout Types
// ============================================================================

export interface BlockNodePosition {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  layer: string;
  columnIndex: number;
  indexInColumn: number;
}

export interface BlockColumnLayout {
  id: string;
  name: string;
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  nodeIds: string[];
}

export interface BlockEdgeLayout {
  id: string;
  from: string;
  to: string;
  flows: string;
  condition?: string | null;
  sourceColumnIndex: number;
  targetColumnIndex: number;
  isBackward: boolean;
}

export interface BlockLayoutResult {
  columns: BlockColumnLayout[];
  nodes: BlockNodePosition[];
  edges: BlockEdgeLayout[];
  width: number;
  height: number;
}

// ============================================================================
// Pure Comparison and Folding Helpers (Parity with Python)
// ============================================================================

/**
 * Plain code-point comparison: a < b ? -1 : a > b ? 1 : 0
 * Mirrors Python string comparison (< and >).
 */
export function compareCodePoints(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Case-folding helper matching Python str.casefold().
 *
 * Known difference from standard toLowerCase():
 * Python's casefold() expands special casing characters such as German sharp s ("ß" -> "ss").
 * For standard ASCII and European layer names (e.g., "Ärzte" -> "ärzte"), toLowerCase() matches casefold().
 * Here we expand "ß" -> "ss" to achieve exact parity with Python's casefold() for any edge cases.
 */
export function foldCase(str: string): string {
  return str.replace(/ß/g, "ss").toLowerCase();
}

// ============================================================================
// Role Formatter (Condition 7 & Fix 1)
// ============================================================================

/**
 * Truncates node role description to first sentence, max 60 chars.
 * - Cuts at first newline BEFORE collapsing whitespace.
 * - Extracts up to first period, exclamation mark, question mark, or end of first line.
 * - Trims extra whitespace.
 * - If length > 60 chars, cuts at word boundary if possible and appends "...".
 * - Returns empty string for null, undefined, or whitespace-only role.
 */
export function formatShortRole(role?: string | null): string {
  if (!role) return "";

  // 1. Cut at first newline BEFORE collapsing internal whitespace
  const firstLine = role.split(/\r?\n/)[0] ?? "";
  const trimmed = firstLine.trim();
  if (trimmed.length === 0) return "";

  // 2. Match up to first ., !, or ?
  const sentenceMatch = trimmed.match(/^([^.!?]+(?:[.!?]|$))/);
  const matchedText = sentenceMatch ? sentenceMatch[1] : undefined;
  let firstSentence = matchedText ? matchedText.trim() : trimmed;

  // 3. Normalize remaining inline whitespace
  firstSentence = firstSentence.replace(/\s+/g, " ");

  if (firstSentence.length <= 60) {
    return firstSentence;
  }

  // Max length with ellipsis is 60 -> prefix is up to 57 chars
  const maxPrefix = 57;
  const candidate = firstSentence.slice(0, maxPrefix);
  const lastSpace = candidate.lastIndexOf(" ");

  if (lastSpace > 0) {
    return candidate.slice(0, lastSpace).trimEnd() + "...";
  }

  return candidate.trimEnd() + "...";
}

// ============================================================================
// Layer Display Name Normalization
// Mirror of ordering.py:14-33 (_resolve_layer_display_names)
// ============================================================================

export function resolveLayerDisplayNames(spec: ArchitectureSpec): Record<string, string> {
  const keyToVariants: Record<string, Set<string>> = {};

  for (const node of spec.nodes) {
    if (node.layer !== undefined && node.layer !== null && node.layer.trim().length > 0) {
      const cleaned = node.layer.trim().split(/\s+/).join(" ");
      if (cleaned.length > 0) {
        const key = foldCase(cleaned);
        let set = keyToVariants[key];
        if (!set) {
          set = new Set<string>();
          keyToVariants[key] = set;
        }
        set.add(cleaned);
      }
    }
  }

  const displayNames: Record<string, string> = {};
  for (const [key, variants] of Object.entries(keyToVariants)) {
    if (key === foldCase(OTHER_PARTS_LAYER)) {
      displayNames[key] = OTHER_PARTS_LAYER;
    } else {
      // In Python: min(variants) (lexicographical code-point minimum, ordering.py:32)
      const sorted = Array.from(variants).sort(compareCodePoints);
      displayNames[key] = sorted[0] ?? "";
    }
  }

  return displayNames;
}

// ============================================================================
// Topological Rank Calculation
// Longest-path rank in DAG: rank[v] = max(rank[p] + 1 for p in preds), default 0
// ============================================================================

export function computeDagRanks(
  nodes: NodeSpec[],
  edges: EdgeSpec[],
): Record<string, number> {
  const validNodeIds = new Set(nodes.map((n) => n.id));
  const preds: Record<string, string[]> = {};
  const succs: Record<string, string[]> = {};
  const inDegree: Record<string, number> = {};

  for (const id of validNodeIds) {
    preds[id] = [];
    succs[id] = [];
    inDegree[id] = 0;
  }

  for (const edge of edges) {
    if (validNodeIds.has(edge.from) && validNodeIds.has(edge.to) && edge.from !== edge.to) {
      preds[edge.to]?.push(edge.from);
      succs[edge.from]?.push(edge.to);
      inDegree[edge.to] = (inDegree[edge.to] ?? 0) + 1;
    }
  }

  // Deterministic Kahn's algorithm
  const queue: string[] = [];
  const ranks: Record<string, number> = {};

  for (const id of Object.keys(inDegree).sort(compareCodePoints)) {
    if ((inDegree[id] ?? 0) === 0) {
      queue.push(id);
      ranks[id] = 0;
    }
  }

  let processedCount = 0;
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    processedCount++;
    const currentRank = ranks[current] ?? 0;

    const currentSuccs = succs[current] ?? [];
    for (const succ of [...currentSuccs].sort(compareCodePoints)) {
      const predRank = currentRank + 1;
      ranks[succ] = Math.max(ranks[succ] ?? 0, predRank);

      inDegree[succ] = (inDegree[succ] ?? 1) - 1;
      if (inDegree[succ] === 0) {
        queue.push(succ);
      }
    }
  }

  // Cycle fallback: assign any unranked nodes maxRank + 1
  if (processedCount < validNodeIds.size) {
    const allRanks = Object.values(ranks);
    const maxRank = allRanks.length > 0 ? Math.max(0, ...allRanks) : 0;
    for (const id of validNodeIds) {
      if (ranks[id] === undefined) {
        ranks[id] = maxRank + 1;
      }
    }
  }

  return ranks;
}

// ============================================================================
// Layer Ordering
// ============================================================================

/**
 * Exact mirror of archnemesis.modules.validation.ordering.order_layers (ordering.py:36-84).
 * Orders layers by the smallest longest-path rank of their member nodes,
 * breaking ties by layer_name.casefold() then layer_name using plain code-point comparison.
 * Unassigned nodes belong to OTHER_PARTS_LAYER.
 */
export function orderLayersBase(spec: ArchitectureSpec): string[] {
  if (!spec.nodes || spec.nodes.length === 0) {
    return [];
  }

  const ranks = computeDagRanks(spec.nodes, spec.edges || []);
  const layerDisplayNames = resolveLayerDisplayNames(spec);

  const nodeToLayer: Record<string, string> = {};
  const layersSeen = new Set<string>();

  for (const node of spec.nodes) {
    let layerName: string;
    if (node.layer !== undefined && node.layer !== null && node.layer.trim().length > 0) {
      const cleaned = node.layer.trim().split(/\s+/).join(" ");
      layerName = layerDisplayNames[foldCase(cleaned)] ?? cleaned;
    } else {
      layerName = OTHER_PARTS_LAYER;
    }
    nodeToLayer[node.id] = layerName;
    layersSeen.add(layerName);
  }

  // Compute min rank for each layer
  const layerMinRanks: Record<string, number> = {};
  for (const layer of layersSeen) {
    const layerNodeIds = Object.keys(nodeToLayer).filter((id) => nodeToLayer[id] === layer);
    const minRank = Math.min(...layerNodeIds.map((id) => ranks[id] ?? 0));
    layerMinRanks[layer] = minRank;
  }

  // Sort by (min_rank, foldCase(layer_name), layer_name) using plain code-point comparison
  // Mirror of ordering.py:82: key=lambda l_name: (layer_min_ranks[l_name], l_name.casefold(), l_name)
  const sortedLayers = Array.from(layersSeen).sort((a, b) => {
    const rankA = layerMinRanks[a] ?? 0;
    const rankB = layerMinRanks[b] ?? 0;
    if (rankA !== rankB) return rankA - rankB;

    const foldedA = foldCase(a);
    const foldedB = foldCase(b);
    const foldedCmp = compareCodePoints(foldedA, foldedB);
    if (foldedCmp !== 0) return foldedCmp;

    return compareCodePoints(a, b);
  });

  return sortedLayers;
}

/**
 * Frontend Block view layer ordering with "Other parts" rightmost placement.
 * Runs orderLayersBase, then moves "Other parts" (if present) to the final rightmost column.
 */
export function orderLayers(spec: ArchitectureSpec): string[] {
  const base = orderLayersBase(spec);
  if (!base.includes(OTHER_PARTS_LAYER)) {
    return base;
  }
  return [...base.filter((l) => l !== OTHER_PARTS_LAYER), OTHER_PARTS_LAYER];
}

// ============================================================================
// Full Block Layout Engine (Condition 4, 5, 6)
// ============================================================================

/**
 * Computes deterministic (x, y) coordinates for all columns, nodes, and edges.
 * If spec has no layers (or all empty), generates "Stage 1", "Stage 2"... columns by DAG depth.
 */
export function computeBlockLayout(
  spec: ArchitectureSpec,
  flowOrder?: string[] | null,
): BlockLayoutResult {
  if (!spec.nodes || spec.nodes.length === 0) {
    return {
      columns: [],
      nodes: [],
      edges: [],
      width: 0,
      height: 0,
    };
  }

  const ranks = computeDagRanks(spec.nodes, spec.edges || []);
  const hasAnyLayer = spec.nodes.some(
    (n) => n.layer !== undefined && n.layer !== null && n.layer.trim().length > 0,
  );

  let columnNames: string[] = [];
  const nodeLayerMap: Record<string, string> = {};

  if (hasAnyLayer) {
    columnNames = orderLayers(spec);
    const displayNames = resolveLayerDisplayNames(spec);
    for (const node of spec.nodes) {
      if (node.layer !== undefined && node.layer !== null && node.layer.trim().length > 0) {
        const cleaned = node.layer.trim().split(/\s+/).join(" ");
        nodeLayerMap[node.id] = displayNames[foldCase(cleaned)] ?? cleaned;
      } else {
        nodeLayerMap[node.id] = OTHER_PARTS_LAYER;
      }
    }
  } else {
    // Condition 3 Fallback: group by DAG depth into "Stage 1", "Stage 2"...
    const allRanks = Object.values(ranks);
    const maxDepth = allRanks.length > 0 ? Math.max(0, ...allRanks) : 0;
    columnNames = Array.from({ length: maxDepth + 1 }, (_, idx) => `Stage ${idx + 1}`);
    for (const node of spec.nodes) {
      const depth = ranks[node.id] ?? 0;
      nodeLayerMap[node.id] = `Stage ${depth + 1}`;
    }
  }

  // Group nodes into columns
  const nodesByColumn: Record<string, NodeSpec[]> = {};
  for (const name of columnNames) {
    nodesByColumn[name] = [];
  }

  const defaultCol = columnNames[0] ?? OTHER_PARTS_LAYER;
  for (const node of spec.nodes) {
    const layerName = nodeLayerMap[node.id] ?? defaultCol;
    const colList = nodesByColumn[layerName];
    if (colList) {
      colList.push(node);
    }
  }

  // Deterministically sort nodes within each column
  for (const name of columnNames) {
    const colList = nodesByColumn[name];
    if (colList) {
      colList.sort((a, b) => {
        if (flowOrder && flowOrder.length > 0) {
          const idxA = flowOrder.indexOf(a.id);
          const idxB = flowOrder.indexOf(b.id);
          const posA = idxA >= 0 ? idxA : Number.POSITIVE_INFINITY;
          const posB = idxB >= 0 ? idxB : Number.POSITIVE_INFINITY;
          if (posA !== posB) return posA - posB;
        }
        return compareCodePoints(a.id, b.id);
      });
    }
  }

  // Determine overall max column height for aligned swimlanes
  let maxColHeight = 120;
  for (const name of columnNames) {
    const colNodes = nodesByColumn[name] ?? [];
    const count = colNodes.length;
    const colHeight =
      COLUMN_HEADER_HEIGHT +
      COLUMN_PADDING_TOP +
      count * BLOCK_NODE_HEIGHT +
      Math.max(0, count - 1) * NODE_GAP_Y +
      COLUMN_PADDING_BOTTOM;
    if (colHeight > maxColHeight) {
      maxColHeight = colHeight;
    }
  }

  // Layout columns and nodes
  const columns: BlockColumnLayout[] = [];
  const nodePositions: BlockNodePosition[] = [];
  const nodePositionMap = new Map<string, BlockNodePosition>();

  columnNames.forEach((layerName, colIdx) => {
    const colX = colIdx * (COLUMN_WIDTH + COLUMN_GAP);
    const colY = 0;
    const colNodes = nodesByColumn[layerName] ?? [];

    columns.push({
      id: layerName,
      name: layerName,
      index: colIdx,
      x: colX,
      y: colY,
      width: COLUMN_WIDTH,
      height: maxColHeight,
      nodeIds: colNodes.map((n) => n.id),
    });

    colNodes.forEach((node, nodeIdx) => {
      const nodeX = colX + COLUMN_PADDING_X;
      const nodeY =
        COLUMN_HEADER_HEIGHT +
        COLUMN_PADDING_TOP +
        nodeIdx * (BLOCK_NODE_HEIGHT + NODE_GAP_Y);

      const pos: BlockNodePosition = {
        id: node.id,
        name: node.name,
        x: nodeX,
        y: nodeY,
        width: BLOCK_NODE_WIDTH,
        height: BLOCK_NODE_HEIGHT,
        layer: layerName,
        columnIndex: colIdx,
        indexInColumn: nodeIdx,
      };

      nodePositions.push(pos);
      nodePositionMap.set(node.id, pos);
    });
  });

  // Layout edges & flag backward edges (Condition 6)
  const edges: BlockEdgeLayout[] = [];
  const rawEdges = spec.edges || [];

  for (const edge of rawEdges) {
    const sourcePos = nodePositionMap.get(edge.from);
    const targetPos = nodePositionMap.get(edge.to);

    if (sourcePos && targetPos) {
      const isBackward = targetPos.columnIndex <= sourcePos.columnIndex;
      edges.push({
        id: `${edge.from}->${edge.to}`,
        from: edge.from,
        to: edge.to,
        flows: edge.flows,
        condition: edge.condition ?? null,
        sourceColumnIndex: sourcePos.columnIndex,
        targetColumnIndex: targetPos.columnIndex,
        isBackward,
      });
    }
  }

  // Deterministically sort edges by from, then to
  edges.sort((a, b) => {
    const fromCmp = compareCodePoints(a.from, b.from);
    if (fromCmp !== 0) return fromCmp;
    return compareCodePoints(a.to, b.to);
  });

  const totalWidth =
    columnNames.length > 0
      ? columnNames.length * COLUMN_WIDTH + (columnNames.length - 1) * COLUMN_GAP
      : 0;

  return {
    columns,
    nodes: nodePositions,
    edges,
    width: totalWidth,
    height: maxColHeight,
  };
}
