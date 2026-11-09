"""Unit tests for the evaluation suite (pure cases, metrics, and comparison logic)."""

import json
from pathlib import Path

from evals.compare import (
    compare_case_metrics,
    compare_overall_summaries,
    compare_runs,
    evaluate_diff,
)
from evals.metrics import (
    CaseRunRecord,
    aggregate_case_runs,
    aggregate_eval_runs,
    calculate_spec_structural_metrics,
)


def test_eval_cases_load_and_validate() -> None:
    """Verify all six evaluation case JSON files exist and have valid structure."""
    cases_dir = Path(__file__).resolve().parent.parent / "cases"
    assert cases_dir.exists(), f"Cases directory missing: {cases_dir}"

    expected_ids = ["insurance", "support", "legal", "finance", "iot", "vague"]
    case_files = list(cases_dir.glob("*.json"))
    assert len(case_files) == 6, f"Expected 6 case files, found {len(case_files)}"

    loaded_ids: set[str] = set()

    for file_path in case_files:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        assert isinstance(data, dict), f"Case {file_path.name} is not a JSON object"
        case_id = data.get("id")
        assert case_id in expected_ids, f"Unexpected case id: {case_id}"
        loaded_ids.add(case_id)

        need_text = data.get("need_text")
        assert isinstance(need_text, str) and len(need_text.strip()) > 10, (
            f"Empty need text in {case_id}"
        )

        followups = data.get("followup_answers")
        assert isinstance(followups, list), f"followup_answers must be a list in {case_id}"

        expect = data.get("expect")
        assert isinstance(expect, dict), f"expect must be a dict in {case_id}"
        assert expect.get("min_nodes") == 3, f"Expected min_nodes == 3 in {case_id}"

        if case_id == "vague":
            assert expect.get("max_nodes") == 6, "Vague case must have max_nodes == 6"
            assert expect.get("must_have_constraint_kinds") == [], (
                "Vague case expects no required constraints"
            )
        elif case_id == "iot":
            assert expect.get("max_nodes") == 25
            assert expect.get("must_have_constraint_kinds") == []
        else:
            assert expect.get("max_nodes") == 25
            assert expect.get("must_have_constraint_kinds") == ["must_pass_through"]

    assert loaded_ids == set(expected_ids), "Missing expected case files"


