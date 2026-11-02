"""Unit tests for the evaluation runner (evals/run.py) using FakeLLMClient."""

import json
from pathlib import Path
from typing import Any

import pytest
from evals.run import (
    InstrumentedLLMClient,
    StructlogCaptureHandler,
    execute_eval_suite,
    load_eval_cases,
    main,
)
from pydantic import BaseModel

from archnemesis.llm.base import LLMClient, LLMRateLimited, LLMTask


class FailingFakeLLM(LLMClient):
    """Fake client that succeeds once, then raises LLMRateLimited."""

    def __init__(self, first_response: dict[str, Any]) -> None:
        self.first_response = first_response
        self.call_count = 0

    async def generate_text(self, task: LLMTask, system: str, user: str) -> str:
        self.call_count += 1
        return "OK"

    async def generate_json(
        self, task: LLMTask, system: str, user: str, schema: type[BaseModel]
    ) -> dict[str, Any]:
        self.call_count += 1
        if self.call_count == 1:
            return self.first_response
        raise LLMRateLimited("Rate limit exceeded: 429 quota exhausted.")


@pytest.fixture
def repo_root_path() -> Path:
    return Path(__file__).resolve().parent.parent.parent


def test_dry_run_end_to_end(tmp_path: Path, repo_root_path: Path) -> None:
    """Verify evals/run.py --dry executes cleanly without touching real database or leaking secrets."""
    real_db = repo_root_path / "apps" / "api" / "arch_nemesis.db"
    initial_db_stat = None
    if real_db.exists():
        initial_db_stat = (real_db.stat().st_size, real_db.stat().st_mtime)

    out_file = tmp_path / "dry_results.json"

    # Run dry evaluation on two cases with 1 run each
    exit_code = main(
        [
            "--dry",
            "--runs",
            "1",
            "--only",
            "support",
            "--out",
            str(out_file),
        ]
    )

    assert exit_code == 0, f"Expected dry run exit code 0, got {exit_code}"
    assert out_file.exists(), f"Output file missing: {out_file}"

    with open(out_file, "r", encoding="utf-8") as f:
        content = f.read()
        data = json.loads(content)

    # 1. Non-empty structure assertions
    assert len(content) > 50
    assert "meta" in data
    assert "summary" in data
    assert "by_case" in data
    assert "runs" in data

    assert data["meta"]["runs_requested"] == 1
    assert data["meta"]["total_runs_completed"] == 1
    assert data["meta"]["aborted_due_to_quota"] is False
    assert len(data["runs"]) == 1

    run_record = data["runs"][0]
    assert run_record["case_id"] == "support"
    assert run_record["success"] is True
    assert run_record["final_pass"] is True
    assert run_record["node_count"] == 3
    assert run_record["explainer_source"] == "llm"

    # 2. Privacy & Sanitation assertions
    assert "need_text" not in content, "need_text must not be persisted in results JSON"
    assert "AIza" not in content, "No API key prefix allowed in results JSON"

    # 3. Real database was not touched
    if initial_db_stat is not None:
        current_stat = (real_db.stat().st_size, real_db.stat().st_mtime)
        assert current_stat == initial_db_stat, "Real arch_nemesis.db was modified during eval run!"
    else:
        assert not real_db.exists(), "Real arch_nemesis.db was created during eval run!"


@pytest.mark.asyncio
async def test_quota_error_aborts_and_saves_partial(tmp_path: Path, repo_root_path: Path) -> None:
    """Verify an unrecoverable quota error (LLMRateLimited) aborts execution and saves partial results."""
    cases_dir = repo_root_path / "evals" / "cases"
    cases = load_eval_cases(cases_dir, only_case_id="support")
    assert len(cases) == 1

    out_file = tmp_path / "aborted_quota_results.json"
    capture_handler = StructlogCaptureHandler()

    valid_intake_output = {
        "action": "ready",
        "questions": [],
        "brief": {
            "summary": "Partial brief before quota abort",
            "users": "Customers",
            "data_involved": ["chats"],
            "domain_hint": "support",
            "stated_constraints": ["Must pass validator"],
            "unverifiable_requirements": [],
            "numbers_given": [],
            "assumptions": [],
        },
    }

    failing_client = FailingFakeLLM(first_response=valid_intake_output)
    instrumented = InstrumentedLLMClient(failing_client)

    exit_code, _records = await execute_eval_suite(
        cases=cases,
        runs_per_case=3,
        client=instrumented,
        capture_handler=capture_handler,
        output_path=out_file,
        dry_mode=True,
    )

    # Assert quota abort code
    assert exit_code == 2, f"Expected quota abort exit code 2, got {exit_code}"
    assert out_file.exists(), f"Partial result file must be written on quota abort: {out_file}"

    data = json.loads(out_file.read_text(encoding="utf-8"))

    assert data["meta"]["aborted_due_to_quota"] is True
    assert data["meta"]["runs_requested"] == 3
    assert data["meta"]["total_runs_completed"] == 0  # Aborted mid-run before completion
