"""Structural and reference validation checks for ArchitectureSpec."""

from __future__ import annotations

from collections import Counter
from typing import Any

import networkx as nx

from archnemesis.modules.validation.models import ArchitectureSpec, Limits, ValidationIssue


def check_duplicate_ids(spec: ArchitectureSpec) -> list[ValidationIssue]:
    """Check for duplicate node IDs across all declared nodes."""
    issues: list[ValidationIssue] = []
    id_counts = Counter(node.id for node in spec.nodes)
    for node_id, count in sorted(id_counts.items()):
        if count > 1:
            issues.append(
                ValidationIssue(
                    code="E_DUP_ID",
                    severity="error",
                    message=f"Two or more nodes share the id '{node_id}'.",
                    ids=[node_id],
                )
            )
    return issues


def check_references(spec: ArchitectureSpec) -> list[ValidationIssue]:
    """Check for edges, entries, or exits referencing non-existent nodes."""
    issues: list[ValidationIssue] = []
    node_ids = {node.id for node in spec.nodes}

    # Edges bad references
    for edge in spec.edges:
        if edge.from_node not in node_ids:
            issues.append(
                ValidationIssue(
                    code="E_BAD_REF",
                    severity="error",
                    message=f"'{edge.to}' refers to '{edge.from_node}', which is not a node.",
                    ids=[edge.from_node],
                )
            )
        if edge.to not in node_ids:
            issues.append(
                ValidationIssue(
                    code="E_BAD_REF",
                    severity="error",
                    message=f"'{edge.from_node}' refers to '{edge.to}', which is not a node.",
                    ids=[edge.to],
                )
            )

    # Entry IDs bad references
    for entry_id in spec.entry_ids:
        if entry_id not in node_ids:
            issues.append(
                ValidationIssue(
                    code="E_BAD_REF",
                    severity="error",
                    message=f"'entry_ids' refers to '{entry_id}', which is not a node.",
                    ids=[entry_id],
                )
            )

    # Exit IDs bad references
    for exit_id in spec.exit_ids:
        if exit_id not in node_ids:
            issues.append(
                ValidationIssue(
                    code="E_BAD_REF",
                    severity="error",
                    message=f"'exit_ids' refers to '{exit_id}', which is not a node.",
                    ids=[exit_id],
                )
            )

    return issues


def check_entries_exits(spec: ArchitectureSpec) -> list[ValidationIssue]:
    """Check that the architecture declares at least one entry and one exit node."""
    issues: list[ValidationIssue] = []
    if not spec.entry_ids:
        issues.append(
            ValidationIssue(
                code="E_NO_ENTRY",
                severity="error",
                message="The design has no entry node.",
                ids=[],
            )
        )
    if not spec.exit_ids:
        issues.append(
            ValidationIssue(
                code="E_NO_EXIT",
                severity="error",
                message="The design has no exit node.",
                ids=[],
            )
        )
    return issues


def check_limits(spec: ArchitectureSpec, limits: Limits) -> list[ValidationIssue]:
    """Check node and edge count limits."""
    issues: list[ValidationIssue] = []
    if len(spec.nodes) > limits.max_nodes:
        issues.append(
            ValidationIssue(
                code="E_NODE_LIMIT",
                severity="error",
                message=f"The design has {len(spec.nodes)} nodes; the maximum is {limits.max_nodes}.",
                ids=[n.id for n in spec.nodes],
            )
        )
    if len(spec.edges) > limits.max_edges:
        issues.append(
            ValidationIssue(
                code="E_EDGE_LIMIT",
                severity="error",
                message=f"The design has {len(spec.edges)} edges; the maximum is {limits.max_edges}.",
                ids=[],
            )
        )
    return issues


def check_graph_structure(spec: ArchitectureSpec, graph: nx.DiGraph[Any]) -> list[ValidationIssue]:
    """Check self-loops, duplicate edges, cycles, orphans, and reachability."""
    issues: list[ValidationIssue] = []

    # 1. Self loops
    seen_self_loops = set()
    for edge in spec.edges:
        if edge.from_node == edge.to and edge.from_node not in seen_self_loops:
            seen_self_loops.add(edge.from_node)
            issues.append(
                ValidationIssue(
                    code="E_SELF_LOOP",
                    severity="error",
                    message=f"Node '{edge.from_node}' has an edge to itself.",
                    ids=[edge.from_node],
                )
            )

    # 2. Duplicate edges
    edge_pairs = Counter((edge.from_node, edge.to) for edge in spec.edges)
    for (u, v), count in sorted(edge_pairs.items()):
        if count > 1 and u != v:  # u == v already reported as self-loop
            issues.append(
                ValidationIssue(
                    code="E_DUP_EDGE",
                    severity="error",
                    message=f"There is more than one edge from '{u}' to '{v}'.",
                    ids=[u, v],
                )
            )

    # 3. Cycles
    # Graph contains simple cycles if not a DAG
    try:
        cycles = list(nx.simple_cycles(graph))
        if cycles:
            # Deterministically choose the cycle with smallest lexicographical node ids
            sorted_cycles = sorted(cycles, key=lambda c: (len(c), c))
            cycle = sorted_cycles[0]
            cycle_str = " > ".join(cycle + [cycle[0]])
            issues.append(
                ValidationIssue(
                    code="E_CYCLE",
                    severity="error",
                    message=(
                        f"The flow loops back on itself through: {cycle_str}. "
                        "Version 1 designs must not contain loops."
                    ),
                    ids=sorted(set(cycle)),
                )
            )
    except nx.NetworkXNoCycle:
        pass

    # 4. Orphans
    # An orphan is a node with degree 0 (no in-edges and no out-edges)
    orphan_ids = set()
    for node_id in sorted(graph.nodes):
        if graph.in_degree(node_id) == 0 and graph.out_degree(node_id) == 0:
            orphan_ids.add(node_id)
            issues.append(
                ValidationIssue(
                    code="E_ORPHAN",
                    severity="error",
                    message=f"Node '{node_id}' is not connected to anything.",
                    ids=[node_id],
                )
            )

    # 5. Reachability (Orphans are excluded from unreachable errors)
    valid_entries = set(spec.entry_ids).intersection(graph.nodes)
    valid_exits = set(spec.exit_ids).intersection(graph.nodes)

    # Nodes reachable from at least one entry
    reachable_from_any_entry: set[str] = set()
    for entry in valid_entries:
        reachable_from_any_entry.update(nx.descendants(graph, entry))
        reachable_from_any_entry.add(entry)

    # Nodes that can reach at least one exit (i.e. ancestors of exits in DiGraph)
    can_reach_any_exit: set[str] = set()
    for exit_node in valid_exits:
        can_reach_any_exit.update(nx.ancestors(graph, exit_node))
        can_reach_any_exit.add(exit_node)

    for node_id in sorted(graph.nodes):
        if node_id in orphan_ids:
            continue
        if node_id not in reachable_from_any_entry:
            issues.append(
                ValidationIssue(
                    code="E_UNREACHABLE_FROM_ENTRY",
                    severity="error",
                    message=f"Node '{node_id}' cannot be reached from any entry node.",
                    ids=[node_id],
                )
            )
        if node_id not in can_reach_any_exit:
            issues.append(
                ValidationIssue(
                    code="E_CANNOT_REACH_EXIT",
                    severity="error",
                    message=f"Node '{node_id}' has no path to any exit node.",
                    ids=[node_id],
                )
            )

    return issues
