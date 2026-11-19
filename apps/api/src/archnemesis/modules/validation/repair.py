"""Pure deterministic graph repair module for ArchitectureSpec constraints.

Patches violated must_pass_through and must_precede constraints by rerouting
bypass paths through required bottleneck nodes using fixed, domain-neutral edge flows.
Strictly preserves DAG invariants, edge limits, and handles exit sinks.
"""

from __future__ import annotations

from typing import Any

import networkx as nx

from archnemesis.modules.validation.graph import build_graph
from archnemesis.modules.validation.models import (
    ArchitectureSpec,
    ConstraintSpec,
    EdgeSpec,
    Limits,
    ValidationIssue,
)

FIXED_FLOW_TEXT: str = "Checked flow"


def _make_edge(from_node: str, to: str, flows: str = FIXED_FLOW_TEXT) -> EdgeSpec:
    """Helper to instantiate EdgeSpec safely with alias handling."""
    return EdgeSpec.model_validate({"from": from_node, "to": to, "flows": flows})


def _non_coverage_errors(errors: list[ValidationIssue]) -> list[ValidationIssue]:
    """Filter out E_BRIEF_CONSTRAINT_UNCOVERED, returning all other validation errors."""
    return [err for err in errors if err.code != "E_BRIEF_CONSTRAINT_UNCOVERED"]


def patch_dead_ends(
    spec: ArchitectureSpec,
    brief_constraints: dict[str, str],
    limits: Limits,
) -> tuple[ArchitectureSpec, list[ValidationIssue]]:
    """Attempt deterministic repair of dead-end nodes missing from exit_ids.

    For ANY node with in_degree > 0 and out_degree == 0 missing from exit_ids:
    1. Add the dead-end node to exit_ids (deterministic sorted order).
    2. If that introduces a must_pass_through or must_precede violation,
       try rerouting incoming bypass edges through the required node using patch_constraints.
    3. Accept only if validate(patched) is ok (or only E_BRIEF_CONSTRAINT_UNCOVERED remains)
       and limits hold; otherwise return the original spec unchanged.
    4. Emit W_CODE_REPAIR_APPLIED with exact change details.
    """
    from archnemesis.modules.validation.validate import validate

    graph = build_graph(spec)
    if not nx.is_directed_acyclic_graph(graph):
        return spec, []

    # Find nodes with in_degree > 0 and out_degree == 0 not in exit_ids (deterministic sorted order)
    dead_ends = sorted(
        [
            node_id
            for node_id in graph.nodes
            if graph.in_degree(node_id) > 0
            and graph.out_degree(node_id) == 0
            and node_id not in spec.exit_ids
        ]
    )
    if not dead_ends:
        return spec, []

    new_exit_ids = sorted(set(spec.exit_ids).union(dead_ends))
    current_edges = list(spec.edges)
    candidate_spec = spec.model_copy(update={"exit_ids": new_exit_ids, "edges": current_edges})

    # Case 1: Simple addition to exit_ids resolves validation (or leaves only brief constraint coverage)
    val_result = validate(candidate_spec, brief_constraints, limits)
    if (
        not _non_coverage_errors(val_result.errors)
        and len(candidate_spec.edges) <= limits.max_edges
    ):
        node_str = ", ".join(f"'{n}'" for n in dead_ends)
        warning = ValidationIssue(
            code="W_CODE_REPAIR_APPLIED",
            severity="warning",
            message=f"Added dead-end sink node(s) {node_str} to exit_ids.",
            ids=dead_ends,
        )
        return candidate_spec, [warning]

    # Case 2: Adding to exit_ids created constraint violations; attempt rerouting bypasses
    patched_spec, constraint_warnings = patch_constraints(candidate_spec, brief_constraints, limits)
    if constraint_warnings:
        final_val = validate(patched_spec, brief_constraints, limits)
        if (
            not _non_coverage_errors(final_val.errors)
            and len(patched_spec.edges) <= limits.max_edges
        ):
            node_str = ", ".join(f"'{n}'" for n in dead_ends)
            repaired_targets = [w.ids[1] for w in constraint_warnings if len(w.ids) > 1]
            target_str = ", ".join(f"'{t}'" for t in sorted(set(repaired_targets)))
            warning = ValidationIssue(
                code="W_CODE_REPAIR_APPLIED",
                severity="warning",
                message=(
                    f"Added dead-end sink node(s) {node_str} to exit_ids and routed "
                    f"bypass edge(s) through {target_str}."
                ),
                ids=dead_ends + [id_ for w in constraint_warnings for id_ in w.ids],
            )
            return patched_spec, [warning]

    # If any error remains or limits violated, return original spec unchanged
    return spec, []