def test_metrics_case_aggregation_synthetic() -> None:
    """Verify aggregate_case_runs accurately computes rates, averages, and tallies."""
    # 4 runs for "insurance"
    runs = [
        # Run 1: clean pass attempt 1
        CaseRunRecord(
            case_id="insurance",
            run_index=1,
            success=True,
            attempt_1_pass=True,
            final_pass=True,
            is_422=False,
            code_repair_used=False,
            prompt_version="architect_v5",
            node_count=10,
            edge_count=12,
            ai_node_count=2,
            agent_count=1,
            w_merge_as_agent_count=0,
            w_no_ai_node_count=0,
            explainer_source="llm",
            llm_call_count=3,
            wall_clock_seconds=25.0,
        ),
        # Run 2: repair attempt 2, merge as agent lint
        CaseRunRecord(
            case_id="insurance",
            run_index=2,
            success=True,
            attempt_1_pass=False,
            final_pass=True,
            is_422=False,
            code_repair_used=False,
            prompt_version="architect_v5+architect_repair_v5",
            node_count=12,
            edge_count=14,
            ai_node_count=3,
            agent_count=2,
            w_merge_as_agent_count=1,
            w_no_ai_node_count=0,
            explainer_source="llm",
            llm_call_count=4,
            wall_clock_seconds=35.0,
        ),
        # Run 3: code repair used, fallback explainer
        CaseRunRecord(
            case_id="insurance",
            run_index=3,
            success=True,
            attempt_1_pass=False,
            final_pass=True,
            is_422=False,
            code_repair_used=True,
            prompt_version="architect_v5+architect_repair_v5+code_repair",
            node_count=11,
            edge_count=13,
            ai_node_count=2,
            agent_count=1,
            w_merge_as_agent_count=0,
            w_no_ai_node_count=0,
            explainer_source="fallback",
            explainer_issues=["X_FLOW_ORDER", "X_FORBIDDEN_WORD"],
            llm_call_count=5,
            wall_clock_seconds=40.0,
        ),
        # Run 4: 422 failure
        CaseRunRecord(
            case_id="insurance",
            run_index=4,
            success=False,
            attempt_1_pass=False,
            final_pass=False,
            is_422=True,
            code_repair_used=False,
            prompt_version="architect_v5",
            node_count=0,
            edge_count=0,
            ai_node_count=0,
            agent_count=0,
            w_merge_as_agent_count=0,
            w_no_ai_node_count=0,
            error_codes=["E_CYCLE"],
            explainer_source="none",
            llm_call_count=3,
            wall_clock_seconds=30.0,
        ),
    ]

    agg = aggregate_case_runs("insurance", runs)
    assert agg.total_runs == 4
    assert agg.attempt_1_pass_rate == 0.25  # 1 of 4
    assert agg.final_pass_rate == 0.75  # 3 of 4
    assert agg.failure_422_rate == 0.25  # 1 of 4
    assert agg.code_repair_rate == 0.25  # 1 of 4
    assert (
        agg.fallback_rate == 0.3333
    )  # 1 of 3 non-422 runs (run 3 only; run 4 is 422 and excluded from numerator)
    assert agg.w_merge_as_agent_rate == 0.25  # 1 of 4
    assert agg.avg_node_count == 8.25  # (10 + 12 + 11 + 0) / 4
    assert agg.avg_wall_clock_seconds == 32.5  # (25 + 35 + 40 + 30) / 4
    assert agg.avg_llm_calls == 3.75

    assert agg.lint_counts.get("W_MERGE_AS_AGENT") == 1
    assert agg.issue_counts.get("X_FLOW_ORDER") == 1
    assert agg.issue_counts.get("X_FORBIDDEN_WORD") == 1


def test_422_run_with_fallback_source_not_counted_in_fallback_rate() -> None:
    """A 422 run with explainer_source='fallback' (legacy bad data) must NOT be counted in fallback_rate."""
    runs = [
        # 422 run with wrong legacy source value
        CaseRunRecord(
            case_id="finance",
            run_index=1,
            success=False,
            attempt_1_pass=False,
            final_pass=False,
            is_422=True,
            code_repair_used=False,
            prompt_version="architect_v5",
            node_count=0,
            edge_count=0,
            ai_node_count=0,
            agent_count=0,
            w_merge_as_agent_count=0,
            w_no_ai_node_count=0,
            error_codes=["E_CYCLE"],
            explainer_source="fallback",  # bad legacy value; should not count
        ),
    ]
    agg = aggregate_case_runs("finance", runs)
    # All runs are 422 => non-422 denominator is 0 => fallback_rate must be 0.0, not 1.0
    assert agg.fallback_rate == 0.0, (
        f"Expected fallback_rate 0.0 for single 422 run (even with bad legacy source), got {agg.fallback_rate}"
    )
    assert agg.failure_422_rate == 1.0

    # Same check via aggregate_eval_runs
    summary = aggregate_eval_runs(runs)
    assert summary.fallback_rate == 0.0, (
        f"aggregate_eval_runs: expected fallback_rate 0.0, got {summary.fallback_rate}"
    )


