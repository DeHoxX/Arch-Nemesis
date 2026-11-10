import type { ArchitectureSpec } from "@/lib/types";

export interface FocusLineage {
  isActive: boolean;
  selectedNodeId: string | null;
  ancestorsAndSelf: Set<string>;
  descendantsAndSelf: Set<string>;
  focusedNodeIds: Set<string>;
}

/**
 * Computes upstream (ancestors) and downstream (descendants) lineage for a selected node.
 * Pure and cycle-safe using BFS with visited sets.
 *
 * If no node is selected, or the selected ID does not exist in spec.nodes,
 * returns an inactive lineage where isActive is false and all sets are empty.
 */
export function computeFocusLineage(
  spec: Pick<ArchitectureSpec, "nodes"> & { edges?: ArchitectureSpec["edges"] },
  selectedNodeId: string | null | undefined,
): FocusLineage {
  const emptyLineage: FocusLineage = {
    isActive: false,
    selectedNodeId: null,
    ancestorsAndSelf: new Set<string>(),
    descendantsAndSelf: new Set<string>(),
    focusedNodeIds: new Set<string>(),
  };

  if (!selectedNodeId || typeof selectedNodeId !== "string" || !selectedNodeId.trim()) {
    return emptyLineage;
  }

  const trimmedId = selectedNodeId.trim();
  const nodeExists = spec.nodes.some((n) => n.id === trimmedId);
  if (!nodeExists) {
    return emptyLineage;
  }

  // Build forward and reverse adjacency lists
  const forward = new Map<string, string[]>();
  const reverse = new Map<string, string[]>();

  for (const edge of spec.edges || []) {
    if (!edge.from || !edge.to) continue;
    const from = edge.from.trim();
    const to = edge.to.trim();
    if (!from || !to) continue;

    const fList = forward.get(from);
    if (fList) {
      fList.push(to);
    } else {
      forward.set(from, [to]);
    }

    const rList = reverse.get(to);
    if (rList) {
      rList.push(from);
    } else {
      reverse.set(to, [from]);
    }
  }

  // Upstream BFS: find all ancestors reachable via reverse edges
  const ancestorsAndSelf = new Set<string>([trimmedId]);
  const upQueue: string[] = [trimmedId];

  while (upQueue.length > 0) {
    const curr = upQueue.shift()!;
    const parents = reverse.get(curr);
    if (parents) {
      for (const parent of parents) {
        if (!ancestorsAndSelf.has(parent)) {
          ancestorsAndSelf.add(parent);
          upQueue.push(parent);
        }
      }
    }
  }

  // Downstream BFS: find all descendants reachable via forward edges
  const descendantsAndSelf = new Set<string>([trimmedId]);
  const downQueue: string[] = [trimmedId];

  while (downQueue.length > 0) {
    const curr = downQueue.shift()!;
    const children = forward.get(curr);
    if (children) {
      for (const child of children) {
        if (!descendantsAndSelf.has(child)) {
          descendantsAndSelf.add(child);
          downQueue.push(child);
        }
      }
    }
  }

  const focusedNodeIds = new Set<string>([...ancestorsAndSelf, ...descendantsAndSelf]);

  return {
    isActive: true,
    selectedNodeId: trimmedId,
    ancestorsAndSelf,
    descendantsAndSelf,
    focusedNodeIds,
  };
}

/**
 * Returns whether an edge is focused under the active lineage.
 * When focus is inactive, returns true (all edges visible).
 * When active, an edge is focused iff BOTH ends are in ancestorsAndSelf OR BOTH ends are in descendantsAndSelf.
 */
export function isEdgeInFocus(
  lineage: FocusLineage,
  source: string,
  target: string,
): boolean {
  if (!lineage.isActive) {
    return true;
  }
  const s = source.trim();
  const t = target.trim();
  const inAncestors = lineage.ancestorsAndSelf.has(s) && lineage.ancestorsAndSelf.has(t);
  const inDescendants = lineage.descendantsAndSelf.has(s) && lineage.descendantsAndSelf.has(t);
  return inAncestors || inDescendants;
}