def sanitize_covers(
    spec: ArchitectureSpec,
    brief_constraints: dict[str, str],
) -> tuple[ArchitectureSpec, list[ValidationIssue]]:
    """Sanitize ConstraintSpec.covers by dropping entries not in brief_constraints.

    For any constraint listing covers entries not present in brief_constraints:
    1. Filter out the invalid entries.
    2. Emit W_CODE_REPAIR_APPLIED detailing the removed entries.
    3. Return the sanitized spec with updated constraints.

    Pure validation remains untouched. If a real brief constraint is left uncovered,
    E_BRIEF_CONSTRAINT_UNCOVERED will still fire deterministically in check_coverage.
    """
    warnings: list[ValidationIssue] = []
    sanitized_constraints: list[ConstraintSpec] = []
    modified = False

    for constraint in spec.constraints:
        valid_covers = [cid for cid in constraint.covers if cid in brief_constraints]
        dropped = [cid for cid in constraint.covers if cid not in brief_constraints]
        if dropped:
            modified = True
            dropped_str = ", ".join(f"'{cid}'" for cid in dropped)
            warnings.append(
                ValidationIssue(
                    code="W_CODE_REPAIR_APPLIED",
                    severity="warning",
                    message=(
                        f"Sanitized constraint '{constraint.id}': "
                        f"removed invalid covers identifier(s) {dropped_str} not in brief."
                    ),
                    ids=[constraint.id],
                )
            )
            sanitized_constraints.append(constraint.model_copy(update={"covers": valid_covers}))
        else:
            sanitized_constraints.append(constraint)

    if not modified:
        return spec, []

    sanitized_spec = spec.model_copy(update={"constraints": sanitized_constraints})
    return sanitized_spec, warnings


def patch_constraints(
    spec: ArchitectureSpec,
    brief_constraints: dict[str, str],
    limits: Limits,
) -> tuple[ArchitectureSpec, list[ValidationIssue]]:
    """Attempt deterministic repair of must_pass_through and must_precede constraints.

    Returns:
        (patched_spec, warnings) where warnings contains W_CODE_REPAIR_APPLIED issues.
        If no repairs can be safely applied, returns (original_spec, []).
    """
    node_ids = {n.id for n in spec.nodes}
    entries = set(spec.entry_ids)
    exits = set(spec.exit_ids)

    current_edges = list(spec.edges)
    graph = build_graph(spec)

    # If the graph has cycles or invalid basic structure initially, abort pure patch
    if not nx.is_directed_acyclic_graph(graph):
        return spec, []

    warnings: list[ValidationIssue] = []

    # 1. Sanitize covers first
    sanitized_spec, covers_warnings = sanitize_covers(spec, brief_constraints)
    warnings.extend(covers_warnings)
    current_constraints = list(sanitized_spec.constraints)

    for constraint in current_constraints:
        kind = constraint.kind
        if kind not in ("must_pass_through", "must_precede"):
            continue

        if kind == "must_pass_through":
            repaired_edges, count = _patch_must_pass_through(
                constraint=constraint,
                current_edges=current_edges,
                spec=spec,
                node_ids=node_ids,
                entries=entries,
                exits=exits,
                limits=limits,
            )
            if count > 0:
                current_edges = repaired_edges
                target = constraint.node_id or ""
                warnings.append(
                    ValidationIssue(
                        code="W_CODE_REPAIR_APPLIED",
                        severity="warning",
                        message=(
                            f"Constraint '{constraint.id}' satisfied by automated graph alignment: "
                            f"routed {count} edge(s) through '{target}'."
                        ),
                        ids=[constraint.id, target],
                    )
                )

        elif kind == "must_precede":
            repaired_edges, count = _patch_must_precede(
                constraint=constraint,
                current_edges=current_edges,
                spec=spec,
                node_ids=node_ids,
                entries=entries,
                exits=exits,
                limits=limits,
            )
            if count > 0:
                current_edges = repaired_edges
                a_id = constraint.a or ""
                b_id = constraint.b or ""
                warnings.append(
                    ValidationIssue(
                        code="W_CODE_REPAIR_APPLIED",
                        severity="warning",
                        message=(
                            f"Constraint '{constraint.id}' satisfied by automated graph alignment: "
                            f"routed {count} edge(s) through '{a_id}'."
                        ),
                        ids=[constraint.id, a_id, b_id],
                    )
                )

    if not warnings:
        return spec, []

    patched_spec = spec.model_copy(
        update={"edges": current_edges, "constraints": current_constraints}
    )
    return patched_spec, warnings


