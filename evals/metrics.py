"""Pure metrics calculation and run-record definitions for Arch-Nemesis evaluation.

This module contains pure data structures and aggregation functions.
It has zero third-party dependencies, zero database dependencies,
and zero application-layer imports.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class CaseRunRecord:
    """Detailed metrics recorded for a single evaluation run of a case."""

    case_id: str
    run_index: int
    success: bool
    attempt_1_pass: bool
    final_pass: bool
    is_422: bool
    code_repair_used: bool
    prompt_version: str
    node_count: int
    edge_count: int
    ai_node_count: int
    agent_count: int
    w_merge_as_agent_count: int
    w_no_ai_node_count: int
    other_warnings: list[str] = field(default_factory=list)
    error_codes: list[str] = field(default_factory=list)
    constraint_kinds_found: list[str] = field(default_factory=list)
    expected_constraints_satisfied: bool = True
    expected_constraints_applicable: bool = True
    within_node_bounds: bool = True
    explainer_source: str = "llm"  # "llm" or "fallback"
    explainer_attempt: int = 1
    explainer_issues: list[str] = field(default_factory=list)
    explainer_attempt_1_issues: list[str] = field(default_factory=list)
    explainer_attempt_2_issues: list[str] = field(default_factory=list)
    code_repair_events: list[dict[str, Any]] = field(default_factory=list)
    design_attempt_issues: list[str] = field(default_factory=list)
    design_attempts: list[dict[str, Any]] = field(default_factory=list)
    final_constraints: list[dict[str, Any]] = field(default_factory=list)
    llm_call_count: int = 0
    wall_clock_seconds: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        """Convert record to dictionary representation."""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> CaseRunRecord:
        """Construct record from dictionary representation."""
        known_fields = {f.name for f in cls.__dataclass_fields__.values()}
        filtered = {k: v for k, v in data.items() if k in known_fields}
        return cls(**filtered)


@dataclass
class CaseAggregation:
    """Aggregated metrics summary for a specific case across N runs."""

    case_id: str
    total_runs: int
    attempt_1_pass_rate: float
    final_pass_rate: float
    failure_422_rate: float
    code_repair_rate: float
    fallback_rate: float
    avg_node_count: float
    avg_edge_count: float
    avg_ai_nodes: float
    avg_agents: float
    w_merge_as_agent_rate: float
    within_bounds_rate: float
    expected_constraints_rate: float
    avg_wall_clock_seconds: float
    avg_llm_calls: float
    lint_counts: dict[str, int] = field(default_factory=dict)
    issue_counts: dict[str, int] = field(default_factory=dict)
    design_issue_counts: dict[str, int] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class EvalSummary:
    """Overall evaluation summary aggregated across all cases and runs."""

    total_runs: int
    attempt_1_pass_rate: float
    final_pass_rate: float
    failure_422_rate: float
    code_repair_rate: float
    fallback_rate: float
    avg_node_count: float
    avg_edge_count: float
    avg_agents: float
    w_merge_as_agent_rate: float
    avg_wall_clock_seconds: float
    total_llm_calls: int
    by_case: dict[str, CaseAggregation] = field(default_factory=dict)
    design_issue_counts: dict[str, int] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def aggregate_case_runs(case_id: str, runs: list[CaseRunRecord]) -> CaseAggregation:
    """Compute aggregate statistical metrics for a single case across its runs."""
    total = len(runs)
    if total == 0:
        return CaseAggregation(
            case_id=case_id,
            total_runs=0,
            attempt_1_pass_rate=0.0,
            final_pass_rate=0.0,
            failure_422_rate=0.0,
            code_repair_rate=0.0,
            fallback_rate=0.0,
            avg_node_count=0.0,
            avg_edge_count=0.0,
            avg_ai_nodes=0.0,
            avg_agents=0.0,
            w_merge_as_agent_rate=0.0,
            within_bounds_rate=0.0,
            expected_constraints_rate=0.0,
            avg_wall_clock_seconds=0.0,
            avg_llm_calls=0.0,
            lint_counts={},
            issue_counts={},
            design_issue_counts={},
        )

    attempt_1_passes = sum(1 for r in runs if r.attempt_1_pass)
    final_passes = sum(1 for r in runs if r.final_pass)
    failures_422 = sum(1 for r in runs if r.is_422)
    repairs = sum(1 for r in runs if r.code_repair_used)
    fallbacks = sum(1 for r in runs if r.explainer_source == "fallback" and not r.is_422)
    within_bounds = sum(1 for r in runs if r.within_node_bounds)
    constraints_ok = sum(
        1 for r in runs if r.expected_constraints_applicable and r.expected_constraints_satisfied
    )
    applicable_runs = sum(1 for r in runs if r.expected_constraints_applicable)
    merge_as_agent_runs = sum(1 for r in runs if r.w_merge_as_agent_count > 0)

    # Fallback rate: only among runs where explainer actually ran (not 422)
    non_422_runs = [r for r in runs if not r.is_422]
    fallback_rate = round(fallbacks / len(non_422_runs), 4) if non_422_runs else 0.0

    avg_nodes = sum(r.node_count for r in runs) / total
    avg_edges = sum(r.edge_count for r in runs) / total
    avg_ai = sum(r.ai_node_count for r in runs) / total
    avg_agent = sum(r.agent_count for r in runs) / total
    avg_wall = sum(r.wall_clock_seconds for r in runs) / total
    avg_calls = sum(r.llm_call_count for r in runs) / total

    lint_counts: dict[str, int] = {}
    issue_counts: dict[str, int] = {}
    design_issue_counts: dict[str, int] = {}

    for r in runs:
        if r.w_merge_as_agent_count > 0:
            lint_counts["W_MERGE_AS_AGENT"] = (
                lint_counts.get("W_MERGE_AS_AGENT", 0) + r.w_merge_as_agent_count
            )
        if r.w_no_ai_node_count > 0:
            lint_counts["W_NO_AI_NODE"] = lint_counts.get("W_NO_AI_NODE", 0) + r.w_no_ai_node_count
        for w in r.other_warnings:
            lint_counts[w] = lint_counts.get(w, 0) + 1
        for issue in r.explainer_issues:
            issue_counts[issue] = issue_counts.get(issue, 0) + 1
        for code in r.design_attempt_issues:
            design_issue_counts[code] = design_issue_counts.get(code, 0) + 1

    return CaseAggregation(
        case_id=case_id,
        total_runs=total,
        attempt_1_pass_rate=round(attempt_1_passes / total, 4),
        final_pass_rate=round(final_passes / total, 4),
        failure_422_rate=round(failures_422 / total, 4),
        code_repair_rate=round(repairs / total, 4),
        fallback_rate=fallback_rate,
        avg_node_count=round(avg_nodes, 2),
        avg_edge_count=round(avg_edges, 2),
        avg_ai_nodes=round(avg_ai, 2),
        avg_agents=round(avg_agent, 2),
        w_merge_as_agent_rate=round(merge_as_agent_runs / total, 4),
        within_bounds_rate=round(within_bounds / total, 4),
        expected_constraints_rate=round(constraints_ok / applicable_runs, 4)
        if applicable_runs > 0
        else 0.0,
        avg_wall_clock_seconds=round(avg_wall, 2),
        avg_llm_calls=round(avg_calls, 2),
        lint_counts=lint_counts,
        issue_counts=issue_counts,
        design_issue_counts=design_issue_counts,
    )


def aggregate_eval_runs(runs: list[CaseRunRecord]) -> EvalSummary:
    """Compute overall evaluation summary across all cases."""
    total = len(runs)
    if total == 0:
        return EvalSummary(
            total_runs=0,
            attempt_1_pass_rate=0.0,
            final_pass_rate=0.0,
            failure_422_rate=0.0,
            code_repair_rate=0.0,
            fallback_rate=0.0,
            avg_node_count=0.0,
            avg_edge_count=0.0,
            avg_agents=0.0,
            w_merge_as_agent_rate=0.0,
            avg_wall_clock_seconds=0.0,
            total_llm_calls=0,
            by_case={},
            design_issue_counts={},
        )

    # Group by case
    case_map: dict[str, list[CaseRunRecord]] = {}
    for r in runs:
        case_map.setdefault(r.case_id, []).append(r)

    by_case = {cid: aggregate_case_runs(cid, cruns) for cid, cruns in sorted(case_map.items())}

    attempt_1_passes = sum(1 for r in runs if r.attempt_1_pass)
    final_passes = sum(1 for r in runs if r.final_pass)
    failures_422 = sum(1 for r in runs if r.is_422)
    repairs = sum(1 for r in runs if r.code_repair_used)
    fallbacks = sum(1 for r in runs if r.explainer_source == "fallback" and not r.is_422)
    merge_as_agent_runs = sum(1 for r in runs if r.w_merge_as_agent_count > 0)
    avg_nodes = sum(r.node_count for r in runs) / total
    avg_edges = sum(r.edge_count for r in runs) / total
    avg_agents = sum(r.agent_count for r in runs) / total
    avg_wall = sum(r.wall_clock_seconds for r in runs) / total
    total_calls = sum(r.llm_call_count for r in runs)

    non_422_runs = [r for r in runs if not r.is_422]
    fallback_rate = round(fallbacks / len(non_422_runs), 4) if non_422_runs else 0.0

    overall_design_issue_counts: dict[str, int] = {}
    for r in runs:
        for code in r.design_attempt_issues:
            overall_design_issue_counts[code] = overall_design_issue_counts.get(code, 0) + 1

    return EvalSummary(
        total_runs=total,
        attempt_1_pass_rate=round(attempt_1_passes / total, 4),
        final_pass_rate=round(final_passes / total, 4),
        failure_422_rate=round(failures_422 / total, 4),
        code_repair_rate=round(repairs / total, 4),
        fallback_rate=fallback_rate,
        avg_node_count=round(avg_nodes, 2),
        avg_edge_count=round(avg_edges, 2),
        avg_agents=round(avg_agents, 2),
        w_merge_as_agent_rate=round(merge_as_agent_runs / total, 4),
        avg_wall_clock_seconds=round(avg_wall, 2),
        total_llm_calls=total_calls,
        by_case=by_case,
        design_issue_counts=overall_design_issue_counts,
    )
