"""Arch-Nemesis On-Demand Evaluation Runner.

Runs fixed evaluation cases sequentially against Google Gemini (or FakeLLM in --dry mode),
capturing structural validity, lint warnings, repair loops, explainer verification issues,
and wall-clock performance without polluting the local development database.

Usage:
    uv run --project apps/api python evals/run.py [--runs N] [--only CASE_ID] [--dry] [--out PATH]
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
import tempfile
import time
from datetime import datetime
from pathlib import Path
from typing import Any

# Ensure repository root and apps/api/src are on sys.path
repo_root = Path(__file__).resolve().parent.parent
api_src = repo_root / "apps" / "api" / "src"
if str(api_src) not in sys.path:
    sys.path.insert(0, str(api_src))
if str(repo_root) not in sys.path:
    sys.path.insert(0, str(repo_root))

from evals.metrics import (
    CaseRunRecord,
    aggregate_eval_runs,
)
from pydantic import BaseModel

from archnemesis.db.engine import create_engine_and_session
from archnemesis.db.tables import Base
from archnemesis.errors import DesignFailedError
from archnemesis.llm.base import (
    LLMClient,
    LLMRateLimited,
    LLMTask,
    LLMUnavailable,
)
from archnemesis.llm.fake import FakeLLMClient
from archnemesis.llm.gemini import GeminiClient
from archnemesis.modules.architect.service import ARCHITECT_PROMPT_NAME
from archnemesis.modules.designs.schemas import CreateDesignRequest
from archnemesis.modules.designs.service import create_design
from archnemesis.modules.explainer.service import (
    EXPLAINER_PROMPT_NAME,
    get_or_generate_explanation,
)
from archnemesis.modules.intake.schemas import IntakeTurnRequest
from archnemesis.modules.intake.service import handle_turn
from archnemesis.modules.validation.lints import check_lints
from archnemesis.settings import get_settings


class StructlogCaptureHandler(logging.Handler):
    """In-memory logging handler capturing structlog JSON events."""

    def __init__(self) -> None:
        super().__init__(level=logging.INFO)
        self.events: list[dict[str, Any]] = []

    def emit(self, record: logging.LogRecord) -> None:
        msg = record.getMessage()
        try:
            parsed = json.loads(msg)
            if isinstance(parsed, dict) and "event" in parsed:
                self.events.append(parsed)
        except (json.JSONDecodeError, ValueError):
            pass

    def clear(self) -> None:
        self.events.clear()


class InstrumentedLLMClient(LLMClient):
    """Wraps an LLMClient to count invocations without modifying production code."""

    def __init__(self, inner: LLMClient) -> None:
        self.inner = inner
        self.call_count = 0

    async def generate_text(self, task: LLMTask, system: str, user: str) -> str:
        self.call_count += 1
        return await self.inner.generate_text(task, system, user)

    async def generate_json(
        self, task: LLMTask, system: str, user: str, schema: type[BaseModel]
    ) -> dict[str, Any]:
        self.call_count += 1
        return await self.inner.generate_json(task, system, user, schema)


def load_eval_cases(cases_dir: Path, only_case_id: str | None = None) -> list[dict[str, Any]]:
    """Load evaluation cases from JSON files."""
    if not cases_dir.exists():
        raise FileNotFoundError(f"Cases directory not found: {cases_dir}")

    cases: list[dict[str, Any]] = []
    for file_path in sorted(cases_dir.glob("*.json")):
        with open(file_path, "r", encoding="utf-8") as f:
            case_data = json.load(f)
        if only_case_id is None or case_data.get("id") == only_case_id:
            cases.append(case_data)

    if only_case_id and not cases:
        raise ValueError(f"Case '{only_case_id}' not found in {cases_dir}")

    return cases


def build_dry_run_script(cases: list[dict[str, Any]], runs_count: int) -> list[dict[str, Any]]:
    """Construct deterministic scripted responses for FakeLLMClient in --dry mode."""
    script: list[dict[str, Any]] = []

    for case in cases:
        cid = case.get("id", "dry_case")
        must_have = case.get("expect", {}).get("must_have_constraint_kinds", [])
        has_must_pass = "must_pass_through" in must_have

        constraints_list = []
        if has_must_pass:
            constraints_list.append(
                {
                    "id": "c1",
                    "text": "Requests must pass through validator",
                    "kind": "must_pass_through",
                    "node_id": "val_node",
                    "covers": ["bc1"],
                }
            )

        intake_output = {
            "action": "ready",
            "questions": [],
            "brief": {
                "summary": f"Dry run brief for {cid}",
                "users": "Team members and operators",
                "data_involved": ["records", "payloads"],
                "domain_hint": "general",
                "stated_constraints": ["Must pass through validator"] if has_must_pass else [],
                "unverifiable_requirements": [],
                "numbers_given": [],
                "assumptions": [],
            },
        }

        architect_spec = {
            "nodes": [
                {
                    "id": "entry_gw",
                    "name": "Entry Gateway",
                    "type": "api_gateway",
                    "role": "Receives incoming requests",
                    "inputs": ["raw_request"],
                    "outputs": ["processed_request"],
                    "needs_model": False,
                    "ai_role": "none",
                    "tools": [],
                },
                {
                    "id": "val_node",
                    "name": "Validator Component",
                    "type": "validator",
                    "role": "Inspects and validates request",
                    "inputs": ["processed_request"],
                    "outputs": ["validated_request"],
                    "needs_model": True,
                    "ai_role": "model",
                    "tools": [],
                },
                {
                    "id": "exit_db",
                    "name": "Storage Database",
                    "type": "database",
                    "role": "Stores output records",
                    "inputs": ["validated_request"],
                    "outputs": ["persisted_record"],
                    "needs_model": False,
                    "ai_role": "none",
                    "tools": [],
                },
            ],
            "edges": [
                {"from": "entry_gw", "to": "val_node", "flows": "request payload"},
                {"from": "val_node", "to": "exit_db", "flows": "validated record"},
            ],
            "constraints": constraints_list,
            "entry_ids": ["entry_gw"],
            "exit_ids": ["exit_db"],
        }

        explanation_draft = {
            "overview": f"Synthetic overview for {cid} architecture.",
            "flow_steps": [
                {"node_id": "entry_gw", "text": "Gateway receives request."},
                {"node_id": "val_node", "text": "Validator verifies payload."},
                {"node_id": "exit_db", "text": "Database saves verified data."},
            ],
            "parts": [
                {"node_id": "entry_gw", "text": "Entry interface."},
                {"node_id": "val_node", "text": "Validation processor."},
                {"node_id": "exit_db", "text": "Persistent storage."},
            ],
            "checks": (
                [{"constraint_id": "c1", "text": "Validator check."}] if has_must_pass else []
            ),
            "models_text": "Validator component uses a validation model.",
        }

        # Each run executes 1 intake, 1 architect, 1 explainer
        for _ in range(runs_count):
            script.append(intake_output)
            script.append(architect_spec)
            script.append(explanation_draft)

    return script


async def execute_eval_suite(
    cases: list[dict[str, Any]],
    runs_per_case: int,
    client: InstrumentedLLMClient,
    capture_handler: StructlogCaptureHandler,
    output_path: Path,
    dry_mode: bool = False,
) -> tuple[int, list[CaseRunRecord]]:
    """Run the evaluation suite sequentially across cases and runs."""
    settings = get_settings()
    completed_records: list[CaseRunRecord] = []
    aborted_due_to_quota = False
    started_time = datetime.now().strftime("%Y%m%d-%H%M")

    # Isolated temporary database for this evaluation execution
    temp_dir = tempfile.TemporaryDirectory()
    temp_db_path = Path(temp_dir.name) / "eval_temp.db"
    temp_db_url = f"sqlite+aiosqlite:///{temp_db_path.as_posix()}"

    engine, session_factory = create_engine_and_session(temp_db_url)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    try:
        for case in cases:
            case_id = str(case.get("id"))
            need_text = str(case.get("need_text"))
            followups = list(case.get("followup_answers", []))
            expect = dict(case.get("expect", {}))
            min_nodes = int(expect.get("min_nodes", 3))
            max_nodes = int(expect.get("max_nodes", 25))
            must_have_kinds = list(expect.get("must_have_constraint_kinds", []))

            for run_idx in range(1, runs_per_case + 1):
                capture_handler.clear()
                start_calls = client.call_count
                start_time = time.perf_counter()

                try:
                    async with session_factory() as db:
                        # 1. Intake turn 1
                        turn_res = await handle_turn(
                            db=db,
                            request=IntakeTurnRequest(text=need_text),
                            llm=client,
                        )

                        # Feed followups if needed
                        for ans in followups:
                            if turn_res.status == "needs_info":
                                turn_res = await handle_turn(
                                    db=db,
                                    request=IntakeTurnRequest(
                                        session_id=turn_res.session_id,
                                        text=ans,
                                    ),
                                    llm=client,
                                )

                        if turn_res.status != "ready":
                            # Intake did not produce a brief
                            elapsed = time.perf_counter() - start_time
                            rec = CaseRunRecord(
                                case_id=case_id,
                                run_index=run_idx,
                                success=False,
                                attempt_1_pass=False,
                                final_pass=False,
                                is_422=False,
                                code_repair_used=False,
                                prompt_version="intake_incomplete",
                                node_count=0,
                                edge_count=0,
                                ai_node_count=0,
                                agent_count=0,
                                w_merge_as_agent_count=0,
                                w_no_ai_node_count=0,
                                error_codes=["INTAKE_INCOMPLETE"],
                                explainer_source="fallback",
                                llm_call_count=client.call_count - start_calls,
                                wall_clock_seconds=round(elapsed, 2),
                            )
                            completed_records.append(rec)
                            continue

                        # 2. Design creation
                        try:
                            design_res = await create_design(
                                db=db,
                                request=CreateDesignRequest(session_id=turn_res.session_id),
                                llm=client,
                            )
                        except DesignFailedError as exc:
                            # 422 Design failure
                            elapsed = time.perf_counter() - start_time
                            rec = CaseRunRecord(
                                case_id=case_id,
                                run_index=run_idx,
                                success=False,
                                attempt_1_pass=False,
                                final_pass=False,
                                is_422=True,
                                code_repair_used=False,
                                prompt_version=ARCHITECT_PROMPT_NAME,
                                node_count=0,
                                edge_count=0,
                                ai_node_count=0,
                                agent_count=0,
                                w_merge_as_agent_count=0,
                                w_no_ai_node_count=0,
                                error_codes=list(exc.issues),
                                explainer_source="fallback",
                                llm_call_count=client.call_count - start_calls,
                                wall_clock_seconds=round(elapsed, 2),
                            )
                            completed_records.append(rec)
                            continue

                        # 3. Architect metrics extraction
                        spec = design_res.spec
                        prompt_version = design_res.prompt_version
                        code_repair_used = "+code_repair" in prompt_version

                        design_attempts = [
                            e for e in capture_handler.events if e.get("event") == "design_attempt"
                        ]
                        attempt_1_pass = (
                            len(design_attempts) <= 1
                            and not code_repair_used
                            and "repair" not in prompt_version
                        )

                        node_count = len(spec.nodes)
                        edge_count = len(spec.edges)
                        ai_nodes = sum(1 for n in spec.nodes if n.needs_model)
                        agents = sum(1 for n in spec.nodes if n.ai_role == "agent")

                        lints = check_lints(spec)
                        w_merge = sum(1 for item in lints if item.code == "W_MERGE_AS_AGENT")
                        w_no_ai = sum(1 for item in lints if item.code == "W_NO_AI_NODE")
                        other_warnings = [
                            item.code
                            for item in lints
                            if item.code not in ("W_MERGE_AS_AGENT", "W_NO_AI_NODE")
                        ]

                        found_kinds = sorted({c.kind for c in spec.constraints})
                        constraints_ok = all(k in found_kinds for k in must_have_kinds)
                        within_bounds = min_nodes <= node_count <= max_nodes

                        # 4. Explainer generation
                        expl_res = await get_or_generate_explanation(
                            db=db,
                            design_id=design_res.id,
                            version_no=1,
                            llm=client,
                        )

                        explainer_source = expl_res.source
                        explainer_failed = [
                            e
                            for e in capture_handler.events
                            if e.get("event") == "explainer_verify_failed"
                        ]
                        explainer_issues: list[str] = []
                        for ef in explainer_failed:
                            explainer_issues.extend(ef.get("issue_codes", []))

                        elapsed = time.perf_counter() - start_time
                        calls_made = client.call_count - start_calls

                        rec = CaseRunRecord(
                            case_id=case_id,
                            run_index=run_idx,
                            success=True,
                            attempt_1_pass=attempt_1_pass,
                            final_pass=True,
                            is_422=False,
                            code_repair_used=code_repair_used,
                            prompt_version=prompt_version,
                            node_count=node_count,
                            edge_count=edge_count,
                            ai_node_count=ai_nodes,
                            agent_count=agents,
                            w_merge_as_agent_count=w_merge,
                            w_no_ai_node_count=w_no_ai,
                            other_warnings=other_warnings,
                            error_codes=[],
                            constraint_kinds_found=found_kinds,
                            expected_constraints_satisfied=constraints_ok,
                            within_node_bounds=within_bounds,
                            explainer_source=explainer_source,
                            explainer_attempt=len(explainer_failed) + 1,
                            explainer_issues=explainer_issues,
                            llm_call_count=calls_made,
                            wall_clock_seconds=round(elapsed, 2),
                        )
                        completed_records.append(rec)

                except (LLMRateLimited, LLMUnavailable) as exc:
                    aborted_due_to_quota = True
                    sys.stderr.write(
                        f"\n[QUOTA ERROR] Evaluation aborted due to {exc.__class__.__name__}: {exc}\n"
                        f"Completed {len(completed_records)} runs before aborting.\n"
                    )
                    break

            if aborted_due_to_quota:
                break

    finally:
        await engine.dispose()
        temp_dir.cleanup()

    # Aggregate summaries
    eval_summary = aggregate_eval_runs(completed_records)

    meta = {
        "timestamp": started_time,
        "runner_version": "1.0",
        "prompt_architect": ARCHITECT_PROMPT_NAME,
        "prompt_writer": EXPLAINER_PROMPT_NAME,
        "model_architect": "fake" if dry_mode else (settings.llm_model_architect or "unset"),
        "model_intake": "fake" if dry_mode else (settings.llm_model_intake or "unset"),
        "model_writer": "fake" if dry_mode else (settings.llm_model_writer or "unset"),
        "runs_requested": runs_per_case,
        "total_runs_completed": len(completed_records),
        "aborted_due_to_quota": aborted_due_to_quota,
    }

    result_payload = {
        "meta": meta,
        "summary": eval_summary.to_dict(),
        "by_case": {cid: c.to_dict() for cid, c in eval_summary.by_case.items()},
        "runs": [r.to_dict() for r in completed_records],
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    payload_str = json.dumps(result_payload, indent=2)
    await asyncio.to_thread(output_path.write_text, payload_str, encoding="utf-8")

    if aborted_due_to_quota:
        return 2, completed_records

    return 0, completed_records


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run Arch-Nemesis evaluation benchmark.")
    parser.add_argument("--runs", type=int, default=5, help="Number of runs per case (default: 5)")
    parser.add_argument("--only", type=str, default=None, help="Run only a specific case ID")
    parser.add_argument(
        "--dry", action="store_true", help="Run with FakeLLMClient without spending quota"
    )
    parser.add_argument(
        "--out", type=str, default=None, help="Custom output JSON path in evals/results/"
    )

    args = parser.parse_args(argv)

    cases_dir = repo_root / "evals" / "cases"
    cases = load_eval_cases(cases_dir, only_case_id=args.only)

    if args.out:
        out_path = Path(args.out)
    else:
        timestamp = datetime.now().strftime("%Y%m%d-%H%M")
        out_path = repo_root / "evals" / "results" / f"{timestamp}.json"

    # Set up structlog capturing handler
    capture_handler = StructlogCaptureHandler()
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    root_logger.addHandler(capture_handler)

    if args.dry:
        dry_script = build_dry_run_script(cases, args.runs)
        fake_inner = FakeLLMClient(script=dry_script)
        client = InstrumentedLLMClient(fake_inner)
    else:
        settings = get_settings()
        api_key = settings.gemini_api_key.get_secret_value() if settings.gemini_api_key else None
        if not api_key:
            sys.stderr.write("ERROR: GEMINI_API_KEY is not configured in backend environment.\n")
            return 1

        model_map = {
            LLMTask.INTAKE: settings.llm_model_intake,
            LLMTask.ARCHITECT: settings.llm_model_architect,
            LLMTask.WRITER: settings.llm_model_writer,
        }
        gemini_inner = GeminiClient(
            api_key=api_key,
            model_names=model_map,
            timeout_seconds=settings.llm_timeout_seconds,
        )
        client = InstrumentedLLMClient(gemini_inner)

    exit_code, records = asyncio.run(
        execute_eval_suite(
            cases=cases,
            runs_per_case=args.runs,
            client=client,
            capture_handler=capture_handler,
            output_path=out_path,
            dry_mode=args.dry,
        )
    )

    root_logger.removeHandler(capture_handler)
    print(f"Evaluation complete. Results written to: {out_path} (Runs: {len(records)})")
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
