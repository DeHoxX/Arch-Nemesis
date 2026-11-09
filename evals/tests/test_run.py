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

DEFAULT_TITLE_OUTPUT: dict[str, Any] = {"title": "Support Chat Assistant"}


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

    # Structural metrics presence in run record
    assert "branch_count" in run_record
    assert "fan_in_count" in run_record
    assert "decision_node_count" in run_record
    assert "tech_options_total" in run_record
    assert "nodes_with_tech_options" in run_record
    assert "nodes_total" in run_record
    assert run_record["nodes_total"] == 3
    assert run_record["branch_count"] >= 0
    assert run_record["fan_in_count"] >= 0
    assert run_record["decision_node_count"] >= 0
    assert run_record["tech_options_total"] >= 0
    assert run_record["nodes_with_tech_options"] >= 0

    # Structural metrics presence in summary
    assert "avg_branch_count" in data["summary"]
    assert "avg_fan_in_count" in data["summary"]
    assert "avg_decision_node_count" in data["summary"]
    assert "tech_options_fill_rate" in data["summary"]
    assert "avg_tech_options_per_node" in data["summary"]

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

    script = [
        valid_intake,
        valid_spec,
        DEFAULT_TITLE_OUTPUT,
        invalid_draft_attempt_1,
        valid_draft_attempt_2,
    ]

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

    script = [valid_intake, valid_spec, DEFAULT_TITLE_OUTPUT, valid_draft_attempt_1]

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


def test_cli_pause_seconds_default() -> None:
    """Verify --pause-seconds CLI flag defaults to 8.0."""

    import argparse

    parser = argparse.ArgumentParser()

    parser.add_argument("--pause-seconds", type=float, default=8.0)

    args = parser.parse_args([])

    assert args.pause_seconds == 8.0