def test_metrics_overall_eval_aggregation() -> None:
    """Verify aggregate_eval_runs correctly computes global totals across multiple cases."""
    runs = [
        CaseRunRecord(
            case_id="c1",
            run_index=1,
            success=True,
            attempt_1_pass=True,
            final_pass=True,
            is_422=False,
            code_repair_used=False,
            prompt_version="v5",
            node_count=6,
            edge_count=7,
            ai_node_count=1,
            agent_count=0,
            w_merge_as_agent_count=0,
            w_no_ai_node_count=0,
            explainer_source="llm",
            llm_call_count=3,
            wall_clock_seconds=20.0,
        ),
        CaseRunRecord(
            case_id="c2",
            run_index=1,
            success=True,
            attempt_1_pass=False,
            final_pass=True,
            is_422=False,
            code_repair_used=True,
            prompt_version="v5+repair+code_repair",
            node_count=8,
            edge_count=9,
            ai_node_count=1,
            agent_count=0,
            w_merge_as_agent_count=1,
            w_no_ai_node_count=0,
            explainer_source="fallback",
            llm_call_count=5,
            wall_clock_seconds=30.0,
        ),
    ]

    summary = aggregate_eval_runs(runs)
    assert summary.total_runs == 2
    assert summary.attempt_1_pass_rate == 0.5
    assert summary.final_pass_rate == 1.0
    assert summary.code_repair_rate == 0.5
    assert summary.fallback_rate == 0.5
    assert summary.w_merge_as_agent_rate == 0.5
    assert summary.avg_node_count == 7.0
    assert summary.avg_wall_clock_seconds == 25.0
    assert summary.total_llm_calls == 8
    assert "c1" in summary.by_case
    assert "c2" in summary.by_case


def test_compare_diff_classification() -> None:
    """Verify evaluate_diff correctly identifies IMPROVED, REGRESSION, and UNCHANGED."""
    # Higher is better: pass rate
    assert evaluate_diff("c", "pass_rate", 0.70, 0.90, higher_is_better=True).status == "IMPROVED"
    assert evaluate_diff("c", "pass_rate", 0.90, 0.70, higher_is_better=True).status == "REGRESSION"
    assert evaluate_diff("c", "pass_rate", 0.80, 0.81, higher_is_better=True).status == "UNCHANGED"

    # Lower is better: fallback rate
    assert (
        evaluate_diff("c", "fallback_rate", 0.50, 0.20, higher_is_better=False).status == "IMPROVED"
    )
    assert (
        evaluate_diff("c", "fallback_rate", 0.20, 0.50, higher_is_better=False).status
        == "REGRESSION"
    )
    assert (
        evaluate_diff("c", "fallback_rate", 0.20, 0.21, higher_is_better=False).status
        == "UNCHANGED"
    )

    # Vague node count: lower is better (padding reduction)
    vague_diff_improved = compare_case_metrics(
        "vague",
        {"avg_node_count": 9.0},
        {"avg_node_count": 5.0},
    )
    node_metric_imp = next(d for d in vague_diff_improved if d.metric == "avg_node_count")
    assert node_metric_imp.status == "IMPROVED"

    vague_diff_regressed = compare_case_metrics(
        "vague",
        {"avg_node_count": 5.0},
        {"avg_node_count": 9.0},
    )
    node_metric_reg = next(d for d in vague_diff_regressed if d.metric == "avg_node_count")
    assert node_metric_reg.status == "REGRESSION"

    # Overall summaries comparison
    overall_diffs = compare_overall_summaries(
        {"attempt_1_pass_rate": 0.80, "fallback_rate": 0.10},
        {"attempt_1_pass_rate": 0.50, "fallback_rate": 0.40},
    )
    assert any(d.status == "REGRESSION" for d in overall_diffs)


def test_compare_runs_side_by_side_table_generation() -> None:
    """Verify compare_runs generates non-empty side-by-side comparison table."""
    data_a = {
        "meta": {
            "timestamp": "20261102-1800",
            "prompt_architect": "v4",
            "model_architect": "gemini-flash",
        },
        "summary": {
            "attempt_1_pass_rate": 0.60,
            "final_pass_rate": 0.80,
            "fallback_rate": 0.40,
            "code_repair_rate": 0.20,
            "w_merge_as_agent_rate": 0.30,
            "by_case": {
                "vague": {
                    "attempt_1_pass_rate": 0.60,
                    "final_pass_rate": 0.80,
                    "fallback_rate": 0.40,
                    "code_repair_rate": 0.20,
                    "w_merge_as_agent_rate": 0.20,
                    "avg_node_count": 9.0,
                }
            },
        },
    }

    data_b = {
        "meta": {
            "timestamp": "20261102-1900",
            "prompt_architect": "v5",
            "model_architect": "gemini-flash",
        },
        "summary": {
            "attempt_1_pass_rate": 0.80,  # Improved
            "final_pass_rate": 1.00,  # Improved
            "fallback_rate": 0.10,  # Improved
            "code_repair_rate": 0.10,  # Improved
            "w_merge_as_agent_rate": 0.00,  # Improved
            "by_case": {
                "vague": {
                    "attempt_1_pass_rate": 0.80,
                    "final_pass_rate": 1.00,
                    "fallback_rate": 0.10,
                    "code_repair_rate": 0.10,
                    "w_merge_as_agent_rate": 0.00,
                    "avg_node_count": 5.0,  # Improved padding
                }
            },
        },
    }

    table, diffs = compare_runs(data_a, data_b)
    assert len(table) > 100
    assert "ARCH-NEMESIS EVALUATION COMPARISON" in table
    assert "vague" in table
    assert "OVERALL" in table
    assert "IMPROVED" in table
    assert any(d.status == "IMPROVED" for d in diffs)


