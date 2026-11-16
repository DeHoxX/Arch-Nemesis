"""Service layer for intake dialogue and requirement capture."""

import json
from typing import Any

from pydantic import ValidationError as PydanticValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from archnemesis.errors import (
    LLMBadOutputError,
    LLMNotConfiguredError,
    NotFoundError,
    SessionClosedError,
    ValidationError,
)
from archnemesis.llm.base import (
    LLMClient,
    LLMNotConfigured,
    LLMRateLimited,
    LLMTask,
    LLMTimeout,
    LLMUnavailable,
)
from archnemesis.llm.fake import FakeScriptExhausted
from archnemesis.modules.intake import repo
from archnemesis.modules.intake.schemas import (
    IntakeLLMOutput,
    IntakeTurnRequest,
    IntakeTurnResponse,
)
from archnemesis.prompts import load_prompt
from archnemesis.settings import get_settings
from archnemesis.shared.brief import BriefConstraint, RequirementBrief

MAX_INTAKE_ROUNDS: int = 3
MAX_QUESTION_LENGTH: int = 200

TRANSIENT_LLM_ERRORS = (
    LLMUnavailable,
    LLMRateLimited,
    LLMTimeout,
    LLMNotConfigured,
    FakeScriptExhausted,
)


def _format_question_for_dialogue(q: Any) -> str:
    if isinstance(q, str):
        return q
    if isinstance(q, dict):
        base = q.get("question", "")
        sug = q.get("suggested_answer")
        opts = q.get("options")
        parts = [base]
        if sug:
            parts.append(f"(Suggested: {sug})")
        if opts:
            parts.append(f"[Options: {', '.join(opts)}]")
        return " ".join(parts)
    if hasattr(q, "question"):
        base = getattr(q, "question", "")
        sug = getattr(q, "suggested_answer", None)
        opts = getattr(q, "options", None)
        parts = [base]
        if sug:
            parts.append(f"(Suggested: {sug})")
        if opts:
            parts.append(f"[Options: {', '.join(opts)}]")
        return " ".join(parts)
    return str(q)


def _validate_llm_output(output: IntakeLLMOutput, must_be_ready: bool = False) -> tuple[bool, str]:
    """Validate intake LLM structured output. Returns (is_valid, reason)."""
    if output.action == "ask":
        if must_be_ready:
            return False, "Output must be 'ready' with a brief, not 'ask'"
        if not output.questions:
            return False, "Action is 'ask' but no questions were provided"
        for q in output.questions:
            if len(q.question) > MAX_QUESTION_LENGTH:
                return False, f"Question exceeds maximum length of {MAX_QUESTION_LENGTH} characters"
        return True, ""
    elif output.action == "ready":
        if output.brief is None or not output.brief.summary.strip():
            return False, "Action is 'ready' but no valid brief was provided"
        return True, ""
    return False, f"Unknown action '{output.action}'"


def _build_requirement_brief(output: IntakeLLMOutput) -> RequirementBrief:
    """Build full RequirementBrief with code-assigned constraint IDs (bc1, bc2...)."""
    if output.brief is None:
        raise ValueError("Cannot build RequirementBrief from None brief")

    constraints = [
        BriefConstraint(id=f"bc{idx + 1}", text=c_text)
        for idx, c_text in enumerate(output.brief.stated_constraints)
    ]

    return RequirementBrief(
        summary=output.brief.summary,
        users=output.brief.users,
        data_involved=output.brief.data_involved,
        domain_hint=output.brief.domain_hint,
        stated_constraints=constraints,
        unverifiable_requirements=output.brief.unverifiable_requirements,
        numbers_given=output.brief.numbers_given,
        assumptions=output.brief.assumptions,
    )


async def _invoke_intake_llm(
    llm: LLMClient,
    system_prompt: str,
    user_prompt: str,
    must_be_ready: bool = False,
) -> IntakeLLMOutput:
    """Invoke LLM with 1-retry on malformed replies or validation failure."""
    try:
        raw_dict = await llm.generate_json(
            task=LLMTask.INTAKE,
            system=system_prompt,
            user=user_prompt,
            schema=IntakeLLMOutput,
        )
        output = IntakeLLMOutput.model_validate(raw_dict)
        is_valid, reason = _validate_llm_output(output, must_be_ready=must_be_ready)
    except TRANSIENT_LLM_ERRORS:
        raise
    except (PydanticValidationError, Exception) as exc:  # noqa: BLE001
        is_valid = False
        reason = f"Schema error or bad response: {exc}"

    if is_valid:
        return output

    # Retry once
    repair_instruction = (
        "You must produce a final RequirementBrief with action 'ready'."
        if must_be_ready
        else "Please return a valid JSON response strictly matching the schema."
    )
    retry_prompt = (
        f"{user_prompt}\n\n[SYSTEM REPAIR NOTICE: Your previous output was invalid: {reason}. "
        f"{repair_instruction}]"
    )
    try:
        raw_retry = await llm.generate_json(
            task=LLMTask.INTAKE,
            system=system_prompt,
            user=retry_prompt,
            schema=IntakeLLMOutput,
        )
        retry_output = IntakeLLMOutput.model_validate(raw_retry)
        retry_valid, _ = _validate_llm_output(retry_output, must_be_ready=must_be_ready)
        if retry_valid:
            return retry_output
        raise LLMBadOutputError()
    except (*TRANSIENT_LLM_ERRORS, LLMBadOutputError):
        raise
    except Exception as exc:
        raise LLMBadOutputError() from exc