@pytest.mark.asyncio
async def test_pause_seconds_sleeps_between_runs_only(
    tmp_path: Path, repo_root_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Verify pause_seconds sleeps between runs and strictly not after the last run."""

    cases_dir = repo_root_path / "evals" / "cases"

    cases = load_eval_cases(cases_dir, only_case_id="support")

    out_file = tmp_path / "pause_test_results.json"

    event_collector = StructlogEventCollector()

    valid_intake = {
        "action": "ready",
        "questions": [],
        "brief": {
            "summary": "Support brief",
            "users": "Customers",
            "data_involved": ["chats"],
            "domain_hint": "support",
            "stated_constraints": [],
            "unverifiable_requirements": [],
            "numbers_given": [],
            "assumptions": [],
        },
    }

    valid_spec = {
        "nodes": [
            {
                "id": "gw",
                "name": "E",
                "type": "gateway",
                "role": "Entry",
                "inputs": [],
                "outputs": [],
                "needs_model": False,
                "ai_role": "none",
                "tools": [],
            },
            {
                "id": "cl",
                "name": "X",
                "type": "client",
                "role": "Exit",
                "inputs": [],
                "outputs": [],
                "needs_model": False,
                "ai_role": "none",
                "tools": [],
            },
        ],
        "edges": [{"from": "gw", "to": "cl", "flows": "data"}],
        "constraints": [],
        "entry_ids": ["gw"],
        "exit_ids": ["cl"],
    }

    valid_draft = {
        "overview": "Overview text.",
        "flow_steps": [
            {"node_id": "gw", "text": "Step 1."},
            {"node_id": "cl", "text": "Step 2."},
        ],
        "parts": [
            {"node_id": "gw", "text": "Part 1."},
            {"node_id": "cl", "text": "Part 2."},
        ],
        "checks": [],
        "models_text": "No models.",
    }

    script = [
        valid_intake,
        valid_spec,
        DEFAULT_TITLE_OUTPUT,
        valid_draft,
        valid_intake,
        valid_spec,
        DEFAULT_TITLE_OUTPUT,
        valid_draft,
    ]

    client = InstrumentedLLMClient(FakeLLMClient(script=script))

    sleep_calls: list[float] = []

    async def mock_sleep(seconds: float) -> None:

        sleep_calls.append(seconds)

    import asyncio

    monkeypatch.setattr(asyncio, "sleep", mock_sleep)

    exit_code, records = await execute_eval_suite(
        cases=cases,
        runs_per_case=2,
        client=client,
        event_collector=event_collector,
        output_path=out_file,
        dry_mode=True,
        pause_seconds=8.0,
    )

    assert exit_code == 0

    assert len(records) == 2

    assert sleep_calls == [8.0], f"Expected exactly [8.0], got {sleep_calls}"

    data = json.loads(out_file.read_text(encoding="utf-8"))

    assert data["meta"]["pause_seconds"] == 8.0


@pytest.mark.asyncio
async def test_429_retry_once_then_success(
    tmp_path: Path, repo_root_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Verify a 429 on first attempt parses retry delay, sleeps once, retries, and succeeds."""

    cases_dir = repo_root_path / "evals" / "cases"

    cases = load_eval_cases(cases_dir, only_case_id="support")

    out_file = tmp_path / "retry_429_success.json"

    event_collector = StructlogEventCollector()

    valid_intake = {
        "action": "ready",
        "questions": [],
        "brief": {
            "summary": "Support brief",
            "users": "Customers",
            "data_involved": ["chats"],
            "domain_hint": "support",
            "stated_constraints": [],
            "unverifiable_requirements": [],
            "numbers_given": [],
            "assumptions": [],
        },
    }

    valid_spec = {
        "nodes": [
            {
                "id": "gw",
                "name": "E",
                "type": "gateway",
                "role": "Entry",
                "inputs": [],
                "outputs": [],
                "needs_model": False,
                "ai_role": "none",
                "tools": [],
            },
            {
                "id": "cl",
                "name": "X",
                "type": "client",
                "role": "Exit",
                "inputs": [],
                "outputs": [],
                "needs_model": False,
                "ai_role": "none",
                "tools": [],
            },
        ],
        "edges": [{"from": "gw", "to": "cl", "flows": "data"}],
        "constraints": [],
        "entry_ids": ["gw"],
        "exit_ids": ["cl"],
    }

    valid_draft = {
        "overview": "Overview text.",
        "flow_steps": [
            {"node_id": "gw", "text": "Step 1."},
            {"node_id": "cl", "text": "Step 2."},
        ],
        "parts": [
            {"node_id": "gw", "text": "Part 1."},
            {"node_id": "cl", "text": "Part 2."},
        ],
        "checks": [],
        "models_text": "No models.",
    }

    class OnceRateLimitedClient(LLMClient):
        def __init__(self) -> None:

            self.call_count = 0

            self.inner = FakeLLMClient(
                script=[valid_intake, valid_spec, DEFAULT_TITLE_OUTPUT, valid_draft]
            )

        async def generate_text(self, task: LLMTask, system: str, user: str) -> str:

            self.call_count += 1

            return await self.inner.generate_text(task, system, user)

        async def generate_json(
            self, task: LLMTask, system: str, user: str, schema: type[BaseModel]
        ) -> dict[str, Any]:

            self.call_count += 1

            if self.call_count == 1:
                raise LLMRateLimited("Resource exhausted: retry in ~14 s")

            return await self.inner.generate_json(task, system, user, schema)

    client = InstrumentedLLMClient(OnceRateLimitedClient())

    sleep_calls: list[float] = []

    async def mock_sleep(seconds: float) -> None:

        sleep_calls.append(seconds)

    import asyncio

    monkeypatch.setattr(asyncio, "sleep", mock_sleep)

    exit_code, records = await execute_eval_suite(
        cases=cases,
        runs_per_case=1,
        client=client,
        event_collector=event_collector,
        output_path=out_file,
        dry_mode=True,
        pause_seconds=0.0,
    )

    assert exit_code == 0

    assert len(records) == 1

    assert records[0].success is True

    assert 15.0 in sleep_calls, f"Expected 15.0s sleep, got {sleep_calls}"


@pytest.mark.asyncio
async def test_429_twice_aborts_with_partial_results(
    tmp_path: Path, repo_root_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Verify that two consecutive 429 errors in the same run triggers quota abort with exit code 2."""

    cases_dir = repo_root_path / "evals" / "cases"

    cases = load_eval_cases(cases_dir, only_case_id="support")

    out_file = tmp_path / "twice_429_abort.json"

    event_collector = StructlogEventCollector()

    class PersistentRateLimitedClient(LLMClient):
        def __init__(self) -> None:

            self.call_count = 0

        async def generate_text(self, task: LLMTask, system: str, user: str) -> str:

            self.call_count += 1

            raise LLMRateLimited("Rate limit exceeded")

        async def generate_json(
            self, task: LLMTask, system: str, user: str, schema: type[BaseModel]
        ) -> dict[str, Any]:

            self.call_count += 1

            raise LLMRateLimited("Rate limit exceeded")

    client = InstrumentedLLMClient(PersistentRateLimitedClient())

    async def mock_sleep(_seconds: float) -> None:

        pass

    import asyncio

    monkeypatch.setattr(asyncio, "sleep", mock_sleep)

    exit_code, records = await execute_eval_suite(
        cases=cases,
        runs_per_case=1,
        client=client,
        event_collector=event_collector,
        output_path=out_file,
        dry_mode=True,
    )

    assert exit_code == 2

    assert len(records) == 0

    assert out_file.exists()

    data = json.loads(out_file.read_text(encoding="utf-8"))

    assert data["meta"]["aborted_due_to_quota"] is True


@pytest.mark.asyncio
async def test_422_design_failure_captures_none_and_design_issues(
    tmp_path: Path, repo_root_path: Path
) -> None:
    """Verify that a 422 design failure records explainer_source='none' and captures design issues."""

    cases_dir = repo_root_path / "evals" / "cases"

    cases = load_eval_cases(cases_dir, only_case_id="support")

    out_file = tmp_path / "design_422_results.json"

    event_collector = StructlogEventCollector()

    valid_intake = {
        "action": "ready",
        "questions": [],
        "brief": {
            "summary": "Support brief",
            "users": "Customers",
            "data_involved": ["chats"],
            "domain_hint": "support",
            "stated_constraints": [],
            "unverifiable_requirements": [],
            "numbers_given": [],
            "assumptions": [],
        },
    }

    cyclic_spec = {
        "nodes": [
            {
                "id": "na",
                "name": "Node A",
                "type": "service",
                "role": "A",
                "inputs": [],
                "outputs": [],
                "needs_model": False,
                "ai_role": "none",
                "tools": [],
            },
            {
                "id": "nb",
                "name": "Node B",
                "type": "service",
                "role": "B",
                "inputs": [],
                "outputs": [],
                "needs_model": False,
                "ai_role": "none",
                "tools": [],
            },
        ],
        "edges": [
            {"from": "na", "to": "nb", "flows": "flow1"},
            {"from": "nb", "to": "na", "flows": "flow2"},
        ],
        "constraints": [],
        "entry_ids": ["na"],
        "exit_ids": ["nb"],
    }

    script = [valid_intake, cyclic_spec, cyclic_spec, cyclic_spec]

    client = InstrumentedLLMClient(FakeLLMClient(script=script))

    exit_code, records = await execute_eval_suite(
        cases=cases,
        runs_per_case=1,
        client=client,
        event_collector=event_collector,
        output_path=out_file,
        dry_mode=True,
    )

    assert exit_code == 0

    assert len(records) == 1

    rec = records[0]

    assert rec.is_422 is True

    assert rec.success is False

    assert rec.final_pass is False

    assert rec.explainer_source == "none", (
        f"Expected explainer_source 'none', got {rec.explainer_source}"
    )

    assert "E_CYCLE" in rec.design_attempt_issues, (
        f"Expected E_CYCLE in design issues, got {rec.design_attempt_issues}"
    )

    data = json.loads(out_file.read_text(encoding="utf-8"))

    assert data["summary"]["failure_422_rate"] == 1.0

    assert data["summary"]["fallback_rate"] == 0.0, (
        f"Expected fallback_rate 0.0 when 422 occurred, got {data['summary']['fallback_rate']}"
    )

    assert data["summary"]["design_issue_counts"].get("E_CYCLE", 0) >= 1


def test_all_spec_fixtures_pass_parse_and_validate() -> None:
    """Every spec fixture used in test_run.py must pass parse_and_validate (non-empty guard).



    This catches 1-char node IDs and other schema violations before they silently

    produce E_SCHEMA instead of the intended error (e.g., E_CYCLE) in runner tests.

    """

    from archnemesis.modules.validation import Limits, parse_and_validate
    from archnemesis.settings import get_settings

    settings = get_settings()

    limits = Limits(max_nodes=settings.max_nodes, max_edges=settings.max_edges)

    # Valid spec used in test_pause_seconds_sleeps_between_runs_only and

    # test_429_retry_once_then_success (gateway "gw" -> client "cl").

    valid_spec = {
        "nodes": [
            {
                "id": "gw",
                "name": "Gateway",
                "type": "gateway",
                "role": "Entry",
                "inputs": [],
                "outputs": [],
                "needs_model": False,
                "ai_role": "none",
                "tools": [],
            },
            {
                "id": "cl",
                "name": "Client",
                "type": "client",
                "role": "Exit",
                "inputs": [],
                "outputs": [],
                "needs_model": False,
                "ai_role": "none",
                "tools": [],
            },
        ],
        "edges": [{"from": "gw", "to": "cl", "flows": "data"}],
        "constraints": [],
        "entry_ids": ["gw"],
        "exit_ids": ["cl"],
    }

    # Cyclic spec used in test_422_design_failure_captures_none_and_design_issues.

    cyclic_spec = {
        "nodes": [
            {
                "id": "na",
                "name": "Node A",
                "type": "service",
                "role": "A",
                "inputs": [],
                "outputs": [],
                "needs_model": False,
                "ai_role": "none",
                "tools": [],
            },
            {
                "id": "nb",
                "name": "Node B",
                "type": "service",
                "role": "B",
                "inputs": [],
                "outputs": [],
                "needs_model": False,
                "ai_role": "none",
                "tools": [],
            },
        ],
        "edges": [
            {"from": "na", "to": "nb", "flows": "flow1"},
            {"from": "nb", "to": "na", "flows": "flow2"},
        ],
        "constraints": [],
        "entry_ids": ["na"],
        "exit_ids": ["nb"],
    }

    # valid_spec: must parse without schema errors (structural errors like E_CYCLE are OK).

    spec, result = parse_and_validate(valid_spec, brief_constraints={}, limits=limits)

    assert spec is not None, f"valid_spec failed to parse: {result.errors}"

    schema_errors = [e for e in result.errors if e.code == "E_SCHEMA"]

    assert schema_errors == [], f"valid_spec produced unexpected E_SCHEMA: {schema_errors}"

    # cyclic_spec: must parse but is expected to have E_CYCLE (not E_SCHEMA).

    spec2, result2 = parse_and_validate(cyclic_spec, brief_constraints={}, limits=limits)

    assert spec2 is not None, f"cyclic_spec failed to parse (schema error): {result2.errors}"

    schema_errors2 = [e for e in result2.errors if e.code == "E_SCHEMA"]

    assert schema_errors2 == [], f"cyclic_spec produced unexpected E_SCHEMA: {schema_errors2}"

    cycle_errors = [e for e in result2.errors if e.code == "E_CYCLE"]

    assert cycle_errors, f"cyclic_spec expected E_CYCLE but got: {[e.code for e in result2.errors]}"


@pytest.mark.asyncio
async def test_per_attempt_diagnostics_stored_on_422(tmp_path: Path) -> None:
    """Stage 422c: per-attempt records and code repair events are stored on 422 failure."""

    out_file = tmp_path / "eval_out.json"

    event_collector = StructlogEventCollector()

    case = {
        "id": "diag_test",
        "need_text": "Customer support pipeline",
        "followup_answers": [],
        "expect": {
            "min_nodes": 2,
            "max_nodes": 20,
            "must_have_constraint_kinds": [],
        },
    }

    from archnemesis.modules.intake.schemas import IntakeLLMOutput
    from archnemesis.modules.intake.service import _validate_llm_output

    brief_sentinel = "BRIEF_USER_SENTINEL_ALPHA_999"

    valid_intake = {
        "action": "ready",
        "questions": [],
        "brief": {
            "summary": "Support chatbot with reviewer step",
            "users": "Customers",
            "data_involved": ["chats"],
            "domain_hint": "support",
            "stated_constraints": [f"Must pass through reviewer {brief_sentinel}"],
            "unverifiable_requirements": [],
            "numbers_given": [],
            "assumptions": [],
        },
    }

    # Guard: assert valid_intake validates through IntakeLLMOutput and _validate_llm_output
    validated_intake = IntakeLLMOutput.model_validate(valid_intake)
    is_valid_intake, reason_intake = _validate_llm_output(validated_intake, must_be_ready=False)
    assert is_valid_intake, f"valid_intake failed validation: {reason_intake}"

    # Cyclic spec fails with E_CYCLE across all 3 architect calls
    cyclic_spec = {
        "nodes": [
            {
                "id": "na",
                "name": "Node A",
                "type": "service",
                "role": "Worker A",
                "inputs": [],
                "outputs": [],
                "needs_model": False,
                "ai_role": "none",
                "tools": [],
            },
            {
                "id": "nb",
                "name": "Node B",
                "type": "service",
                "role": "Worker B",
                "inputs": [],
                "outputs": [],
                "needs_model": False,
                "ai_role": "none",
                "tools": [],
            },
        ],
        "edges": [
            {"from": "na", "to": "nb", "flows": "f1"},
            {"from": "nb", "to": "na", "flows": "f2"},
        ],
        "constraints": [],
        "entry_ids": ["na"],
        "exit_ids": ["nb"],
    }

    script = [valid_intake, cyclic_spec, cyclic_spec, cyclic_spec]
    client = InstrumentedLLMClient(FakeLLMClient(script=script))

    exit_code, records = await execute_eval_suite(
        cases=[case],
        runs_per_case=1,
        client=client,
        event_collector=event_collector,
        output_path=out_file,
        dry_mode=True,
    )

    assert exit_code == 0
    assert len(records) == 1
    rec = records[0]

    # Non-empty guards
    assert rec.is_422 is True
    assert len(rec.design_attempts) >= 1
    for att in rec.design_attempts:
        assert "attempt" in att
        assert "issue_codes" in att
        assert "constraint_kinds" in att
        assert "issue_messages" in att
        # Sentinel must never appear in any stored issue message (no user brief text leakage)
        for msg in att["issue_messages"]:
            assert brief_sentinel not in msg

    # Final attempt on 422 must have sanitized issue messages matching real template wording
    final_att = rec.design_attempts[-1]
    assert len(final_att["issue_messages"]) >= 1
    # checks.py:176 message: "The flow loops back on itself through: ..."
    assert any("loops back" in m.lower() for m in final_att["issue_messages"])


def test_sanitize_validator_message_truncation_and_sentinel_stripping() -> None:
    """Stage 422c: validator messages are truncated to 300 chars and user-text sentinels stripped."""

    from evals.run import sanitize_validator_message

    sentinel = "SECRET_USER_TEXT_SENTINEL_987654321"

    raw_message = (
        f"Rule not satisfied: {sentinel} "
        + "x" * 400
        + " (a path reaches 'delivery_endpoint' without passing through 'reviewer': gateway > reviewer_node > delivery_endpoint)."
    )

    sanitized = sanitize_validator_message(raw_message)

    # Non-empty guard

    assert len(sanitized) > 0

    # Sentinel must be stripped

    assert sentinel not in sanitized

    # Must be truncated to at most 300 chars

    assert len(sanitized) <= 300

    # Must preserve the fixed prefix and witness path

    assert sanitized.startswith("Rule not satisfied (")


def test_old_result_file_without_new_fields_loads_in_compare_py(tmp_path: Path) -> None:
    """Stage 422c: old result JSON files lacking design_attempts load cleanly in compare.py."""

    from evals.compare import compare_runs, load_result_file
    from evals.metrics import CaseRunRecord

    # Minimal old run record without design_attempts

    old_record_dict = {
        "case_id": "test_case",
        "run_index": 1,
        "success": True,
        "attempt_1_pass": True,
        "final_pass": True,
        "is_422": False,
        "code_repair_used": False,
        "prompt_version": "architect_v5",
        "node_count": 5,
        "edge_count": 4,
        "ai_node_count": 1,
        "agent_count": 0,
        "w_merge_as_agent_count": 0,
        "w_no_ai_node_count": 0,
    }

    rec = CaseRunRecord.from_dict(old_record_dict)

    assert rec.case_id == "test_case"

    assert rec.design_attempts == []  # default factory works

    old_file_content = {
        "meta": {"timestamp": "20261101-1200", "runner_version": "1.0"},
        "summary": {
            "total_runs": 1,
            "failure_422_rate": 0.0,
            "fallback_rate": 0.0,
            "by_case": {
                "test_case": {
                    "total_runs": 1,
                    "failure_422_rate": 0.0,
                    "fallback_rate": 0.0,
                }
            },
        },
        "runs": [old_record_dict],
    }

    file_a = tmp_path / "old_a.json"

    file_b = tmp_path / "old_b.json"

    file_a.write_text(json.dumps(old_file_content), encoding="utf-8")

    file_b.write_text(json.dumps(old_file_content), encoding="utf-8")

    data_a = load_result_file(file_a)

    data_b = load_result_file(file_b)

    table, _diffs = compare_runs(data_a, data_b)

    assert len(table) > 0

    assert "ARCH-NEMESIS EVALUATION COMPARISON" in table


def test_expected_constraints_rate_excludes_422_runs() -> None:
    """Stage 422e: 422 runs have expected_constraints_applicable=False and are excluded from denominator."""
    from evals.metrics import CaseRunRecord, aggregate_case_runs

    # Case with 2 runs: 1 422 run, 1 successful run with expected constraints satisfied
    run_422 = CaseRunRecord(
        case_id="finance",
        run_index=1,
        success=False,
        attempt_1_pass=False,
        final_pass=False,
        is_422=True,
        code_repair_used=False,
        prompt_version="architect_v7",
        node_count=0,
        edge_count=0,
        ai_node_count=0,
        agent_count=0,
        w_merge_as_agent_count=0,
        w_no_ai_node_count=0,
        error_codes=["E_CONSTRAINT_VIOLATED"],
        expected_constraints_satisfied=False,
        expected_constraints_applicable=False,
        within_node_bounds=True,
    )
    run_success = CaseRunRecord(
        case_id="finance",
        run_index=2,
        success=True,
        attempt_1_pass=True,
        final_pass=True,
        is_422=False,
        code_repair_used=False,
        prompt_version="architect_v7",
        node_count=5,
        edge_count=6,
        ai_node_count=1,
        agent_count=0,
        w_merge_as_agent_count=0,
        w_no_ai_node_count=0,
        constraint_kinds_found=["must_pass_through"],
        expected_constraints_satisfied=True,
        expected_constraints_applicable=True,
        within_node_bounds=True,
        final_constraints=[
            {
                "id": "c1",
                "kind": "must_pass_through",
                "node_id": "na",
                "a": None,
                "b": None,
                "covers": ["bc1"],
            }
        ],
    )

    # Non-empty guard
    assert len([run_422, run_success]) == 2
    agg = aggregate_case_runs("finance", [run_422, run_success])
    # Applicable runs = 1, satisfied = 1 -> rate must be 1.0 (not 0.5 or 2/2)
    assert agg.expected_constraints_rate == 1.0


def test_old_record_without_new_fields_loads_and_back_compat() -> None:
    """Stage 422e: old serialized record missing expected_constraints_applicable and final_constraints loads cleanly."""
    from evals.metrics import CaseRunRecord

    old_data = {
        "case_id": "legal",
        "run_index": 1,
        "success": True,
        "attempt_1_pass": True,
        "final_pass": True,
        "is_422": False,
        "code_repair_used": False,
        "prompt_version": "architect_v6",
        "node_count": 4,
        "edge_count": 4,
        "ai_node_count": 1,
        "agent_count": 0,
        "w_merge_as_agent_count": 0,
        "w_no_ai_node_count": 0,
        "expected_constraints_satisfied": True,
    }
    rec = CaseRunRecord.from_dict(old_data)
    # Non-empty guards and defaults
    assert rec.case_id == "legal"
    assert rec.expected_constraints_applicable is True
    assert rec.final_constraints == []


def test_final_constraints_contains_structural_fields_only_no_text() -> None:
    """Stage 422e: final_constraints entries have id, kind, node_id, a, b, covers and NO user text or prompt text."""
    from evals.metrics import CaseRunRecord

    item = {
        "id": "c1",
        "kind": "must_precede",
        "node_id": None,
        "a": "na",
        "b": "nb",
        "covers": ["bc1"],
    }
    # Non-empty guards
    assert len(item["id"]) >= 2
    assert "text" not in item
    assert "prompt" not in item
    assert "brief" not in item

    rec = CaseRunRecord(
        case_id="legal",
        run_index=1,
        success=True,
        attempt_1_pass=True,
        final_pass=True,
        is_422=False,
        code_repair_used=False,
        prompt_version="architect_v7",
        node_count=3,
        edge_count=2,
        ai_node_count=0,
        agent_count=0,
        w_merge_as_agent_count=0,
        w_no_ai_node_count=0,
        final_constraints=[item],
    )
    assert len(rec.final_constraints) == 1
    fc = rec.final_constraints[0]
    assert set(fc.keys()) == {"id", "kind", "node_id", "a", "b", "covers"}


def test_recompute_metrics_gives_expected_numbers_on_synthetic_data(tmp_path: Path) -> None:
    """Stage 422e: recompute_metrics computes correct honest rates from synthetic file with mixed 422s."""
    import json

    from evals.recompute_metrics import recompute_result_metrics

    synth_file = tmp_path / "synthetic_result.json"
    data = {
        "meta": {"test": True},
        "summary": {"by_case": {"finance": {"expected_constraints_rate": 0.8}}},
        "runs": [
            # Run 1: 422 failure (old files had satisfied=True, but should be excluded from denominator)
            {
                "case_id": "finance",
                "run_index": 1,
                "is_422": True,
                "expected_constraints_satisfied": True,
            },
            # Run 2: Success, satisfied
            {
                "case_id": "finance",
                "run_index": 2,
                "is_422": False,
                "expected_constraints_satisfied": True,
            },
            # Run 3: Success, not satisfied
            {
                "case_id": "finance",
                "run_index": 3,
                "is_422": False,
                "expected_constraints_satisfied": False,
            },
        ],
    }
    synth_file.write_text(json.dumps(data), encoding="utf-8")

    res = recompute_result_metrics(synth_file)
    # Non-empty guard
    assert res["total_runs"] == 3
    assert res["overall_422"] == 1
    assert res["overall_applicable"] == 2
    assert res["overall_satisfied"] == 1
    # 1 satisfied / 2 applicable = 0.5
    assert res["overall_new_rate"] == 0.5
    f_stats = res["by_case"]["finance"]
    assert f_stats["422_count"] == 1
    assert f_stats["applicable_runs"] == 2
    assert f_stats["satisfied_runs"] == 1
    assert f_stats["new_rate"] == 0.5


def test_dry_run_with_custom_cases_flag(tmp_path: Path, repo_root_path: Path) -> None:
    """Verify evals/run.py --dry executes cleanly when pointing --cases to a file or custom directory."""
    cases_dir = repo_root_path / "evals" / "cases"
    vague_case = cases_dir / "vague.json"
    out_file = tmp_path / "dry_cases_results.json"

    exit_code = main(
        [
            "--dry",
            "--runs",
            "1",
            "--cases",
            str(vague_case),
            "--out",
            str(out_file),
        ]
    )

    assert exit_code == 0
    assert out_file.exists()
    with open(out_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    assert len(data["runs"]) == 1
    assert data["runs"][0]["case_id"] == "vague"
    assert "avg_edge_count" in data["summary"]
    assert "avg_agents" in data["summary"]


def test_dry_run_records_structural_metrics(tmp_path: Path, repo_root_path: Path) -> None:
    """Verify structural graph metrics (branch_count, tech_options) are accurately populated in runs and summary."""
    cases_dir = repo_root_path / "evals" / "cases"
    support_case = cases_dir / "support.json"
    out_file = tmp_path / "structural_results.json"

    exit_code = main(
        [
            "--dry",
            "--runs",
            "1",
            "--cases",
            str(support_case),
            "--out",
            str(out_file),
        ]
    )

    assert exit_code == 0
    assert out_file.exists()
    with open(out_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    # 1. Individual run record metrics
    runs = data.get("runs", [])
    assert len(runs) == 1
    run0 = runs[0]
    assert run0["case_id"] == "support"
    assert run0["success"] is True

    # Check structural metric types and non-negative integers
    for metric_key in [
        "branch_count",
        "fan_in_count",
        "decision_node_count",
        "tech_options_total",
        "nodes_with_tech_options",
        "nodes_total",
    ]:
        assert metric_key in run0
        assert isinstance(run0[metric_key], int)
        assert run0[metric_key] >= 0

    assert run0["nodes_total"] == run0["node_count"]

    # 2. Aggregated summary metrics
    summary = data.get("summary", {})
    for summary_key in [
        "avg_branch_count",
        "avg_fan_in_count",
        "avg_decision_node_count",
        "avg_tech_options_per_node",
        "tech_options_fill_rate",
    ]:
        assert summary_key in summary
        assert isinstance(summary[summary_key], (float, int))
        assert summary[summary_key] >= 0.0

    # 3. By-case breakdown
    case_summary = data.get("by_case", {}).get("support", {})
    assert "avg_branch_count" in case_summary
    assert "tech_options_fill_rate" in case_summary