def test_parse_retry_delay_formats() -> None:
    """Verify parse_retry_delay handles all three format variants plus fallback with +1s margin."""
    from evals.run import parse_retry_delay

    # 1. Format: "retry in ~51 s"
    delay1 = parse_retry_delay("Gemini rate limit exceeded: Resource exhausted... retry in ~51 s")
    assert delay1 == 52.0, f"Expected 52.0, got {delay1}"

    # 2. Format: "retry after 14s"
    delay2 = parse_retry_delay("Quota exceeded for quota metric... retry after 14s")
    assert delay2 == 15.0, f"Expected 15.0, got {delay2}"

    # 3. Format: "retry_delay { seconds: 14 }"
    delay3 = parse_retry_delay("Resource exhausted: retry_delay { seconds: 14 }")
    assert delay3 == 15.0, f"Expected 15.0, got {delay3}"

    # 4. Fallback: No numeric delay found -> default 60s + 1s = 61.0s
    delay4 = parse_retry_delay("Quota exceeded: Rate limit exceeded without delay info.")
    assert delay4 == 61.0, f"Expected 61.0, got {delay4}"


def test_fallback_rate_and_design_issue_counts() -> None:
    """Verify fallback_rate excludes 422 runs from denominator and design_issue_counts aggregates."""
    # Scenario A: Only 422 runs exist -> fallback_rate must be 0.0, not NaN or 1.0
    runs_422_only = [
        CaseRunRecord(
            case_id="legal",
            run_index=1,
            success=False,
            attempt_1_pass=False,
            final_pass=False,
            is_422=True,
            code_repair_used=False,
            prompt_version="architect_v5",
            node_count=0,
            edge_count=0,
            ai_node_count=0,
            agent_count=0,
            w_merge_as_agent_count=0,
            w_no_ai_node_count=0,
            error_codes=["E_CONSTRAINT_VIOLATED"],
            explainer_source="none",
            design_attempt_issues=["E_CONSTRAINT_VIOLATED", "E_CYCLE"],
        ),
        CaseRunRecord(
            case_id="legal",
            run_index=2,
            success=False,
            attempt_1_pass=False,
            final_pass=False,
            is_422=True,
            code_repair_used=False,
            prompt_version="architect_v5",
            node_count=0,
            edge_count=0,
            ai_node_count=0,
            agent_count=0,
            w_merge_as_agent_count=0,
            w_no_ai_node_count=0,
            error_codes=["E_CONSTRAINT_BAD_PARAM"],
            explainer_source="none",
            design_attempt_issues=["E_CONSTRAINT_BAD_PARAM"],
        ),
    ]

    agg_422 = aggregate_case_runs("legal", runs_422_only)
    assert agg_422.fallback_rate == 0.0, (
        f"Expected fallback_rate 0.0 when all runs are 422, got {agg_422.fallback_rate}"
    )
    assert agg_422.failure_422_rate == 1.0
    assert agg_422.design_issue_counts.get("E_CONSTRAINT_VIOLATED") == 1
    assert agg_422.design_issue_counts.get("E_CYCLE") == 1
    assert agg_422.design_issue_counts.get("E_CONSTRAINT_BAD_PARAM") == 1

    # Scenario B: Mixed runs: 1 run 422, 1 run clean pass (llm), 1 run explainer fallback
    mixed_runs = [
        runs_422_only[0],  # 422 run
        CaseRunRecord(
            case_id="legal",
            run_index=2,
            success=True,
            attempt_1_pass=True,
            final_pass=True,
            is_422=False,
            code_repair_used=False,
            prompt_version="architect_v5",
            node_count=5,
            edge_count=6,
            ai_node_count=1,
            agent_count=1,
            w_merge_as_agent_count=0,
            w_no_ai_node_count=0,
            explainer_source="llm",
            design_attempt_issues=[],
        ),
        CaseRunRecord(
            case_id="legal",
            run_index=3,
            success=True,
            attempt_1_pass=True,
            final_pass=True,
            is_422=False,
            code_repair_used=False,
            prompt_version="architect_v5",
            node_count=5,
            edge_count=6,
            ai_node_count=1,
            agent_count=1,
            w_merge_as_agent_count=0,
            w_no_ai_node_count=0,
            explainer_source="fallback",
            design_attempt_issues=["E_CONSTRAINT_VIOLATED"],
        ),
    ]

    agg_mixed = aggregate_case_runs("legal", mixed_runs)
    # Total runs = 3. 422 runs = 1. Non-422 runs = 2. Fallbacks = 1.
    # fallback_rate = 1 / 2 = 0.50 (NOT 1/3 = 0.3333)
    assert agg_mixed.fallback_rate == 0.5, (
        f"Expected fallback_rate 0.5 (1 fallback / 2 explainer runs), got {agg_mixed.fallback_rate}"
    )
    assert agg_mixed.failure_422_rate == round(1 / 3, 4)
    assert agg_mixed.design_issue_counts.get("E_CONSTRAINT_VIOLATED") == 2

    # Overall summary aggregation
    summary = aggregate_eval_runs(mixed_runs)
    assert summary.fallback_rate == 0.5
    assert summary.failure_422_rate == round(1 / 3, 4)
    assert summary.design_issue_counts.get("E_CONSTRAINT_VIOLATED") == 2
    assert summary.design_issue_counts.get("E_CYCLE") == 1