def _is_sink_exit(node_id: str, graph: nx.DiGraph[Any], spec: ArchitectureSpec) -> bool:
    """Identify if an exit node is an auxiliary structural sink (out-degree 0, in exit_ids).

    A sink is NOT rerouted through T if:
    - It is not the only exit.
    - It is not mentioned in any flow-altering bottleneck constraint (must_pass_through, must_precede, must_not_connect).
      Nodes mentioned only in must_exist constraints remain eligible as auxiliary sinks.
    """
    if node_id not in spec.exit_ids:
        return False
    if len(spec.exit_ids) <= 1:
        return False
    if graph.out_degree(node_id) > 0:
        return False

    # Check if mentioned in any bottleneck or ordering constraint
    for c in spec.constraints:
        if c.kind in ("must_pass_through", "must_precede", "must_not_connect") and (
            c.node_id == node_id or c.a == node_id or c.b == node_id
        ):
            return False

    return True


def _patch_must_pass_through(
    constraint: ConstraintSpec,
    current_edges: list[EdgeSpec],
    spec: ArchitectureSpec,
    node_ids: set[str],
    entries: set[str],
    exits: set[str],
    limits: Limits,
) -> tuple[list[EdgeSpec], int]:
    target = constraint.node_id
    if not target or target not in node_ids:
        return current_edges, 0
    if target in entries or target in exits:
        return current_edges, 0

    edges_pool = list(current_edges)
    total_routed = 0

    # Iteratively detect and reroute bypass paths
    max_passes = 10
    for _ in range(max_passes):
        test_graph: nx.DiGraph[Any] = nx.DiGraph()
        test_graph.add_nodes_from(node_ids)
        for e in edges_pool:
            test_graph.add_edge(e.from_node, e.to)

        if not nx.is_directed_acyclic_graph(test_graph):
            break

        g_sub = test_graph.copy()
        g_sub.remove_node(target)

        remaining_entries = sorted(entries - {target})
        remaining_exits = sorted(exits - {target})

        bypass_path: list[str] | None = None
        for entry in remaining_entries:
            for exit_node in remaining_exits:
                if nx.has_path(g_sub, entry, exit_node):
                    shortest = nx.shortest_path(g_sub, entry, exit_node)
                    if bypass_path is None or len(shortest) < len(bypass_path):
                        bypass_path = shortest

        if bypass_path is None:
            # All bypass paths eliminated
            break

        applied_step = False
        exit_node = bypass_path[-1]

        if _is_sink_exit(exit_node, test_graph, spec):
            # EXIT-SINK RULE:
            # Do NOT reroute incoming edge to sink through T.
            # Instead:
            # 1. Add (target, sink) if missing (so sink is fed after target).
            # 2. Remove bypassing incoming edge (u, sink) only if sink stays reachable and graph stays acyclic.
            u = bypass_path[-2]
            candidate_edges = [
                e for e in edges_pool if not (e.from_node == u and e.to == exit_node)
            ]
            if not any(e.from_node == target and e.to == exit_node for e in candidate_edges):
                candidate_edges.append(_make_edge(target, exit_node))

            # Check validity of candidate
            c_graph: nx.DiGraph[Any] = nx.DiGraph()
            c_graph.add_nodes_from(node_ids)
            for e in candidate_edges:
                c_graph.add_edge(e.from_node, e.to)

            if (
                nx.is_directed_acyclic_graph(c_graph)
                and len(candidate_edges) <= limits.max_edges
                and any(nx.has_path(c_graph, ent, exit_node) for ent in entries)
            ):
                edges_pool = candidate_edges
                total_routed += 1
                applied_step = True
            else:
                # If unsafe, abort sink patching
                break
        else:
            # Normal bypass path: find edge (u, v) entering exit or last step before exit
            u = bypass_path[-2]
            v = bypass_path[-1]

            # Replace (u, v) with (u, target) and add (target, v) if missing
            candidate_edges = [e for e in edges_pool if not (e.from_node == u and e.to == v)]
            if not any(e.from_node == u and e.to == target for e in candidate_edges):
                candidate_edges.append(_make_edge(u, target))
            if not any(e.from_node == target and e.to == v for e in candidate_edges):
                candidate_edges.append(_make_edge(target, v))

            # Check DAG and limit validity
            c_graph = nx.DiGraph()
            c_graph.add_nodes_from(node_ids)
            for e in candidate_edges:
                c_graph.add_edge(e.from_node, e.to)

            if nx.is_directed_acyclic_graph(c_graph) and len(candidate_edges) <= limits.max_edges:
                edges_pool = candidate_edges
                total_routed += 1
                applied_step = True
            else:
                # Cycle or limit violated; cannot safely patch this bypass
                break

        if not applied_step:
            break

    return edges_pool, total_routed


