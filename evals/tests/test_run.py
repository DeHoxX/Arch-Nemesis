"""Unit tests for the evaluation runner (evals/run.py) using FakeLLMClient."""

import json
from pathlib import Path
from typing import Any

import pytest
from evals.run import (
    InstrumentedLLMClient,
    StructlogEventCollector,
    execute_eval_suite,
    load_eval_cases,
    main,
)
from pydantic import BaseModel

from archnemesis.llm.base import LLMClient, LLMRateLimited, LLMTask
from archnemesis.llm.fake import FakeLLMClient


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
    event_collector = StructlogEventCollector()

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
        event_collector=event_collector,
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


@pytest.mark.asyncio
async def test_run_captures_explainer_retry_and_issue_codes(
    tmp_path: Path, repo_root_path: Path
) -> None:
    """Verify that explainer retry issues (e.g. X_FORBIDDEN_WORD) are captured in record and summary."""
    cases_dir = repo_root_path / "evals" / "cases"
    cases = load_eval_cases(cases_dir, only_case_id="support")
    assert len(cases) == 1

    out_file = tmp_path / "retry_issue_results.json"
    event_collector = StructlogEventCollector()

    # Step 1: Valid Intake
    valid_intake = {
        "action": "ready",
        "questions": [],
        "brief": {
            "summary": "Support chatbot with reviewer step",
            "users": "Customers",
            "data_involved": ["chats"],
            "domain_hint": "support",
            "stated_constraints": ["Must pass through reviewer"],
            "unverifiable_requirements": [],
            "numbers_given": [],
            "assumptions": [],
        },
    }

    # Step 2: Valid Architect DAG
    valid_spec = {
        "nodes": [
            {
                "id": "entry_chat",
                "name": "Chat Gateway",
                "type": "api_gateway",
                "role": "Receives chats",
                "inputs": ["user_chat"],
                "outputs": ["chat_request"],
                "needs_model": False,
                "ai_role": "none",
                "tools": [],
            },
            {
                "id": "reviewer_node",
                "name": "Answer Reviewer",
                "type": "validator",
                "role": "Reviews answers",
                "inputs": ["chat_request"],
                "outputs": ["approved_answer"],
                "needs_model": True,
                "ai_role": "model",
                "tools": [],
            },
            {
                "id": "exit_client",
                "name": "Chat Response",
                "type": "client",
                "role": "Sends answers",
                "inputs": ["approved_answer"],
                "outputs": ["rendered_response"],
                "needs_model": False,
                "ai_role": "none",
                "tools": [],
            },
        ],
        "edges": [
            {"from": "entry_chat", "to": "reviewer_node", "flows": "chat query"},
            {"from": "reviewer_node", "to": "exit_client", "flows": "reviewed answer"},
        ],
        "constraints": [
            {
                "id": "c1",
                "text": "Must pass through reviewer",
                "kind": "must_pass_through",
                "node_id": "reviewer_node",
                "covers": ["bc1"],
            }
        ],
        "entry_ids": ["entry_chat"],
        "exit_ids": ["exit_client"],
    }

    # Step 3: Attempt 1 explainer draft with forbidden word "cost"
    invalid_draft_attempt_1 = {
        "overview": "This support assistant minimizes overall cost for operations.",
        "flow_steps": [
            {"node_id": "entry_chat", "text": "Receives chat."},
            {"node_id": "reviewer_node", "text": "Reviews chat."},
            {"node_id": "exit_client", "text": "Delivers answer."},
        ],
        "parts": [
            {"node_id": "entry_chat", "text": "Entry interface."},
            {"node_id": "reviewer_node", "text": "Reviewer component."},
            {"node_id": "exit_client", "text": "Exit interface."},
        ],
        "checks": [{"constraint_id": "c1", "text": "Reviewer gate."}],
        "models_text": "Uses a reviewer model.",
    }

    # Step 4: Attempt 2 explainer draft without forbidden words
    valid_draft_attempt_2 = {
        "overview": "This support assistant reviews answers before delivery.",
        "flow_steps": [
            {"node_id": "entry_chat", "text": "Receives chat."},
            {"node_id": "reviewer_node", "text": "Reviews chat."},
            {"node_id": "exit_client", "text": "Delivers answer."},
        ],
        "parts": [
            {"node_id": "entry_chat", "text": "Entry interface."},
            {"node_id": "reviewer_node", "text": "Reviewer component."},
            {"node_id": "exit_client", "text": "Exit interface."},
        ],
        "checks": [{"constraint_id": "c1", "text": "Reviewer gate."}],
        "models_text": "Uses a reviewer model.",
    }

    script = [valid_intake, valid_spec, invalid_draft_attempt_1, valid_draft_attempt_2]
    fake_client = FakeLLMClient(script=script)
    instrumented = InstrumentedLLMClient(fake_client)

    exit_code, records = await execute_eval_suite(
        cases=cases,
        runs_per_case=1,
        client=instrumented,
        event_collector=event_collector,
        output_path=out_file,
        dry_mode=True,
    )

    assert exit_code == 0
    assert len(records) == 1, "Expected 1 completed record"

    rec = records[0]
    assert rec.success is True
    assert rec.explainer_source == "llm"
    assert rec.explainer_attempt == 2, f"Expected attempt 2, got {rec.explainer_attempt}"
    assert "X_FORBIDDEN_WORD" in rec.explainer_issues, (
        f"Missing X_FORBIDDEN_WORD in issues: {rec.explainer_issues}"
    )
    assert "X_FORBIDDEN_WORD" in rec.explainer_attempt_1_issues
    assert len(rec.explainer_issues) > 0, "Explainer issues list should not be empty"

    # Verify that results JSON aggregates the issue code into by_case.support.issue_counts
    data = json.loads(out_file.read_text(encoding="utf-8"))
    issue_counts = data["summary"]["by_case"]["support"]["issue_counts"]
    assert issue_counts.get("X_FORBIDDEN_WORD") == 1, (
        f"Expected issue_counts['X_FORBIDDEN_WORD'] == 1, got {issue_counts}"
    )


