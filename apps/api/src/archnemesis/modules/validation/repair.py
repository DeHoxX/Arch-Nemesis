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

FIXED_FLOW_TEXT: str = "Forward payload for verification"


def _make_edge(from_node: str, to: str, flows: str = FIXED_FLOW_TEXT) -> EdgeSpec:
    """Helper to instantiate EdgeSpec safely with alias handling."""
    return EdgeSpec.model_validate({"from": from_node, "to": to, "flows": flows})


def patch_cycles(
    spec: ArchitectureSpec,
    brief_constraints: dict[str, str],
    limits: Limits,
) -> tuple[ArchitectureSpec, list[ValidationIssue]]:
    """Attempt deterministic repair of cycles in the specification graph.

    Iteratively detects directed simple cycles and removes backward feedback edges
    using structural depth scoring, without inspecting node type, name, or role text.
    Accepts the result only if the patched graph is an acyclic DAG that passes full
    validation and satisfies all limits; otherwise returns the original spec unchanged.
    """
    from archnemesis.modules.validation.validate import validate

    graph = build_graph(spec)
    if nx.is_directed_acyclic_graph(graph):
        return spec, []

    current_edges = list(spec.edges)
    warnings: list[ValidationIssue] = []

    # Bounded by initial edge count to guarantee termination without magic constants
    max_cuts = len(spec.edges)
    cuts_count = 0

    while not nx.is_directed_acyclic_graph(graph) and cuts_count < max_cuts:
        try:
            cycles = list(nx.simple_cycles(graph))
        except nx.NetworkXNoCycle:
            break

        if not cycles:
            break

        # Deterministically select shortest cycle, breaking ties by sorted node sequence
        cycle = min(cycles, key=lambda c: (len(c), c))
        cycle_len = len(cycle)
        cycle_edges = [(cycle[i], cycle[(i + 1) % cycle_len]) for i in range(cycle_len)]

        # Determine node reachability before the candidate cut
        valid_entries = set(spec.entry_ids).intersection(graph.nodes)
        valid_exits = set(spec.exit_ids).intersection(graph.nodes)

        entry_reachable_before: set[str] = set()
        for entry in valid_entries:
            entry_reachable_before.add(entry)
            entry_reachable_before.update(nx.descendants(graph, entry))

        exit_reachable_before: set[str] = set()
        for exit_node in valid_exits:
            exit_reachable_before.add(exit_node)
            exit_reachable_before.update(nx.ancestors(graph, exit_node))

        connected_before = {n for n in graph.nodes if graph.degree(n) > 0}

        # Filter candidate edges by structural reachability preservation
        safe_candidates: list[tuple[str, str]] = []
        for u, v in cycle_edges:
            if not graph.has_edge(u, v):
                continue

            g_test = graph.copy()
            g_test.remove_edge(u, v)

            # Invariant: every node reachable from an entry before must still be entry-reachable
            entry_reachable_after: set[str] = set()
            for entry in valid_entries:
                entry_reachable_after.add(entry)
                entry_reachable_after.update(nx.descendants(g_test, entry))

            if not entry_reachable_before.issubset(entry_reachable_after):
                continue

            # Invariant: every node that reached an exit before must still reach an exit
            exit_reachable_after: set[str] = set()
            for exit_node in valid_exits:
                exit_reachable_after.add(exit_node)
                exit_reachable_after.update(nx.ancestors(g_test, exit_node))

            if not exit_reachable_before.issubset(exit_reachable_after):
                continue

            # Invariant: no orphan created (every node connected before must still have degree > 0)
            if any(g_test.degree(n) == 0 for n in connected_before):
                continue

            safe_candidates.append((u, v))

        if not safe_candidates:
            # No candidate edge can be safely cut without violating reachability
            return spec, []

        # Structural ranking: backward depth score
        # Compute min shortest path distance from entries
        depths: dict[str, int] = {}
        for entry in valid_entries:
            for target, dist in nx.single_source_shortest_path_length(graph, entry).items():
                if target not in depths or dist < depths[target]:
                    depths[target] = dist

        scored_candidates: list[tuple[int, str, str]] = []
        for u, v in safe_candidates:
            if u in depths and v in depths:
                score = depths[u] - depths[v]
            else:
                score = 0
            scored_candidates.append((score, u, v))

        # Tie-break: sort by (-score, u, v)
        scored_candidates.sort(key=lambda item: (-item[0], item[1], item[2]))
        _, best_u, best_v = scored_candidates[0]

        # Apply cut to graph
        graph.remove_edge(best_u, best_v)

        # Remove from current_edges
        current_edges = [e for e in current_edges if not (e.from_node == best_u and e.to == best_v)]

        cuts_count += 1
        warnings.append(
            ValidationIssue(
                code="W_CODE_REPAIR_APPLIED",
                severity="warning",
                message=(
                    f"Cycle resolved by automated graph repair: "
                    f"removed feedback edge '{best_u}' -> '{best_v}' to establish a valid acyclic architecture."
                ),
                ids=[best_u, best_v],
            )
        )

    # If graph is still not a DAG or no cuts were applied, abort
    if not nx.is_directed_acyclic_graph(graph) or not warnings:
        return spec, []

    patched_spec = spec.model_copy(update={"edges": current_edges})

    val_orig = validate(spec, brief_constraints, limits)
    val_patched = validate(patched_spec, brief_constraints, limits)

    # Collect errors from original spec (ignoring E_CYCLE since that's what was repaired)
    orig_error_keys = {
        (err.code, tuple(err.ids)) for err in val_orig.errors if err.code != "E_CYCLE"
    }

    # If constraints were skipped in val_orig due to graph structure errors,
    # evaluate constraints on the original spec to know which constraint errors already existed
    if any("constraints" in s for s in val_orig.skipped):
        from archnemesis.modules.validation.constraints import check_constraints

        for err in check_constraints(spec, build_graph(spec), brief_constraints):
            orig_error_keys.add((err.code, tuple(err.ids)))

    # Identify any new error introduced by the patch
    new_errors = [
        err
        for err in val_patched.errors
        if err.code != "E_CYCLE" and (err.code, tuple(err.ids)) not in orig_error_keys
    ]

    # Acceptance gate:
    # 1. Patched graph is a DAG
    # 2. No new errors introduced vs original
    # 3. Limits still hold
    # 4. Constraints, kinds, nodes remain untouched
    if (
        nx.is_directed_acyclic_graph(build_graph(patched_spec))
        and not new_errors
        and len(patched_spec.edges) <= limits.max_edges
        and len(patched_spec.nodes) <= limits.max_nodes
    ):
        return patched_spec, warnings

    return spec, []


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
    3. Accept only if validate(patched) is ok and limits hold;
       otherwise return the original spec unchanged.
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

    # Case 1: Simple addition to exit_ids resolves validation
    val_result = validate(candidate_spec, brief_constraints, limits)
    if val_result.ok and len(candidate_spec.edges) <= limits.max_edges:
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
        if final_val.ok and len(patched_spec.edges) <= limits.max_edges:
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