def test_compare_loads_old_file_without_design_issue_counts() -> None:
    """Verify compare_runs safely handles legacy result files lacking design_issue_counts."""
    old_data_a = {
        "meta": {"timestamp": "20261102-1200", "prompt_architect": "v5"},
        "summary": {
            "total_runs": 2,
            "attempt_1_pass_rate": 0.5,
            "final_pass_rate": 1.0,
            "fallback_rate": 0.0,
            "code_repair_rate": 0.0,
            "w_merge_as_agent_rate": 0.0,
            "by_case": {
                "finance": {
                    "attempt_1_pass_rate": 0.5,
                    "final_pass_rate": 1.0,
                    "fallback_rate": 0.0,
                    "code_repair_rate": 0.0,
                    "w_merge_as_agent_rate": 0.0,
                    "avg_node_count": 7.0,
                }
            },
        },
    }

    new_data_b = {
        "meta": {"timestamp": "20261102-1300", "prompt_architect": "v5"},
        "summary": {
            "total_runs": 2,
            "attempt_1_pass_rate": 1.0,
            "final_pass_rate": 1.0,
            "fallback_rate": 0.0,
            "code_repair_rate": 0.0,
            "w_merge_as_agent_rate": 0.0,
            "design_issue_counts": {"E_CONSTRAINT_VIOLATED": 1},
            "by_case": {
                "finance": {
                    "attempt_1_pass_rate": 1.0,
                    "final_pass_rate": 1.0,
                    "fallback_rate": 0.0,
                    "code_repair_rate": 0.0,
                    "w_merge_as_agent_rate": 0.0,
                    "avg_node_count": 7.0,
                    "design_issue_counts": {"E_CONSTRAINT_VIOLATED": 1},
                }
            },
        },
    }

    # Must load and format without throwing KeyError
    table, _diffs = compare_runs(old_data_a, new_data_b)
    assert len(table) > 50
    assert "ARCH-NEMESIS EVALUATION COMPARISON" in table
    assert "DESIGN ISSUE CODES" in table
    assert "E_CONSTRAINT_VIOLATED" in table