async def handle_turn(
    db: AsyncSession,
    request: IntakeTurnRequest,
    llm: LLMClient,
) -> IntakeTurnResponse:
    settings = get_settings()

    # 1. Validate input text
    cleaned_text = request.text.strip()
    if not cleaned_text:
        raise ValidationError("Message cannot be empty.")
    if len(request.text) > settings.max_input_chars:
        raise ValidationError(
            f"Message exceeds maximum allowed length of {settings.max_input_chars} characters."
        )

    # 2. Check model configuration
    if not settings.llm_model_intake:
        raise LLMNotConfiguredError("LLM model for intake is not configured.")

    # 3. Retrieve or initialize session
    if request.session_id:
        session = await repo.get_session(db, request.session_id)
        if session is None:
            raise NotFoundError(f"Intake session '{request.session_id}' not found.")
        if session.status in ("ready", "designed", "abandoned"):
            raise SessionClosedError(f"Session '{session.id}' is already {session.status}.")
        transcript: list[dict[str, Any]] = (
            json.loads(session.turns_json) if session.turns_json else []
        )
        stored_rounds = session.rounds
    else:
        transcript = []
        session = await repo.create_session(
            db, transcript=transcript, status="collecting", rounds=0
        )
        stored_rounds = 0

    # 4. Build dialogue prompt
    system_prompt = load_prompt("intake_v3.md")
    dialogue_lines: list[str] = []
    for turn in transcript:
        speaker = turn.get("speaker", "unknown")
        if speaker == "user":
            dialogue_lines.append(
                f"User:\n<untrusted_user_text>\n{turn.get('text', '')}\n</untrusted_user_text>"
            )
        elif speaker == "assistant":
            if turn.get("questions"):
                q_text = "\n".join(
                    f"- {_format_question_for_dialogue(q)}" for q in turn.get("questions", [])
                )
                dialogue_lines.append(f"Assistant (Questions):\n{q_text}")
            elif turn.get("summary"):
                dialogue_lines.append(f"Assistant (Summary): {turn.get('summary', '')}")

    dialogue_lines.append(f"User:\n<untrusted_user_text>\n{cleaned_text}\n</untrusted_user_text>")
    user_prompt = "\n\n".join(dialogue_lines)

    # 5. Normal LLM Call
    try:
        output = await _invoke_intake_llm(
            llm=llm,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            must_be_ready=False,
        )
    except LLMNotConfigured as exc:
        raise LLMNotConfiguredError(str(exc)) from exc

    # 6. Process output and update database state
    if output.action == "ready" and output.brief is not None:
        brief = _build_requirement_brief(output)
        transcript.append({"speaker": "user", "text": cleaned_text})
        transcript.append({"speaker": "assistant", "summary": brief.summary})
        await repo.update_session(
            db=db,
            session=session,
            transcript=transcript,
            brief=brief.model_dump(by_alias=True),
            status="ready",
            rounds=stored_rounds,
        )
        return IntakeTurnResponse(
            status="ready",
            session_id=session.id,
            round=stored_rounds,
            questions=[],
            brief=brief,
        )

    # LLM returned action: "ask"
    if stored_rounds < MAX_INTAKE_ROUNDS:
        new_rounds = stored_rounds + 1
        filtered_questions = output.questions[: settings.max_questions_per_round]
        transcript.append({"speaker": "user", "text": cleaned_text})
        transcript.append(
            {
                "speaker": "assistant",
                "questions": [
                    q.model_dump() if hasattr(q, "model_dump") else q for q in filtered_questions
                ],
            }
        )
        await repo.update_session(
            db=db,
            session=session,
            transcript=transcript,
            brief=None,
            status="collecting",
            rounds=new_rounds,
        )
        return IntakeTurnResponse(
            status="needs_info",
            session_id=session.id,
            round=new_rounds,
            questions=filtered_questions,
            brief=None,
        )

    # Stored rounds reached MAX_INTAKE_ROUNDS (3) and LLM asked again:
    # Trigger forced-brief call with intake_forced_v2.md system prompt.
    forced_system_prompt = load_prompt("intake_forced_v2.md")
    try:
        forced_output = await _invoke_intake_llm(
            llm=llm,
            system_prompt=forced_system_prompt,
            user_prompt=user_prompt,
            must_be_ready=True,
        )
    except LLMNotConfigured as exc:
        raise LLMNotConfiguredError(str(exc)) from exc

    brief = _build_requirement_brief(forced_output)
    transcript.append({"speaker": "user", "text": cleaned_text})
    transcript.append({"speaker": "assistant", "summary": brief.summary})
    await repo.update_session(
        db=db,
        session=session,
        transcript=transcript,
        brief=brief.model_dump(by_alias=True),
        status="ready",
        rounds=stored_rounds,
    )
    return IntakeTurnResponse(
        status="ready",
        session_id=session.id,
        round=stored_rounds,
        questions=[],
        brief=brief,
    )
