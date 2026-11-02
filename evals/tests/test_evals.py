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
            explainer_source="fallback",
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
    assert agg.fallback_rate == 0.5  # 2 of 4 (run 3 and run 4)
    assert agg.w_merge_as_agent_rate == 0.25  # 1 of 4
    assert agg.avg_node_count == 8.25  # (10 + 12 + 11 + 0) / 4
    assert agg.avg_wall_clock_seconds == 32.5  # (25 + 35 + 40 + 30) / 4
    assert agg.avg_llm_calls == 3.75

    assert agg.lint_counts.get("W_MERGE_AS_AGENT") == 1
    assert agg.issue_counts.get("X_FLOW_ORDER") == 1
    assert agg.issue_counts.get("X_FORBIDDEN_WORD") == 1


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
