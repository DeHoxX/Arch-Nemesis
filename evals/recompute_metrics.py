"""Recompute expected_constraints_rate across historical evaluation result files.

This script loads existing evaluation result JSON files and recomputes the
expected_constraints_rate per case and overall by treating 422 design failures
as non-applicable runs (satisfied / applicable runs) rather than counting them
as satisfied.

Does NOT modify any files on disk.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


def recompute_result_metrics(filepath: Path) -> dict[str, Any]:
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    runs = data.get("runs", [])
    by_case: dict[str, dict[str, Any]] = {}

    case_ids = sorted({r.get("case_id") for r in runs if r.get("case_id")})

    overall_satisfied = 0
    overall_applicable = 0
    overall_422 = 0

    for cid in case_ids:
        case_runs = [r for r in runs if r.get("case_id") == cid]
        total = len(case_runs)
        failures_422 = sum(1 for r in case_runs if r.get("is_422"))

        # In old files, expected_constraints_applicable might be absent.
        # If is_422 is True, it is NOT applicable.
        applicable_runs = sum(
            1
            for r in case_runs
            if not r.get("is_422") and r.get("expected_constraints_applicable", True)
        )
        satisfied_runs = sum(
            1
            for r in case_runs
            if not r.get("is_422")
            and r.get("expected_constraints_applicable", True)
            and r.get("expected_constraints_satisfied", False)
        )

        old_rate = (
            data.get("summary", {})
            .get("by_case", {})
            .get(cid, {})
            .get("expected_constraints_rate", 0.0)
        )
        new_rate = round(satisfied_runs / applicable_runs, 4) if applicable_runs > 0 else 0.0

        by_case[cid] = {
            "total_runs": total,
            "422_count": failures_422,
            "applicable_runs": applicable_runs,
            "satisfied_runs": satisfied_runs,
            "old_rate": old_rate,
            "new_rate": new_rate,
        }

        overall_satisfied += satisfied_runs
        overall_applicable += applicable_runs
        overall_422 += failures_422

    overall_new_rate = (
        round(overall_satisfied / overall_applicable, 4) if overall_applicable > 0 else 0.0
    )

    return {
        "file": filepath.name,
        "total_runs": len(runs),
        "overall_422": overall_422,
        "overall_applicable": overall_applicable,
        "overall_satisfied": overall_satisfied,
        "overall_new_rate": overall_new_rate,
        "by_case": by_case,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Recompute honest expected constraints rates.")
    parser.add_argument("files", nargs="*", help="Result json files to inspect")
    args = parser.parse_args()

    files = (
        [Path(f) for f in args.files]
        if args.files
        else sorted(Path("evals/results").glob("*.json"))
    )

    if not files:
        print("No evaluation result files found.")
        sys.exit(0)

    for p in files:
        if not p.is_file():
            continue
        try:
            res = recompute_result_metrics(p)
        except (json.JSONDecodeError, KeyError, OSError, TypeError) as exc:
            print(f"Skipping {p.name}: {exc}")
            continue

        print("\n========================================================")
        print(f"File: {res['file']} (Total runs: {res['total_runs']}, 422s: {res['overall_422']})")
        print(f"Overall Honest Rate: {res['overall_new_rate']}")
        print(
            f"{'Case':<12} {'Total':<6} {'422':<5} {'Applicable':<11} {'Satisfied':<10} {'Old Rate':<10} {'Honest Rate':<10}"
        )
        print("-" * 68)
        for cid, stats in res["by_case"].items():
            print(
                f"{cid:<12} {stats['total_runs']:<6} {stats['422_count']:<5} "
                f"{stats['applicable_runs']:<11} {stats['satisfied_runs']:<10} "
                f"{stats['old_rate']:<10.4f} {stats['new_rate']:<10.4f}"
            )


if __name__ == "__main__":
    main()
