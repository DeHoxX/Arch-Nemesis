"""NetworkX directed graph builder with deterministic node and edge insertion."""

from __future__ import annotations

from typing import Any

import networkx as nx

from archnemesis.modules.validation.models import ArchitectureSpec


def build_graph(spec: ArchitectureSpec) -> nx.DiGraph[Any]:
    """Build a networkx DiGraph with nodes and edges sorted deterministically by ID."""
    graph: nx.DiGraph[Any] = nx.DiGraph()

    # Sort nodes by id for deterministic iteration and traversal orders
    sorted_nodes = sorted(spec.nodes, key=lambda n: n.id)
    for node in sorted_nodes:
        graph.add_node(
            node.id,
            name=node.name,
            type=node.type,
            role=node.role,
            needs_model=node.needs_model,
        )

    # Sort edges deterministically by (from_node, to, flows)
    sorted_edges = sorted(spec.edges, key=lambda e: (e.from_node, e.to, e.flows))
    for edge in sorted_edges:
        graph.add_edge(edge.from_node, edge.to, flows=edge.flows)

    return graph