def test_structural_metrics_linear_chain() -> None:
    """Verify linear chain (A -> B -> C) yields 0 branches, 0 fan-ins, and 0 decision nodes."""
    nodes = [
        {"id": "a", "name": "Ingress", "tech_options": ["FastAPI", "Kong"]},
        {"id": "b", "name": "Worker", "tech_options": ["Celery"]},
        {"id": "c", "name": "Storage", "tech_options": []},
    ]
    edges = [
        {"from": "a", "to": "b", "condition": ""},
        {"from": "b", "to": "c", "condition": None},
    ]

    metrics = calculate_spec_structural_metrics(nodes=nodes, edges=edges)

    assert metrics["node_count"] == 3
    assert metrics["edge_count"] == 2
    assert metrics["branch_count"] == 0
    assert metrics["fan_in_count"] == 0
    assert metrics["decision_node_count"] == 0
    assert metrics["tech_options_total"] == 3
    assert metrics["nodes_with_tech_options"] == 2
    assert metrics["nodes_total"] == 3


def test_structural_metrics_fan_out() -> None:
    """Verify fan-out of 3 (A -> B, A -> C, A -> D) yields exactly 1 branch node."""
    nodes = [
        {"id": "router", "name": "Router", "tech_options": ["Envoy"]},
        {"id": "svc1", "name": "Auth", "tech_options": ["Go"]},
        {"id": "svc2", "name": "Billing", "tech_options": ["NodeJS"]},
        {"id": "svc3", "name": "Reports", "tech_options": ["Python"]},
    ]
    edges = [
        {"from": "router", "to": "svc1"},
        {"from": "router", "to": "svc2"},
        {"from": "router", "to": "svc3"},
    ]

    metrics = calculate_spec_structural_metrics(nodes=nodes, edges=edges)

    assert metrics["node_count"] == 4
    assert metrics["edge_count"] == 3
    assert metrics["branch_count"] == 1  # 'router' has out-degree 3 >= 2
    assert metrics["fan_in_count"] == 0
    assert metrics["decision_node_count"] == 0
    assert metrics["tech_options_total"] == 4
    assert metrics["nodes_with_tech_options"] == 4


def test_structural_metrics_diamond_with_conditions() -> None:
    """Verify diamond with conditions yields 1 branch, 1 fan-in, and 1 decision node."""
    nodes = [
        {"id": "start", "name": "Gateway", "tech_options": ["Nginx"]},
        {"id": "fraud", "name": "Fraud Check", "tech_options": ["PyTorch"]},
        {"id": "bypass", "name": "Fast Track", "tech_options": []},
        {"id": "sink", "name": "Settlement", "tech_options": ["PostgreSQL"]},
    ]
    edges = [
        {"from": "start", "to": "fraud", "condition": "risk_score > 0.5"},
        {"from": "start", "to": "bypass", "condition": "risk_score <= 0.5"},
        {"from": "fraud", "to": "sink"},
        {"from": "bypass", "to": "sink"},
    ]

    metrics = calculate_spec_structural_metrics(nodes=nodes, edges=edges)

    assert metrics["node_count"] == 4
    assert metrics["nodes_total"] == 4
    assert metrics["edge_count"] == 4
    assert metrics["branch_count"] == 1  # 'start' has out-degree 2
    assert metrics["fan_in_count"] == 1  # 'sink' has in-degree 2
    assert metrics["decision_node_count"] == 1  # 'start' has conditional edge
    assert metrics["tech_options_total"] == 3  # Nginx, PyTorch, PostgreSQL
    assert metrics["nodes_with_tech_options"] == 3  # start, fraud, sink (bypass is empty)