@pytest.mark.asyncio
async def test_run_explainer_attempt_1_clean_pass(tmp_path: Path, repo_root_path: Path) -> None:
    """Verify that a clean attempt 1 explanation records explainer_attempt == 1 and no issues."""
    cases_dir = repo_root_path / "evals" / "cases"
    cases = load_eval_cases(cases_dir, only_case_id="support")
    assert len(cases) == 1

    out_file = tmp_path / "clean_attempt1_results.json"
    event_collector = StructlogEventCollector()

    valid_intake = {
        "action": "ready",
        "questions": [],
        "brief": {
            "summary": "Support chatbot with reviewer step",
            "users": "Customers",
            "data_involved": ["chats"],
            "domain_hint": "support",
            "stated_constraints": ["Must pass through reviewer"],
            "unverifiable_requirements": [],
            "numbers_given": [],
            "assumptions": [],
        },
    }

    valid_spec = {
        "nodes": [
            {
                "id": "entry_chat",
                "name": "Chat Gateway",
                "type": "api_gateway",
                "role": "Receives chats",
                "inputs": ["user_chat"],
                "outputs": ["chat_request"],
                "needs_model": False,
                "ai_role": "none",
                "tools": [],
            },
            {
                "id": "reviewer_node",
                "name": "Answer Reviewer",
                "type": "validator",
                "role": "Reviews answers",
                "inputs": ["chat_request"],
                "outputs": ["approved_answer"],
                "needs_model": True,
                "ai_role": "model",
                "tools": [],
            },
            {
                "id": "exit_client",
                "name": "Chat Response",
                "type": "client",
                "role": "Sends answers",
                "inputs": ["approved_answer"],
                "outputs": ["rendered_response"],
                "needs_model": False,
                "ai_role": "none",
                "tools": [],
            },
        ],
        "edges": [
            {"from": "entry_chat", "to": "reviewer_node", "flows": "chat query"},
            {"from": "reviewer_node", "to": "exit_client", "flows": "reviewed answer"},
        ],
        "constraints": [
            {
                "id": "c1",
                "text": "Must pass through reviewer",
                "kind": "must_pass_through",
                "node_id": "reviewer_node",
                "covers": ["bc1"],
            }
        ],
        "entry_ids": ["entry_chat"],
        "exit_ids": ["exit_client"],
    }

    valid_draft_attempt_1 = {
        "overview": "This support assistant reviews answers before delivery.",
        "flow_steps": [
            {"node_id": "entry_chat", "text": "Receives chat."},
            {"node_id": "reviewer_node", "text": "Reviews chat."},
            {"node_id": "exit_client", "text": "Delivers answer."},
        ],
        "parts": [
            {"node_id": "entry_chat", "text": "Entry interface."},
            {"node_id": "reviewer_node", "text": "Reviewer component."},
            {"node_id": "exit_client", "text": "Exit interface."},
        ],
        "checks": [{"constraint_id": "c1", "text": "Reviewer gate."}],
        "models_text": "Uses a reviewer model.",
    }

    script = [valid_intake, valid_spec, valid_draft_attempt_1]
    fake_client = FakeLLMClient(script=script)
    instrumented = InstrumentedLLMClient(fake_client)

    exit_code, records = await execute_eval_suite(
        cases=cases,
        runs_per_case=1,
        client=instrumented,
        event_collector=event_collector,
        output_path=out_file,
        dry_mode=True,
    )

    assert exit_code == 0
    assert len(records) == 1, "Expected 1 completed record"

    rec = records[0]
    assert rec.success is True
    assert rec.explainer_source == "llm"
    assert rec.explainer_attempt == 1, f"Expected attempt 1, got {rec.explainer_attempt}"
    assert len(rec.explainer_issues) == 0, (
        f"Expected 0 issues on clean pass, got {rec.explainer_issues}"
    )
    assert len(rec.explainer_attempt_1_issues) == 0
    assert len(rec.explainer_attempt_2_issues) == 0

    # Non-empty guards on output JSON
    data = json.loads(out_file.read_text(encoding="utf-8"))
    assert data["summary"]["by_case"]["support"]["total_runs"] == 1
    assert data["summary"]["by_case"]["support"]["fallback_rate"] == 0.0
    assert len(data["runs"]) == 1
