"""Deterministic topological ordering for ArchitectureSpec nodes."""

import heapq
from collections import defaultdict

import networkx as nx

from archnemesis.modules.validation.graph import build_graph
from archnemesis.modules.validation.models import ArchitectureSpec

OTHER_PARTS_LAYER: str = "Other parts"


def _resolve_layer_display_names(spec: ArchitectureSpec) -> dict[str, str]:
    """Map each normalized layer key (case-folded and trimmed) to a canonical display name.

    If the normalized key matches 'other parts', the display name is OTHER_PARTS_LAYER.
    Otherwise, the display name is the minimum lexicographical variant seen among nodes.
    """
    key_to_variants: dict[str, set[str]] = defaultdict(set)
    for node in spec.nodes:
        if node.layer is not None and node.layer.strip():
            cleaned = " ".join(node.layer.split()).strip()
            if cleaned:
                key_to_variants[cleaned.casefold()].add(cleaned)

    display_names: dict[str, str] = {}
    for key, variants in key_to_variants.items():
        if key == OTHER_PARTS_LAYER.casefold():
            display_names[key] = OTHER_PARTS_LAYER
        else:
            display_names[key] = min(variants)
    return display_names


def order_layers(spec: ArchitectureSpec) -> list[str]:
    """Compute deterministic left-to-right layer ordering for an ArchitectureSpec.

    Layers are ordered by the smallest longest-path rank of their nodes in the DAG,
    with ties broken by layer name (case-insensitive, then exact).
    Nodes with no layer are assigned to OTHER_PARTS_LAYER ('Other parts').

    Raises:
        ValueError: If the architecture graph contains a cycle.
    """
    if not spec.nodes:
        return []

    graph = build_graph(spec)
    if not nx.is_directed_acyclic_graph(graph):
        raise ValueError("Cannot order layers: architecture specification contains cycles.")

    # Compute longest-path rank for each node in topological order
    ranks: dict[str, int] = {}
    for node_id in nx.topological_sort(graph):
        preds = list(graph.predecessors(node_id))
        ranks[node_id] = max((ranks[p] + 1 for p in preds), default=0)

    layer_display_names = _resolve_layer_display_names(spec)

    # Map each node to its canonical display layer
    node_to_layer: dict[str, str] = {}
    layers_seen: set[str] = set()
    for node in spec.nodes:
        if node.layer is not None and node.layer.strip():
            cleaned = " ".join(node.layer.split()).strip()
            layer_name = layer_display_names[cleaned.casefold()]
        else:
            layer_name = OTHER_PARTS_LAYER
        node_to_layer[node.id] = layer_name
        layers_seen.add(layer_name)

    # Compute min rank for each layer
    layer_min_ranks: dict[str, int] = {}
    for layer in layers_seen:
        layer_nodes = [node_id for node_id, l_name in node_to_layer.items() if l_name == layer]
        layer_min_ranks[layer] = min(ranks[n_id] for n_id in layer_nodes)

    # Sort layers by (min_rank, layer_name.casefold(), layer_name)
    sorted_layers = sorted(
        layers_seen,
        key=lambda l_name: (layer_min_ranks[l_name], l_name.casefold(), l_name),
    )
    return sorted_layers


def order_nodes(spec: ArchitectureSpec) -> list[str]:
    """Compute a deterministic topological ordering using Kahn's algorithm with min-heap tie-breaking.

    Raises:
        ValueError: If the architecture graph contains a cycle.
    """
    node_ids = sorted([node.id for node in spec.nodes])
    in_degrees: dict[str, int] = {node_id: 0 for node_id in node_ids}
    adj_list: dict[str, list[str]] = defaultdict(list)

    for edge in spec.edges:
        if edge.from_node in in_degrees and edge.to in in_degrees:
            adj_list[edge.from_node].append(edge.to)
            in_degrees[edge.to] += 1

    # Min-heap ensures lexicographical tie-breaking
    heap: list[str] = [node_id for node_id in node_ids if in_degrees[node_id] == 0]
    heapq.heapify(heap)

    ordered: list[str] = []
    while heap:
        curr = heapq.heappop(heap)
        ordered.append(curr)

        for neighbor in sorted(adj_list[curr]):
            in_degrees[neighbor] -= 1
            if in_degrees[neighbor] == 0:
                heapq.heappush(heap, neighbor)

    if len(ordered) != len(node_ids):
        raise ValueError("Cannot order nodes: architecture specification contains cycles.")

    return ordered