def _patch_must_precede(
    constraint: ConstraintSpec,
    current_edges: list[EdgeSpec],
    spec: ArchitectureSpec,
    node_ids: set[str],
    entries: set[str],
    exits: set[str],
    limits: Limits,
) -> tuple[list[EdgeSpec], int]:
    a = constraint.a
    b = constraint.b
    if not a or not b or a not in node_ids or b not in node_ids or b in entries:
        return current_edges, 0

    edges_pool = list(current_edges)
    total_routed = 0

    max_passes = 10
    for _ in range(max_passes):
        test_graph: nx.DiGraph[Any] = nx.DiGraph()
        test_graph.add_nodes_from(node_ids)
        for e in edges_pool:
            test_graph.add_edge(e.from_node, e.to)

        if not nx.is_directed_acyclic_graph(test_graph):
            break

        g_sub = test_graph.copy()
        g_sub.remove_node(a)

        remaining_entries = sorted(entries - {a})
        bypass_path: list[str] | None = None
        for entry in remaining_entries:
            if nx.has_path(g_sub, entry, b):
                shortest = nx.shortest_path(g_sub, entry, b)
                if bypass_path is None or len(shortest) < len(bypass_path):
                    bypass_path = shortest

        if bypass_path is None:
            break

        # Edge entering b on the bypass path
        u = bypass_path[-2]
        if u == a:
            break

        candidate_edges = [e for e in edges_pool if not (e.from_node == u and e.to == b)]
        if not any(e.from_node == u and e.to == a for e in candidate_edges):
            candidate_edges.append(_make_edge(u, a))
        if not any(e.from_node == a and e.to == b for e in candidate_edges):
            candidate_edges.append(_make_edge(a, b))

        c_graph: nx.DiGraph[Any] = nx.DiGraph()
        c_graph.add_nodes_from(node_ids)
        for e in candidate_edges:
            c_graph.add_edge(e.from_node, e.to)

        if nx.is_directed_acyclic_graph(c_graph) and len(candidate_edges) <= limits.max_edges:
            edges_pool = candidate_edges
            total_routed += 1
        else:
            break

    return edges_pool, total_routed