def test_structural_metrics_empty_tech_options() -> None:
    """Verify nodes without tech_options or with empty tech_options lists are handled."""
    nodes = [
        {"id": "n1", "name": "Node 1", "tech_options": []},
        {"id": "n2", "name": "Node 2"},  # Missing key
    ]
    edges = [{"from": "n1", "to": "n2"}]

    metrics = calculate_spec_structural_metrics(nodes=nodes, edges=edges)

    assert metrics["node_count"] == 2
    assert metrics["nodes_total"] == 2
    assert metrics["tech_options_total"] == 0
    assert metrics["nodes_with_tech_options"] == 0
    assert metrics["branch_count"] == 0
    assert metrics["fan_in_count"] == 0
    assert metrics["decision_node_count"] == 0


def test_structural_metrics_empty_graph_safe() -> None:
    """Verify empty graph handles zeros safely without division errors."""
    metrics = calculate_spec_structural_metrics(nodes=[], edges=[])

    assert metrics["node_count"] == 0
    assert metrics["edge_count"] == 0
    assert metrics["branch_count"] == 0
    assert metrics["fan_in_count"] == 0
    assert metrics["decision_node_count"] == 0
    assert metrics["tech_options_total"] == 0
    assert metrics["nodes_with_tech_options"] == 0
    assert metrics["nodes_total"] == 0


def test_structural_metrics_aggregation_math() -> None:
    """Verify aggregate_case_runs and aggregate_eval_runs correctly compute structural averages."""
    # Run 1 (success):
    #   branch_count=2, fan_in_count=1, decision_node_count=1
    #   nodes_total=4, nodes_with_tech_options=4, tech_options_total=8
    # Run 2 (success):
    #   branch_count=0, fan_in_count=1, decision_node_count=0
    #   nodes_total=6, nodes_with_tech_options=3, tech_options_total=3
    # Run 3 (422 failure, excluded from successful averages):
    #   all metrics 0
    # Arithmetic:
    #   successful_runs = 2
    #   avg_branch_count = (2 + 0) / 2 = 1.0
    #   avg_fan_in_count = (1 + 1) / 2 = 1.0
    #   avg_decision_node_count = (1 + 0) / 2 = 0.5
    #   total_nodes = 4 + 6 = 10
    #   total_tech_options = 8 + 3 = 11
    #   nodes_with_tech = 4 + 3 = 7
    #   tech_options_fill_rate = 7 / 10 = 0.70
    #   avg_tech_options_per_node = 11 / 10 = 1.10
    runs = [
        CaseRunRecord(
            case_id="case1",
            run_index=1,
            success=True,
            attempt_1_pass=True,
            final_pass=True,
            is_422=False,
            code_repair_used=False,
            prompt_version="v9",
            node_count=4,
            edge_count=4,
            ai_node_count=1,
            agent_count=0,
            w_merge_as_agent_count=0,
            w_no_ai_node_count=0,
            branch_count=2,
            fan_in_count=1,
            decision_node_count=1,
            tech_options_total=8,
            nodes_with_tech_options=4,
            nodes_total=4,
        ),
        CaseRunRecord(
            case_id="case1",
            run_index=2,
            success=True,
            attempt_1_pass=True,
            final_pass=True,
            is_422=False,
            code_repair_used=False,
            prompt_version="v9",
            node_count=6,
            edge_count=5,
            ai_node_count=2,
            agent_count=1,
            w_merge_as_agent_count=0,
            w_no_ai_node_count=0,
            branch_count=0,
            fan_in_count=1,
            decision_node_count=0,
            tech_options_total=3,
            nodes_with_tech_options=3,
            nodes_total=6,
        ),
        # 422 run should be excluded from successful-run averages
        CaseRunRecord(
            case_id="case1",
            run_index=3,
            success=False,
            attempt_1_pass=False,
            final_pass=False,
            is_422=True,
            code_repair_used=False,
            prompt_version="v9",
            node_count=0,
            edge_count=0,
            ai_node_count=0,
            agent_count=0,
            w_merge_as_agent_count=0,
            w_no_ai_node_count=0,
            branch_count=0,
            fan_in_count=0,
            decision_node_count=0,
            tech_options_total=0,
            nodes_with_tech_options=0,
            nodes_total=0,
        ),
    ]

    # Non-empty guard on runs and successful runs
    assert len(runs) == 3
    successful_runs = [r for r in runs if not r.is_422 and r.success]
    assert len(successful_runs) == 2
    assert all(r.case_id == "case1" for r in runs)

    agg = aggregate_case_runs("case1", runs)

    assert agg.avg_branch_count == 1.0  # (2 + 0) / 2
    assert agg.avg_fan_in_count == 1.0  # (1 + 1) / 2
    assert agg.avg_decision_node_count == 0.5  # (1 + 0) / 2
    # total nodes across 2 successful runs = 10
    # tech_options_total = 11 -> 11 / 10 = 1.1
    assert agg.avg_tech_options_per_node == 1.1
    # nodes_with_tech_options = 7 -> 7 / 10 = 0.7
    assert agg.tech_options_fill_rate == 0.7

    eval_summary = aggregate_eval_runs(runs)
    assert eval_summary.total_runs == 3
    assert len(eval_summary.by_case) == 1
    assert "case1" in eval_summary.by_case
    assert eval_summary.avg_branch_count == 1.0
    assert eval_summary.avg_fan_in_count == 1.0
    assert eval_summary.avg_decision_node_count == 0.5
    assert eval_summary.avg_tech_options_per_node == 1.1
    assert eval_summary.tech_options_fill_rate == 0.7


