"""Constraint validation rules for ArchitectureSpec."""

from __future__ import annotations

from typing import Any

import networkx as nx

from archnemesis.modules.validation.models import ArchitectureSpec, ConstraintSpec, ValidationIssue

VALID_CONSTRAINT_KINDS = frozenset(
    {"must_exist", "must_pass_through", "must_not_connect", "must_precede"}
)


def check_constraints(
    spec: ArchitectureSpec, graph: nx.DiGraph[Any], brief_constraints: dict[str, str]
) -> list[ValidationIssue]:
    """Validate all constraint rules against the graph structure."""
    issues: list[ValidationIssue] = []
    node_ids = {node.id for node in spec.nodes}
    entries = set(spec.entry_ids)
    exits = set(spec.exit_ids)

    for constraint in spec.constraints:
        c_id = constraint.id
        kind = constraint.kind
        text = constraint.text

        # 1. Unknown kind check
        if kind not in VALID_CONSTRAINT_KINDS:
            issues.append(
                ValidationIssue(
                    code="E_UNKNOWN_CONSTRAINT_KIND",
                    severity="error",
                    message=(
                        f"Rule '{c_id}' uses the unknown kind '{kind}'. "
                        "Allowed kinds: must_exist, must_pass_through, must_not_connect, must_precede."
                    ),
                    ids=[c_id],
                )
            )
            continue

        # 2. Parameter validations
        param_issue = _validate_params(constraint, node_ids)
        if param_issue is not None:
            issues.append(param_issue)
            continue

        # 3. Constraint semantic evaluations
        if kind == "must_exist":
            # Node existence already verified in _validate_params
            continue

        elif kind == "must_pass_through":
            assert constraint.node_id is not None
            target = constraint.node_id

            # If target node is removed from graph
            g_sub = graph.copy()
            g_sub.remove_node(target)

            remaining_entries = sorted(entries - {target})
            remaining_exits = sorted(exits - {target})

            # If target was an entry or exit, any remaining entry-to-exit path is a bypass
            # Check if any path exists from any remaining entry to any remaining exit
            bypass_path: list[str] | None = None
            for entry in remaining_entries:
                for exit_node in remaining_exits:
                    if nx.has_path(g_sub, entry, exit_node):
                        shortest = nx.shortest_path(g_sub, entry, exit_node)
                        if bypass_path is None or len(shortest) < len(bypass_path):
                            bypass_path = shortest

            if bypass_path is not None:
                witness = f"a path that avoids '{target}': {' > '.join(bypass_path)}"
                issues.append(
                    ValidationIssue(
                        code="E_CONSTRAINT_VIOLATED",
                        severity="error",
                        message=f"Rule not satisfied: {text} ({witness}).",
                        ids=[c_id, target],
                    )
                )

        elif kind == "must_not_connect":
            assert constraint.a is not None and constraint.b is not None
            a, b = constraint.a, constraint.b

            if nx.has_path(graph, a, b):
                path = nx.shortest_path(graph, a, b)
                witness = f"path found from '{a}' to '{b}': {' > '.join(path)}"
                issues.append(
                    ValidationIssue(
                        code="E_CONSTRAINT_VIOLATED",
                        severity="error",
                        message=f"Rule not satisfied: {text} ({witness}).",
                        ids=[c_id, a, b],
                    )
                )

        elif kind == "must_precede":
            assert constraint.a is not None and constraint.b is not None
            a, b = constraint.a, constraint.b

            # Plan rule: with a removed, b is unreachable from every entry (or is an entry).
            # Violated if, with a removed, b is reachable from any entry OR b is itself an entry.
            if b in entries:
                witness = f"'{b}' is an entry node and cannot be preceded by '{a}'"
                issues.append(
                    ValidationIssue(
                        code="E_CONSTRAINT_VIOLATED",
                        severity="error",
                        message=f"Rule not satisfied: {text} ({witness}).",
                        ids=[c_id, a, b],
                    )
                )
            else:
                g_sub = graph.copy()
                g_sub.remove_node(a)
                remaining_entries = sorted(entries - {a})

                bypass_path = None
                for entry in remaining_entries:
                    if nx.has_path(g_sub, entry, b):
                        shortest = nx.shortest_path(g_sub, entry, b)
                        if bypass_path is None or len(shortest) < len(bypass_path):
                            bypass_path = shortest

                if bypass_path is not None:
                    witness = f"a path reaches '{b}' without passing through '{a}': {' > '.join(bypass_path)}"
                    issues.append(
                        ValidationIssue(
                            code="E_CONSTRAINT_VIOLATED",
                            severity="error",
                            message=f"Rule not satisfied: {text} ({witness}).",
                            ids=[c_id, a, b],
                        )
                    )

    return issues


