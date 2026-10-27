"""Deterministic topological ordering for ArchitectureSpec nodes."""

import heapq
from collections import defaultdict

from archnemesis.modules.validation.models import ArchitectureSpec


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
