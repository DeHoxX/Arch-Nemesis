import type {
  ArchitectureSpec,
  PatchSummary,
  UnionArchitectureSpec,
  UnionEdgeSpec,
  UnionNodeSpec,
} from "./types";

/**
 * Normalizes edge source identifier whether backend provided `from_node` or `from`.
 */
function getEdgeFrom(edge: { from_node?: string; from?: string }): string {
  return edge.from_node ?? edge.from ?? "";
}

/**
 * Unique key for edge matching.
 */
function edgeKey(from: string, to: string): string {
  return `${from}->${to}`;
}

/**
 * Pure function to construct a union architecture graph suitable for diagram rendering.
 *
 * Requirements (Stage 7C1):
 * - Pure, no React.
 * - Does not mutate currentSpec or patch inputs.
 * - When preview_spec is null/undefined or patch status is "blocked", returns currentSpec
 *   with all nodes and edges marked "unchanged".
 * - Added nodes come from preview_spec (tagged "added").
 * - Removed nodes come from currentSpec (tagged "removed").
 * - Edited nodes come from preview_spec (tagged "edited").
 * - Unchanged nodes come from preview_spec (or currentSpec if not present) (tagged "unchanged").
 * - Added edges come from preview_spec (tagged "added").
 * - Removed edges come from currentSpec (tagged "removed").
 * - Edited edges come from preview_spec (tagged "edited").
 * - Unchanged edges come from preview_spec (tagged "unchanged").
 * - entry_ids and exit_ids follow preview_spec for kept nodes.
 * - Output satisfies UnionArchitectureSpec (fully compatible with computeLayout and DiagramView).
 */
export function buildUnionGraph(
  currentSpec: ArchitectureSpec,
  patch: PatchSummary | null | undefined,
): UnionArchitectureSpec {
  // If no patch or patch is blocked or has no preview_spec, return currentSpec with diffStatus: "unchanged"
  if (
    !patch ||
    patch.status === "blocked" ||
    !patch.preview_spec
  ) {
    return {
      nodes: currentSpec.nodes.map((node) => ({
        ...node,
        inputs: [...node.inputs],
        outputs: [...node.outputs],
        tech_options: [...node.tech_options],
        tools: node.tools ? [...node.tools] : undefined,
        diffStatus: "unchanged",
      })),
      edges: currentSpec.edges.map((edge) => ({
        ...edge,
        diffStatus: "unchanged",
      })),
      constraints: currentSpec.constraints.map((c) => ({
        ...c,
        covers: [...c.covers],
      })),
      entry_ids: [...currentSpec.entry_ids],
      exit_ids: [...currentSpec.exit_ids],
    };
  }

  const preview = patch.preview_spec;
  const diff = patch.diff;

  const addedNodeIds = new Set(diff?.added_nodes ?? []);
  const removedNodeIds = new Set(diff?.removed_nodes ?? []);
  const changedNodeIds = new Set((diff?.changed_nodes ?? []).map((cn) => cn.id));

  const previewNodesMap = new Map(preview.nodes.map((n) => [n.id, n]));

  // Build union nodes:
  const unionNodes: UnionNodeSpec[] = [];

  // 1. Process currentSpec nodes
  for (const node of currentSpec.nodes) {
    if (removedNodeIds.has(node.id)) {
      // Kept from currentSpec as "removed"
      unionNodes.push({
        ...node,
        inputs: [...node.inputs],
        outputs: [...node.outputs],
        tech_options: [...node.tech_options],
        tools: node.tools ? [...node.tools] : undefined,
        diffStatus: "removed",
      });
    } else if (changedNodeIds.has(node.id)) {
      // Updated definition from preview_spec as "edited"
      const previewNode = previewNodesMap.get(node.id) ?? node;
      unionNodes.push({
        ...previewNode,
        inputs: [...previewNode.inputs],
        outputs: [...previewNode.outputs],
        tech_options: [...previewNode.tech_options],
        tools: previewNode.tools ? [...previewNode.tools] : undefined,
        diffStatus: "edited",
      });
    } else {
      // Unchanged node
      const previewNode = previewNodesMap.get(node.id) ?? node;
      unionNodes.push({
        ...previewNode,
        inputs: [...previewNode.inputs],
        outputs: [...previewNode.outputs],
        tech_options: [...previewNode.tech_options],
        tools: previewNode.tools ? [...previewNode.tools] : undefined,
        diffStatus: "unchanged",
      });
    }
  }

  // 2. Add newly added nodes from preview_spec
  for (const previewNode of preview.nodes) {
    if (addedNodeIds.has(previewNode.id) || !unionNodes.some((n) => n.id === previewNode.id)) {
      if (!unionNodes.some((n) => n.id === previewNode.id)) {
        unionNodes.push({
          ...previewNode,
          inputs: [...previewNode.inputs],
          outputs: [...previewNode.outputs],
          tech_options: [...previewNode.tech_options],
          tools: previewNode.tools ? [...previewNode.tools] : undefined,
          diffStatus: "added",
        });
      }
    }
  }

  // Build union edges:
  const addedEdgeKeys = new Set(
    (diff?.added_edges ?? []).map((e) => edgeKey(getEdgeFrom(e), e.to)),
  );
  const removedEdgeKeys = new Set(
    (diff?.removed_edges ?? []).map((e) => edgeKey(getEdgeFrom(e), e.to)),
  );
  const changedEdgeKeys = new Set(
    (diff?.changed_edges ?? []).map((e) => edgeKey(getEdgeFrom(e), e.to)),
  );

  const previewEdgesMap = new Map(
    preview.edges.map((e) => [edgeKey(e.from, e.to), e]),
  );

  const unionEdges: UnionEdgeSpec[] = [];

  // 1. Process currentSpec edges
  for (const edge of currentSpec.edges) {
    const key = edgeKey(edge.from, edge.to);
    if (removedEdgeKeys.has(key)) {
      unionEdges.push({
        ...edge,
        diffStatus: "removed",
      });
    } else if (changedEdgeKeys.has(key)) {
      const previewEdge = previewEdgesMap.get(key) ?? edge;
      unionEdges.push({
        ...previewEdge,
        diffStatus: "edited",
      });
    } else {
      const previewEdge = previewEdgesMap.get(key) ?? edge;
      unionEdges.push({
        ...previewEdge,
        diffStatus: "unchanged",
      });
    }
  }

  // 2. Add newly added edges from preview_spec
  for (const previewEdge of preview.edges) {
    const key = edgeKey(previewEdge.from, previewEdge.to);
    if (addedEdgeKeys.has(key) || !unionEdges.some((e) => edgeKey(e.from, e.to) === key)) {
      if (!unionEdges.some((e) => edgeKey(e.from, e.to) === key)) {
        unionEdges.push({
          ...previewEdge,
          diffStatus: "added",
        });
      }
    }
  }

  // Entry / exit IDs: follow preview_spec for kept nodes
  const entry_ids = [...preview.entry_ids];
  const exit_ids = [...preview.exit_ids];

  // Constraints follow preview_spec
  const constraints = preview.constraints.map((c) => ({
    ...c,
    covers: [...c.covers],
  }));

  return {
    nodes: unionNodes,
    edges: unionEdges,
    constraints,
    entry_ids,
    exit_ids,
  };
}

