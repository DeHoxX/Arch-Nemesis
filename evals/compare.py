"""Side-by-side comparison tool for Arch-Nemesis evaluation runs.

Usage:
    python evals/compare.py path/to/run_a.json path/to/run_b.json [--fail-on-regression]
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass
class MetricDiff:
    """Represents the difference between two evaluation runs for a metric."""

    case_id: str
    metric: str
    val_a: float | int | str
    val_b: float | int | str
    diff: float | int | str
    status: str  # "IMPROVED", "REGRESSION", "UNCHANGED"

    def format_row(self) -> str:
        if isinstance(self.diff, (int, float)):
            diff_str = f"{self.diff:+.2f}" if isinstance(self.diff, float) else f"{self.diff:+d}"
        else:
            diff_str = str(self.diff)

        if isinstance(self.val_a, float) and "rate" in self.metric:
            a_str = f"{self.val_a * 100:.1f}%"
        elif isinstance(self.val_a, float):
            a_str = f"{self.val_a:.2f}"
        else:
            a_str = str(self.val_a)

        if isinstance(self.val_b, float) and "rate" in self.metric:
            b_str = f"{self.val_b * 100:.1f}%"
        elif isinstance(self.val_b, float):
            b_str = f"{self.val_b:.2f}"
        else:
            b_str = str(self.val_b)

        if isinstance(self.diff, float) and "rate" in self.metric:
            diff_str = f"{self.diff * 100:+.1f}%"

        return (
            f"{self.case_id:<12} | {self.metric:<22} | {a_str:>8} | {b_str:>8} | "
            f"{diff_str:>8} | {self.status:<11}"
        )


def evaluate_diff(
    case_id: str,
    metric: str,
    val_a: float,
    val_b: float,
    higher_is_better: bool = True,
    threshold: float = 0.02,
) -> MetricDiff:
    """Classify change as IMPROVED, REGRESSION, or UNCHANGED based on metric direction."""
    diff = round(val_b - val_a, 4)
    if higher_is_better:
        if diff > threshold:
            status = "IMPROVED"
        elif diff < -threshold:
            status = "REGRESSION"
        else:
            status = "UNCHANGED"
    else:
        if diff < -threshold:
            status = "IMPROVED"
        elif diff > threshold:
            status = "REGRESSION"
        else:
            status = "UNCHANGED"

    return MetricDiff(
        case_id=case_id,
        metric=metric,
        val_a=val_a,
        val_b=val_b,
        diff=diff,
        status=status,
    )


def evaluate_diff_or_na(
    case_id: str,
    metric: str,
    raw_a: Any,
    raw_b: Any,
    higher_is_better: bool = True,
    threshold: float = 0.02,
) -> MetricDiff:
    """Compare two metric values, or return 'n/a' diff if either is missing."""
    if raw_a is None or raw_b is None:
        if raw_a is None:
            a_val: float | int | str = "n/a"
        elif isinstance(raw_a, float) and "rate" in metric:
            a_val = f"{raw_a * 100:.1f}%"
        elif isinstance(raw_a, float):
            a_val = f"{raw_a:.2f}"
        else:
            a_val = str(raw_a)

        if raw_b is None:
            b_val: float | int | str = "n/a"
        elif isinstance(raw_b, float) and "rate" in metric:
            b_val = f"{raw_b * 100:.1f}%"
        elif isinstance(raw_b, float):
            b_val = f"{raw_b:.2f}"
        else:
            b_val = str(raw_b)

        return MetricDiff(
            case_id=case_id,
            metric=metric,
            val_a=a_val,
            val_b=b_val,
            diff="n/a",
            status="UNCHANGED",
        )
    return evaluate_diff(
        case_id=case_id,
        metric=metric,
        val_a=float(raw_a),
        val_b=float(raw_b),
        higher_is_better=higher_is_better,
        threshold=threshold,
    )


def compare_case_metrics(
    case_id: str,
    case_a: dict[str, Any],
    case_b: dict[str, Any],
) -> list[MetricDiff]:
    """Compare key performance metrics for a specific case across two runs."""
    diffs: list[MetricDiff] = []

    # 1. Attempt 1 Pass Rate (higher is better)
    diffs.append(
        evaluate_diff(
            case_id,
            "attempt_1_pass_rate",
            float(case_a.get("attempt_1_pass_rate", 0.0)),
            float(case_b.get("attempt_1_pass_rate", 0.0)),
            higher_is_better=True,
            threshold=0.05,
        )
    )

    # 2. Final Pass Rate (higher is better)
    diffs.append(
        evaluate_diff(
            case_id,
            "final_pass_rate",
            float(case_a.get("final_pass_rate", 0.0)),
            float(case_b.get("final_pass_rate", 0.0)),
            higher_is_better=True,
            threshold=0.05,
        )
    )

    # 3. Explainer Fallback Rate (lower is better)
    diffs.append(
        evaluate_diff(
            case_id,
            "fallback_rate",
            float(case_a.get("fallback_rate", 0.0)),
            float(case_b.get("fallback_rate", 0.0)),
            higher_is_better=False,
            threshold=0.05,
        )
    )

    # 4. Code Repair Rate (lower is better)
    diffs.append(
        evaluate_diff(
            case_id,
            "code_repair_rate",
            float(case_a.get("code_repair_rate", 0.0)),
            float(case_b.get("code_repair_rate", 0.0)),
            higher_is_better=False,
            threshold=0.05,
        )
    )

    # 5. Merge As Agent Rate (lower is better)
    diffs.append(
        evaluate_diff(
            case_id,
            "w_merge_as_agent_rate",
            float(case_a.get("w_merge_as_agent_rate", 0.0)),
            float(case_b.get("w_merge_as_agent_rate", 0.0)),
            higher_is_better=False,
            threshold=0.05,
        )
    )

    # 6. Avg Node Count (for vague case, lower is better to prevent padding)
    if case_id == "vague":
        diffs.append(
            evaluate_diff(
                case_id,
                "avg_node_count",
                float(case_a.get("avg_node_count", 0.0)),
                float(case_b.get("avg_node_count", 0.0)),
                higher_is_better=False,
                threshold=1.0,
            )
        )
    else:
        # Informational node count difference
        diffs.append(
            evaluate_diff(
                case_id,
                "avg_node_count",
                float(case_a.get("avg_node_count", 0.0)),
                float(case_b.get("avg_node_count", 0.0)),
                higher_is_better=True,
                threshold=999.0,  # Never triggers regression/improved
            )
        )

    # 7. Structural metrics
    diffs.append(
        evaluate_diff_or_na(
            case_id,
            "avg_branch_count",
            case_a.get("avg_branch_count"),
            case_b.get("avg_branch_count"),
            higher_is_better=True,
            threshold=999.0,
        )
    )
    diffs.append(
        evaluate_diff_or_na(
            case_id,
            "avg_fan_in_count",
            case_a.get("avg_fan_in_count"),
            case_b.get("avg_fan_in_count"),
            higher_is_better=True,
            threshold=999.0,
        )
    )
    diffs.append(
        evaluate_diff_or_na(
            case_id,
            "avg_decision_nodes",
            case_a.get("avg_decision_node_count", case_a.get("avg_decision_nodes")),
            case_b.get("avg_decision_node_count", case_b.get("avg_decision_nodes")),
            higher_is_better=True,
            threshold=999.0,
        )
    )
    diffs.append(
        evaluate_diff_or_na(
            case_id,
            "tech_options_fill_rate",
            case_a.get("tech_options_fill_rate"),
            case_b.get("tech_options_fill_rate"),
            higher_is_better=True,
            threshold=999.0,
        )
    )
    diffs.append(
        evaluate_diff_or_na(
            case_id,
            "avg_tech_options",
            case_a.get("avg_tech_options_per_node", case_a.get("avg_tech_options")),
            case_b.get("avg_tech_options_per_node", case_b.get("avg_tech_options")),
            higher_is_better=True,
            threshold=999.0,
        )
    )
    diffs.append(
        evaluate_diff_or_na(
            case_id,
            "avg_layer_count",
            case_a.get("avg_layer_count"),
            case_b.get("avg_layer_count"),
            higher_is_better=True,
            threshold=999.0,
        )
    )

    return diffs


def compare_overall_summaries(
    summary_a: dict[str, Any],
    summary_b: dict[str, Any],
) -> list[MetricDiff]:
    """Compare top-level evaluation summaries across all cases."""
    diffs: list[MetricDiff] = [
        evaluate_diff(
            "OVERALL",
            "attempt_1_pass_rate",
            float(summary_a.get("attempt_1_pass_rate", 0.0)),
            float(summary_b.get("attempt_1_pass_rate", 0.0)),
            higher_is_better=True,
            threshold=0.03,
        ),
        evaluate_diff(
            "OVERALL",
            "final_pass_rate",
            float(summary_a.get("final_pass_rate", 0.0)),
            float(summary_b.get("final_pass_rate", 0.0)),
            higher_is_better=True,
            threshold=0.03,
        ),
        evaluate_diff(
            "OVERALL",
            "fallback_rate",
            float(summary_a.get("fallback_rate", 0.0)),
            float(summary_b.get("fallback_rate", 0.0)),
            higher_is_better=False,
            threshold=0.03,
        ),
        evaluate_diff(
            "OVERALL",
            "code_repair_rate",
            float(summary_a.get("code_repair_rate", 0.0)),
            float(summary_b.get("code_repair_rate", 0.0)),
            higher_is_better=False,
            threshold=0.03,
        ),
        evaluate_diff(
            "OVERALL",
            "w_merge_as_agent_rate",
            float(summary_a.get("w_merge_as_agent_rate", 0.0)),
            float(summary_b.get("w_merge_as_agent_rate", 0.0)),
            higher_is_better=False,
            threshold=0.03,
        ),
        evaluate_diff(
            "OVERALL",
            "avg_edge_count",
            float(summary_a.get("avg_edge_count", 0.0)),
            float(summary_b.get("avg_edge_count", 0.0)),
            higher_is_better=True,
            threshold=999.0,
        ),
        evaluate_diff(
            "OVERALL",
            "avg_agents",
            float(summary_a.get("avg_agents", 0.0)),
            float(summary_b.get("avg_agents", 0.0)),
            higher_is_better=True,
            threshold=999.0,
        ),
        evaluate_diff_or_na(
            "OVERALL",
            "avg_branch_count",
            summary_a.get("avg_branch_count"),
            summary_b.get("avg_branch_count"),
            higher_is_better=True,
            threshold=999.0,
        ),
        evaluate_diff_or_na(
            "OVERALL",
            "avg_fan_in_count",
            summary_a.get("avg_fan_in_count"),
            summary_b.get("avg_fan_in_count"),
            higher_is_better=True,
            threshold=999.0,
        ),
        evaluate_diff_or_na(
            "OVERALL",
            "avg_decision_nodes",
            summary_a.get("avg_decision_node_count", summary_a.get("avg_decision_nodes")),
            summary_b.get("avg_decision_node_count", summary_b.get("avg_decision_nodes")),
            higher_is_better=True,
            threshold=999.0,
        ),
        evaluate_diff_or_na(
            "OVERALL",
            "tech_options_fill_rate",
            summary_a.get("tech_options_fill_rate"),
            summary_b.get("tech_options_fill_rate"),
            higher_is_better=True,
            threshold=999.0,
        ),
        evaluate_diff_or_na(
            "OVERALL",
            "avg_tech_options",
            summary_a.get("avg_tech_options_per_node", summary_a.get("avg_tech_options")),
            summary_b.get("avg_tech_options_per_node", summary_b.get("avg_tech_options")),
            higher_is_better=True,
            threshold=999.0,
        ),
        evaluate_diff_or_na(
            "OVERALL",
            "avg_layer_count",
            summary_a.get("avg_layer_count"),
            summary_b.get("avg_layer_count"),
            higher_is_better=True,
            threshold=999.0,
        ),
    ]
    return diffs


def format_comparison_table(
    run_a_meta: dict[str, Any],
    run_b_meta: dict[str, Any],
    case_diffs: list[MetricDiff],
    overall_diffs: list[MetricDiff],
    summary_a: dict[str, Any] | None = None,
    summary_b: dict[str, Any] | None = None,
) -> str:
    """Render ASCII side-by-side comparison table."""
    lines: list[str] = []
    lines.append("=" * 80)
    lines.append("ARCH-NEMESIS EVALUATION COMPARISON")
    lines.append("=" * 80)
    lines.append(
        f"Run A: {run_a_meta.get('timestamp', 'unknown')} | Prompt: {run_a_meta.get('prompt_architect', 'n/a')} | Model: {run_a_meta.get('model_architect', 'n/a')}"
    )
    lines.append(
        f"Run B: {run_b_meta.get('timestamp', 'unknown')} | Prompt: {run_b_meta.get('prompt_architect', 'n/a')} | Model: {run_b_meta.get('model_architect', 'n/a')}"
    )
    lines.append("-" * 80)
    lines.append(
        f"{'Case':<12} | {'Metric':<22} | {'Run A':>8} | {'Run B':>8} | {'Diff':>8} | {'Status':<11}"
    )
    lines.append("-" * 80)

    for d in case_diffs:
        lines.append(d.format_row())

    lines.append("-" * 80)
    for od in overall_diffs:
        lines.append(od.format_row())
    lines.append("=" * 80)

    regressions = [d for d in case_diffs + overall_diffs if d.status == "REGRESSION"]
    improvements = [d for d in case_diffs + overall_diffs if d.status == "IMPROVED"]

    lines.append(
        f"Summary: {len(improvements)} IMPROVED, {len(regressions)} REGRESSION, {len(case_diffs) + len(overall_diffs) - len(improvements) - len(regressions)} UNCHANGED"
    )

    if summary_a is not None and summary_b is not None:
        design_issues_a = summary_a.get("design_issue_counts", {})
        design_issues_b = summary_b.get("design_issue_counts", {})
        all_design_codes = sorted(set(design_issues_a.keys()) | set(design_issues_b.keys()))
        if all_design_codes:
            lines.append("-" * 80)
            lines.append("DESIGN ISSUE CODES:")
            for code in all_design_codes:
                cnt_a = design_issues_a.get(code, 0)
                cnt_b = design_issues_b.get(code, 0)
                diff = cnt_b - cnt_a
                lines.append(
                    f"  {code:<30}: Run A = {cnt_a:>3}, Run B = {cnt_b:>3} (diff {diff:+d})"
                )

        lints_a: dict[str, int] = dict(summary_a.get("lint_counts", {}))
        lints_b: dict[str, int] = dict(summary_b.get("lint_counts", {}))
        if not lints_a and "by_case" in summary_a:
            for c in summary_a["by_case"].values():
                for k, v in c.get("lint_counts", {}).items():
                    lints_a[k] = lints_a.get(k, 0) + v
        if not lints_b and "by_case" in summary_b:
            for c in summary_b["by_case"].values():
                for k, v in c.get("lint_counts", {}).items():
                    lints_b[k] = lints_b.get(k, 0) + v

        layer_lint_codes = ["W_LAYER_MISSING", "W_TOO_MANY_LAYERS", "W_LAYER_BACKWARD"]
        if any(code in lints_a or code in lints_b for code in layer_lint_codes):
            lines.append("-" * 80)
            lines.append("LAYER LINT COUNTS:")
            for code in layer_lint_codes:
                cnt_a = lints_a.get(code, 0)
                cnt_b = lints_b.get(code, 0)
                diff = cnt_b - cnt_a
                lines.append(
                    f"  {code:<30}: Run A = {cnt_a:>3}, Run B = {cnt_b:>3} (diff {diff:+d})"
                )

    if regressions:
        lines.append("WARNING: Regressions detected in comparison.")
    else:
        lines.append("OK: No regressions detected.")

    return "\n".join(lines)


def load_result_file(path: str | Path) -> dict[str, Any]:
    """Load and parse evaluation result JSON."""
    file_path = Path(path)
    if not file_path.exists():
        raise FileNotFoundError(f"Result file not found: {file_path}")
    with open(file_path, "r", encoding="utf-8") as f:
        data: dict[str, Any] = json.load(f)
    return data


def compare_runs(data_a: dict[str, Any], data_b: dict[str, Any]) -> tuple[str, list[MetricDiff]]:
    """Compare two result datasets and produce formatted table string and list of diffs."""
    cases_a = data_a.get("summary", {}).get("by_case", {}) or data_a.get("by_case", {})
    cases_b = data_b.get("summary", {}).get("by_case", {}) or data_b.get("by_case", {})

    all_case_ids = sorted(set(cases_a.keys()) | set(cases_b.keys()))
    case_diffs: list[MetricDiff] = []

    for cid in all_case_ids:
        ca = cases_a.get(cid, {})
        cb = cases_b.get(cid, {})
        case_diffs.extend(compare_case_metrics(cid, ca, cb))

    summary_a = data_a.get("summary", data_a)
    summary_b = data_b.get("summary", data_b)
    overall_diffs = compare_overall_summaries(summary_a, summary_b)

    table = format_comparison_table(
        run_a_meta=data_a.get("meta", data_a),
        run_b_meta=data_b.get("meta", data_b),
        case_diffs=case_diffs,
        overall_diffs=overall_diffs,
        summary_a=summary_a,
        summary_b=summary_b,
    )
    return table, case_diffs + overall_diffs


def main() -> int:
    parser = argparse.ArgumentParser(description="Compare two Arch-Nemesis evaluation runs.")
    parser.add_argument("run_a", help="Path to Run A result JSON")
    parser.add_argument("run_b", help="Path to Run B result JSON")
    parser.add_argument(
        "--fail-on-regression",
        action="store_true",
        help="Exit with non-zero code if regressions are found",
    )

    args = parser.parse_args()

    try:
        data_a = load_result_file(args.run_a)
        data_b = load_result_file(args.run_b)
    except Exception as exc:  # noqa: BLE001
        print(f"Error loading result files: {exc}", file=sys.stderr)
        return 1

    table, diffs = compare_runs(data_a, data_b)
    print(table)

    has_regressions = any(d.status == "REGRESSION" for d in diffs)
    if args.fail_on_regression and has_regressions:
        return 2

    return 0


if __name__ == "__main__":
    sys.exit(main())