def _validate_params(constraint: ConstraintSpec, node_ids: set[str]) -> ValidationIssue | None:
    """Validate that required parameters for a constraint kind are provided and reference valid nodes."""
    c_id = constraint.id
    kind = constraint.kind

    if kind in ("must_exist", "must_pass_through"):
        if not constraint.node_id:
            return ValidationIssue(
                code="E_CONSTRAINT_BAD_PARAM",
                severity="error",
                message=f"Rule '{c_id}' ({kind}) requires 'node_id'.",
                ids=[c_id],
            )
        if constraint.node_id not in node_ids:
            return ValidationIssue(
                code="E_CONSTRAINT_BAD_PARAM",
                severity="error",
                message=f"Rule '{c_id}' ({kind}) refers to '{constraint.node_id}', which is not a node.",
                ids=[c_id, constraint.node_id],
            )

    elif kind in ("must_not_connect", "must_precede"):
        if not constraint.a or not constraint.b:
            return ValidationIssue(
                code="E_CONSTRAINT_BAD_PARAM",
                severity="error",
                message=f"Rule '{c_id}' ({kind}) requires both 'a' and 'b'.",
                ids=[c_id],
            )
        if constraint.a == constraint.b:
            return ValidationIssue(
                code="E_CONSTRAINT_BAD_PARAM",
                severity="error",
                message=f"Rule '{c_id}' ({kind}) uses the same node '{constraint.a}' for both 'a' and 'b'.",
                ids=[c_id, constraint.a],
            )
        if constraint.a not in node_ids:
            return ValidationIssue(
                code="E_CONSTRAINT_BAD_PARAM",
                severity="error",
                message=f"Rule '{c_id}' ({kind}) refers to '{constraint.a}', which is not a node.",
                ids=[c_id, constraint.a],
            )
        if constraint.b not in node_ids:
            return ValidationIssue(
                code="E_CONSTRAINT_BAD_PARAM",
                severity="error",
                message=f"Rule '{c_id}' ({kind}) refers to '{constraint.b}', which is not a node.",
                ids=[c_id, constraint.b],
            )

    return None


def check_coverage(
    spec: ArchitectureSpec, brief_constraints: dict[str, str]
) -> list[ValidationIssue]:
    """Check that every brief constraint is covered and all covers references are valid."""
    issues: list[ValidationIssue] = []

    # Map of brief_id -> set of rule ids covering it
    covered_brief_ids: set[str] = set()

    for constraint in spec.constraints:
        for brief_id in constraint.covers:
            if brief_id not in brief_constraints:
                issues.append(
                    ValidationIssue(
                        code="E_CONSTRAINT_BAD_PARAM",
                        severity="error",
                        message=f"Rule '{constraint.id}' lists covers '{brief_id}', which is not in the brief.",
                        ids=[constraint.id, brief_id],
                    )
                )
            else:
                covered_brief_ids.add(brief_id)

    # Check that all brief constraints are covered
    for brief_id, brief_text in sorted(brief_constraints.items()):
        if brief_id not in covered_brief_ids:
            issues.append(
                ValidationIssue(
                    code="E_BRIEF_CONSTRAINT_UNCOVERED",
                    severity="error",
                    message=(
                        f"The requirement '{brief_text}' is not covered by any rule. "
                        f"Add a rule that lists '{brief_id}' in covers."
                    ),
                    ids=[brief_id],
                )
            )

    return issues