def test_compare_runs_with_legacy_and_new_formats() -> None:
    """Verify compare_runs shows 'n/a' when comparing older result file with new result file."""
    legacy_data = {
        "meta": {"timestamp": "20261109-0428", "prompt_architect": "architect_v8"},
        "summary": {
            "total_runs": 1,
            "attempt_1_pass_rate": 1.0,
            "final_pass_rate": 1.0,
            "fallback_rate": 0.0,
            "code_repair_rate": 0.0,
            "w_merge_as_agent_rate": 0.0,
            "avg_node_count": 5.0,
            "avg_edge_count": 4.0,
            "avg_agents": 1.0,
            # Notice: no avg_branch_count, avg_fan_in_count, etc.
            "by_case": {
                "support": {
                    "attempt_1_pass_rate": 1.0,
                    "final_pass_rate": 1.0,
                    "fallback_rate": 0.0,
                    "code_repair_rate": 0.0,
                    "w_merge_as_agent_rate": 0.0,
                    "avg_node_count": 5.0,
                }
            },
        },
    }

    new_data = {
        "meta": {"timestamp": "20261109-1200", "prompt_architect": "architect_v9"},
        "summary": {
            "total_runs": 1,
            "attempt_1_pass_rate": 1.0,
            "final_pass_rate": 1.0,
            "fallback_rate": 0.0,
            "code_repair_rate": 0.0,
            "w_merge_as_agent_rate": 0.0,
            "avg_node_count": 6.0,
            "avg_edge_count": 7.0,
            "avg_agents": 1.0,
            "avg_branch_count": 2.0,
            "avg_fan_in_count": 1.5,
            "avg_decision_node_count": 1.0,
            "tech_options_fill_rate": 0.85,
            "avg_tech_options_per_node": 1.8,
            "by_case": {
                "support": {
                    "attempt_1_pass_rate": 1.0,
                    "final_pass_rate": 1.0,
                    "fallback_rate": 0.0,
                    "code_repair_rate": 0.0,
                    "w_merge_as_agent_rate": 0.0,
                    "avg_node_count": 6.0,
                    "avg_branch_count": 2.0,
                    "avg_fan_in_count": 1.5,
                    "avg_decision_node_count": 1.0,
                    "tech_options_fill_rate": 0.85,
                    "avg_tech_options_per_node": 1.8,
                }
            },
        },
    }

    table, diffs = compare_runs(legacy_data, new_data)

    assert len(diffs) > 0
    # Must format table containing 'n/a' and not raise exceptions
    assert "n/a" in table
    assert "avg_branch_count" in table
    assert "avg_fan_in_count" in table
    assert "avg_decision_nodes" in table
    assert "tech_options_fill_rate" in table
    assert "avg_tech_options" in table
