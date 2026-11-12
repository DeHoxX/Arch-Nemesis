import type { ArchitectureSpec, UnionArchitectureSpec } from "@/lib/types";

export interface FlowPlaybackStep {
  stepNumber: number; // 1..N
  edgeId: string;     // Identical to layout.ts e-${from}-${to}-${idx}
  from: string;
  to: string;
  fromName: string;
  toName: string;
  flows: string;
  condition?: string | null;
  description: string;
}

/**
 * Deterministic Kahn topological sort with alphabetical min-priority tie-breaking.
 * Matches backend validation ordering.py semantics.
 */
export function computeKahnTopologicalOrder(
  nodes: { id: string }[],
  edges: { from: string; to: string }[],
): string[] {
  const nodeIds = [...nodes.map((n) => n.id)].sort((a, b) => a.localeCompare(b));
  const inDegrees = new Map<string, number>();
  const adjList = new Map<string, string[]>();

  for (const id of nodeIds) {
    inDegrees.set(id, 0);
    adjList.set(id, []);
  }

  for (const edge of edges) {
    if (inDegrees.has(edge.from) && inDegrees.has(edge.to)) {
      adjList.get(edge.from)!.push(edge.to);
      inDegrees.set(edge.to, (inDegrees.get(edge.to) || 0) + 1);
    }
  }

  // Ready queue with in-degree == 0, kept sorted alphabetically for tie-breaking
  const ready: string[] = [];
  for (const id of nodeIds) {
    if (inDegrees.get(id) === 0) {
      ready.push(id);
    }
  }
  ready.sort((a, b) => a.localeCompare(b));

  const ordered: string[] = [];
  while (ready.length > 0) {
    const curr = ready.shift()!;
    ordered.push(curr);

    const neighbors = [...(adjList.get(curr) || [])].sort((a, b) => a.localeCompare(b));
    for (const neighbor of neighbors) {
      const updatedDeg = (inDegrees.get(neighbor) || 0) - 1;
      inDegrees.set(neighbor, updatedDeg);
      if (updatedDeg === 0) {
        ready.push(neighbor);
        ready.sort((a, b) => a.localeCompare(b));
      }
    }
  }

  // Append any unvisited nodes (e.g. cycles) deterministically in alphabetical order
  if (ordered.length < nodeIds.length) {
    const visited = new Set(ordered);
    const unvisited = nodeIds.filter((id) => !visited.has(id)).sort((a, b) => a.localeCompare(b));
    ordered.push(...unvisited);
  }

  return ordered;
}

/**
 * Pure function building deterministic flow playback steps for an architecture spec.
 *
 * Rules (Stage 1C, D-328):
 * - Derives topological order from flowOrder if provided; falls back to Kahn topological sort.
 * - Resolves edgeId identically to layout.ts (e-${from}-${to}-${idx}).
 * - Sorts edges by rank(from), rank(to), from, to, flows, originalIndex.
 * - Formats honest plain-text descriptions with no HTML execution.
 * - Returns empty array if spec has 0 edges.
 */
export function buildFlowPlaybackSteps(
  spec: ArchitectureSpec | UnionArchitectureSpec,
  flowOrder?: string[] | null,
): FlowPlaybackStep[] {
  if (!spec.edges || spec.edges.length === 0) {
    return [];
  }

  const nodes = spec.nodes || [];
  const nodeMap = new Map<string, (typeof nodes)[number]>();
  for (const n of nodes) {
    nodeMap.set(n.id, n);
  }

  // 1. Establish node topological ranking
  const rankMap = new Map<string, number>();
  let nextRank = 0;

  if (flowOrder && Array.isArray(flowOrder) && flowOrder.length > 0) {
    for (const id of flowOrder) {
      if (typeof id === "string" && nodeMap.has(id) && !rankMap.has(id)) {
        rankMap.set(id, nextRank++);
      }
    }
  }

  // If flowOrder is missing/empty or misses some nodes, compute Kahn order to fill the rest
  if (rankMap.size < nodes.length) {
    const kahnOrder = computeKahnTopologicalOrder(nodes, spec.edges);
    for (const id of kahnOrder) {
      if (!rankMap.has(id)) {
        rankMap.set(id, nextRank++);
      }
    }
  }

  // 2. Pre-index all edges to assign layout IDs identical to layout.ts:658-664 & 710-715
  // layout.ts sorts a shallow copy of spec.edges by from, to, flows.
  // In JS, Array.prototype.sort is stable since ES2019, so parallel identical edges retain original relative order.
  const tagged = spec.edges.map((edge, origIdx) => ({ edge, origIdx }));
  tagged.sort((a, b) => {
    const fromComp = a.edge.from.localeCompare(b.edge.from);
    if (fromComp !== 0) return fromComp;
    const toComp = a.edge.to.localeCompare(b.edge.to);
    if (toComp !== 0) return toComp;
    const flowsComp = (a.edge.flows || "").localeCompare(b.edge.flows || "");
    if (flowsComp !== 0) return flowsComp;
    return a.origIdx - b.origIdx;
  });

  const edgesWithLayoutId = tagged.map((item, layoutIdx) => ({
    ...item.edge,
    origIdx: item.origIdx,
    layoutEdgeId: `e-${item.edge.from}-${item.edge.to}-${layoutIdx}`,
  }));

  // 3. Sort a COPY by rank(from), rank(to), from, to, flows, original index
  edgesWithLayoutId.sort((a, b) => {
    const rankFromA = rankMap.get(a.from) ?? Infinity;
    const rankFromB = rankMap.get(b.from) ?? Infinity;
    if (rankFromA !== rankFromB) return rankFromA - rankFromB;

    const rankToA = rankMap.get(a.to) ?? Infinity;
    const rankToB = rankMap.get(b.to) ?? Infinity;
    if (rankToA !== rankToB) return rankToA - rankToB;

    const fromComp = a.from.localeCompare(b.from);
    if (fromComp !== 0) return fromComp;

    const toComp = a.to.localeCompare(b.to);
    if (toComp !== 0) return toComp;

    const flowsComp = (a.flows || "").localeCompare(b.flows || "");
    if (flowsComp !== 0) return flowsComp;

    return a.origIdx - b.origIdx;
  });

  // 4. Construct plain-text step objects
  return edgesWithLayoutId.map((edge, idx) => {
    const fromNode = nodeMap.get(edge.from);
    const toNode = nodeMap.get(edge.to);
    const fromName = fromNode?.name && fromNode.name.trim().length > 0 ? fromNode.name.trim() : edge.from;
    const toName = toNode?.name && toNode.name.trim().length > 0 ? toNode.name.trim() : edge.to;
    const flows = edge.flows || "";
    const condition = edge.condition && edge.condition.trim().length > 0 ? edge.condition.trim() : null;

    const firstLine = `${fromName} → ${toName}: ${flows}`;
    const description = condition ? `${firstLine}\nWhen: ${condition}` : firstLine;

    return {
      stepNumber: idx + 1,
      edgeId: edge.layoutEdgeId,
      from: edge.from,
      to: edge.to,
      fromName,
      toName,
      flows,
      condition,
      description,
    };
  });
}

