"""Business service logic for design refinement chat, suggestions, and versioning."""

import json
import uuid
from datetime import UTC, datetime
from typing import Any

import structlog
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from archnemesis.db.tables import DesignVersionTable
from archnemesis.errors import (
    CapTurnsError,
    CapVersionsError,
    ConfirmationRequiredError,
    LLMBadOutputError,
    NotFoundError,
    PatchBlockedError,
    RestoreCurrentVersionError,
    StalePatchError,
)
from archnemesis.llm.base import LLMBadOutput, LLMClient, LLMTask
from archnemesis.modules.refinement import repo
from archnemesis.modules.refinement.schemas import (
    AcceptPatchRequest,
    ChatMessageItem,
    ChatRequest,
    ChatResponse,
    MessagesResponse,
    PatchSummary,
    RefinedDesignResponse,
    RefinementLLMOutput,
    RejectPatchResponse,
    RestoreRequest,
    SuggestionItemResponse,
    SuggestionsLLMOutput,
    SuggestionsResponse,
)
from archnemesis.modules.validation import (
    ArchitectureSpec,
    Limits,
    Patch,
    apply_patch,
    describe_diff,
    order_nodes,
)
from archnemesis.prompts import load_prompt
from archnemesis.settings import get_settings
from archnemesis.shared.brief import RequirementBrief

logger = structlog.get_logger(__name__)


def _escape_untrusted_text(text: str) -> str:
    """Escape fake closing tags to prevent prompt injection."""
    return text.replace("</untrusted_user_text>", "&lt;/untrusted_user_text&gt;")


def _format_design_response(
    design_id: str,
    intake_session_id: str,
    current_version: int,
    version_record: DesignVersionTable,
) -> RefinedDesignResponse:
    """Convert a DesignTable and DesignVersionTable into RefinedDesignResponse."""
    brief_dict = json.loads(version_record.brief_json)
    brief_obj = RequirementBrief.model_validate(brief_dict)
    warnings_list = json.loads(version_record.warnings_json)
    spec = ArchitectureSpec.model_validate(json.loads(version_record.spec_json))
    flow_order = order_nodes(spec)

    explanation_obj: dict[str, Any] | None = None
    if version_record.explanation_json is not None:
        explanation_obj = json.loads(version_record.explanation_json)

    return RefinedDesignResponse(
        id=design_id,
        intake_session_id=intake_session_id,
        current_version=current_version,
        brief=brief_obj,
        spec=spec,
        warnings=warnings_list,
        flow_order=flow_order,
        prompt_version=version_record.prompt_version,
        explanation=explanation_obj,
    )


async def handle_chat(
    db: AsyncSession,
    design_id: str,
    request: ChatRequest,
    llm: LLMClient,
) -> ChatResponse:
    """Process a user refinement chat message and produce an optional graph patch."""
    settings = get_settings()

    design = await repo.get_design(db, design_id)
    if design is None:
        raise NotFoundError(f"Design '{design_id}' not found.")

    turn_count = await repo.count_refinement_turns(db, design_id)
    if turn_count >= settings.max_refinement_turns:
        logger.info(
            "refinement_cap_turns_exceeded",
            design_id=design_id,
            turn_count=turn_count,
            limit=settings.max_refinement_turns,
        )
        raise CapTurnsError(settings.max_refinement_turns)

    current_ver = await repo.get_design_version(db, design_id, design.current_version)
    if current_ver is None:
        raise NotFoundError(f"Current version for design '{design_id}' not found.")

    recent_messages = await repo.get_recent_messages(db, design_id, limit=6)

    # Prepare LLM input
    system_prompt = load_prompt("refine_v1.md")
    brief_data = json.loads(current_ver.brief_json)
    spec_data = json.loads(current_ver.spec_json)

    conversation_history = "\n".join(f"{m.role.upper()}: {m.text}" for m in recent_messages)
    escaped_user_text = _escape_untrusted_text(request.message)

    user_prompt = (
        f"<requirement_brief>\n{json.dumps(brief_data, indent=2)}\n</requirement_brief>\n\n"
        f"<current_architecture_spec>\n{json.dumps(spec_data, indent=2)}\n</current_architecture_spec>\n\n"
        f"<recent_conversation>\n{conversation_history}\n</recent_conversation>\n\n"
        f"<untrusted_user_text>\n{escaped_user_text}\n</untrusted_user_text>"
    )

    # Call LLM with 1 retry on malformed JSON
    output: RefinementLLMOutput | None = None
    for attempt in range(2):
        try:
            raw_json = await llm.generate_json(
                task=LLMTask.ARCHITECT,
                system=system_prompt,
                user=user_prompt,
                schema=RefinementLLMOutput,
            )
            output = RefinementLLMOutput.model_validate(raw_json)
            break
        except (LLMBadOutput, ValidationError) as exc:
            if attempt == 1:
                logger.warning(
                    "refinement_llm_bad_output",
                    design_id=design_id,
                    error=exc.__class__.__name__,
                )
                raise LLMBadOutputError() from exc

    if output is None:
        raise LLMBadOutputError()

    reply_text = output.reply[:500]
    now_iso = datetime.now(UTC).isoformat()

    # If a patch was generated, validate it
    patch_summary: PatchSummary | None = None
    if output.patch is not None and output.patch.ops:
        current_spec = ArchitectureSpec.model_validate(spec_data)
        brief_obj = RequirementBrief.model_validate(brief_data)
        brief_constraints = {bc.id: bc.text for bc in brief_obj.stated_constraints}

        patch_res = apply_patch(
            spec=current_spec,
            patch=output.patch,
            brief_constraints=brief_constraints,
            limits=Limits(),
            max_patch_ops=settings.max_patch_ops,
        )

        patch_id = str(uuid.uuid4())
        issues_payload = [
            {"code": i.code, "severity": i.severity, "message": i.message, "ids": i.ids}
            for i in patch_res.issues
        ]
        await repo.create_patch(
            db=db,
            patch_id=patch_id,
            design_id=design_id,
            kind="change",
            base_version=design.current_version,
            status=patch_res.status,
            patch_json=output.patch.model_dump_json(),
            diff_json=patch_res.diff.model_dump_json() if patch_res.diff else None,
            issues_json=json.dumps(issues_payload),
            reason=None,
            created_at=now_iso,
        )
        patch_summary = PatchSummary(
            id=patch_id,
            status=patch_res.status,
            diff=patch_res.diff,
            issues=patch_res.issues,
            ops_count=len(output.patch.ops),
        )

        logger.info(
            "refinement_patch_evaluated",
            design_id=design_id,
            patch_id=patch_id,
            status=patch_res.status,
            ops_count=len(output.patch.ops),
            issues_count=len(patch_res.issues),
        )

    # Record messages
    user_msg_id = str(uuid.uuid4())
    asst_msg_id = str(uuid.uuid4())
    await repo.create_chat_message(
        db=db,
        message_id=user_msg_id,
        design_id=design_id,
        role="user",
        text=request.message,
        created_at=now_iso,
    )
    await repo.create_chat_message(
        db=db,
        message_id=asst_msg_id,
        design_id=design_id,
        role="assistant",
        text=reply_text,
        created_at=now_iso,
    )
    await db.commit()

    logger.info(
        "refinement_chat_turn_completed",
        design_id=design_id,
        message_id=asst_msg_id,
        has_patch=patch_summary is not None,
    )

    return ChatResponse(
        message_id=asst_msg_id,
        reply=reply_text,
        patch=patch_summary,
    )


async def handle_suggestions(
    db: AsyncSession,
    design_id: str,
    llm: LLMClient,
) -> SuggestionsResponse:
    """Generate architectural improvement suggestions and filter to valid patches."""
    settings = get_settings()

    design = await repo.get_design(db, design_id)
    if design is None:
        raise NotFoundError(f"Design '{design_id}' not found.")

    turn_count = await repo.count_refinement_turns(db, design_id)
    if turn_count >= settings.max_refinement_turns:
        logger.info(
            "refinement_cap_turns_exceeded_on_suggestions",
            design_id=design_id,
            turn_count=turn_count,
            limit=settings.max_refinement_turns,
        )
        raise CapTurnsError(settings.max_refinement_turns)

    current_ver = await repo.get_design_version(db, design_id, design.current_version)
    if current_ver is None:
        raise NotFoundError(f"Current version for design '{design_id}' not found.")

    system_prompt = load_prompt("suggest_v1.md")
    brief_data = json.loads(current_ver.brief_json)
    spec_data = json.loads(current_ver.spec_json)

    user_prompt = (
        f"<requirement_brief>\n{json.dumps(brief_data, indent=2)}\n</requirement_brief>\n\n"
        f"<current_architecture_spec>\n{json.dumps(spec_data, indent=2)}\n</current_architecture_spec>\n\n"
        "Suggest concrete architectural improvements."
    )

    output: SuggestionsLLMOutput | None = None
    for attempt in range(2):
        try:
            raw_json = await llm.generate_json(
                task=LLMTask.ARCHITECT,
                system=system_prompt,
                user=user_prompt,
                schema=SuggestionsLLMOutput,
            )
            output = SuggestionsLLMOutput.model_validate(raw_json)
            break
        except (LLMBadOutput, ValidationError) as exc:
            if attempt == 1:
                logger.warning(
                    "suggestions_llm_bad_output",
                    design_id=design_id,
                    error=exc.__class__.__name__,
                )
                raise LLMBadOutputError() from exc

    if output is None:
        raise LLMBadOutputError()

    current_spec = ArchitectureSpec.model_validate(spec_data)
    brief_obj = RequirementBrief.model_validate(brief_data)
    brief_constraints = {bc.id: bc.text for bc in brief_obj.stated_constraints}

    kept_suggestions: list[SuggestionItemResponse] = []
    discarded_count = 0
    now_iso = datetime.now(UTC).isoformat()

    for item in output.suggestions[:5]:
        title = item.title[:60]
        reason = item.reason[:140]

        res = apply_patch(
            spec=current_spec,
            patch=item.patch,
            brief_constraints=brief_constraints,
            limits=Limits(),
            max_patch_ops=settings.max_patch_ops,
        )

        if res.status in ("proposed", "needs_confirmation"):
            patch_id = str(uuid.uuid4())
            issues_payload = [
                {"code": i.code, "severity": i.severity, "message": i.message, "ids": i.ids}
                for i in res.issues
            ]
            await repo.create_patch(
                db=db,
                patch_id=patch_id,
                design_id=design_id,
                kind="suggestion",
                base_version=design.current_version,
                status=res.status,
                patch_json=item.patch.model_dump_json(),
                diff_json=res.diff.model_dump_json() if res.diff else None,
                issues_json=json.dumps(issues_payload),
                reason=reason,
                created_at=now_iso,
            )
            kept_suggestions.append(
                SuggestionItemResponse(
                    patch_id=patch_id,
                    title=title,
                    reason=reason,
                    status=res.status,
                    diff=res.diff,
                )
            )
        else:
            discarded_count += 1

    await db.commit()

    logger.info(
        "suggestions_generated",
        design_id=design_id,
        kept_count=len(kept_suggestions),
        discarded_count=discarded_count,
    )

    return SuggestionsResponse(
        suggestions=kept_suggestions,
        discarded_count=discarded_count,
    )


async def accept_patch(
    db: AsyncSession,
    design_id: str,
    patch_id: str,
    request: AcceptPatchRequest,
) -> RefinedDesignResponse:
    """Re-validate and apply a candidate patch, creating version n+1 atomically."""
    settings = get_settings()

    design = await repo.get_design(db, design_id)
    if design is None:
        raise NotFoundError(f"Design '{design_id}' not found.")

    patch_record = await repo.get_patch(db, design_id, patch_id)
    if patch_record is None:
        raise NotFoundError(f"Patch '{patch_id}' not found for design '{design_id}'.")

    if patch_record.base_version != design.current_version:
        logger.info(
            "accept_stale_patch",
            design_id=design_id,
            patch_id=patch_id,
            patch_base=patch_record.base_version,
            current_version=design.current_version,
        )
        raise StalePatchError()

    if design.current_version >= settings.max_versions:
        logger.info(
            "accept_cap_versions_exceeded",
            design_id=design_id,
            current_version=design.current_version,
            max_versions=settings.max_versions,
        )
        raise CapVersionsError(settings.max_versions)

    current_ver = await repo.get_design_version(db, design_id, design.current_version)
    if current_ver is None:
        raise NotFoundError(f"Current version for design '{design_id}' not found.")

    current_spec = ArchitectureSpec.model_validate(json.loads(current_ver.spec_json))
    brief_dict = json.loads(current_ver.brief_json)
    brief_obj = RequirementBrief.model_validate(brief_dict)
    brief_constraints = {bc.id: bc.text for bc in brief_obj.stated_constraints}

    parsed_patch = Patch.model_validate_json(patch_record.patch_json)

    # Server re-evaluates patch independently
    res = apply_patch(
        spec=current_spec,
        patch=parsed_patch,
        brief_constraints=brief_constraints,
        limits=Limits(),
        max_patch_ops=settings.max_patch_ops,
    )

    dropped_ids: frozenset[str] = frozenset()
    if res.status == "needs_confirmation":
        if not request.confirm_drop:
            logger.info("accept_confirmation_required", design_id=design_id, patch_id=patch_id)
            raise ConfirmationRequiredError()
        # Derive dropped_brief_ids directly from stored patch
        dropped_ids = frozenset(res.uncovered_brief_ids)
        res = apply_patch(
            spec=current_spec,
            patch=parsed_patch,
            brief_constraints=brief_constraints,
            limits=Limits(),
            dropped_brief_ids=dropped_ids,
            max_patch_ops=settings.max_patch_ops,
        )

    if not res.ok or res.status == "blocked" or res.spec is None:
        logger.info(
            "accept_patch_blocked",
            design_id=design_id,
            patch_id=patch_id,
            issues_count=len(res.issues),
        )
        raise PatchBlockedError()

    # Move dropped requirement texts to unverifiable_requirements
    if dropped_ids:
        new_stated = [bc for bc in brief_obj.stated_constraints if bc.id not in dropped_ids]
        new_unverifiable = list(brief_obj.unverifiable_requirements)
        for bc in brief_obj.stated_constraints:
            if bc.id in dropped_ids:
                new_unverifiable.append(f"Dropped by user: {bc.text}")
        brief_obj = RequirementBrief(
            summary=brief_obj.summary,
            users=brief_obj.users,
            data_involved=brief_obj.data_involved,
            domain_hint=brief_obj.domain_hint,
            stated_constraints=new_stated,
            unverifiable_requirements=new_unverifiable,
            numbers_given=brief_obj.numbers_given,
            assumptions=brief_obj.assumptions,
        )

    now_iso = datetime.now(UTC).isoformat()
    new_version_no = design.current_version + 1
    new_version_id = str(uuid.uuid4())
    change_note = describe_diff(res.diff) if res.diff else "Updated design."

    warnings_payload = [i.message for i in res.issues if i.severity == "warning"]

    # Single short atomic transaction
    new_version_record = DesignVersionTable(
        id=new_version_id,
        design_id=design_id,
        version_no=new_version_no,
        brief_json=brief_obj.model_dump_json(),
        spec_json=res.spec.model_dump_json(by_alias=True),
        explanation_json=None,
        prompt_version="refine_v1",
        models_json=json.dumps({"architect": settings.llm_model_architect}),
        warnings_json=json.dumps(warnings_payload),
        change_note=change_note,
        created_at=now_iso,
    )

    await repo.insert_version_and_update_design(db, design, new_version_record)
    await repo.update_patch_status(db, patch_id, status="accepted", decided_at=now_iso)
    await repo.supersede_other_patches(
        db,
        design_id=design_id,
        base_version=patch_record.base_version,
        accepted_patch_id=patch_id,
        decided_at=now_iso,
    )
    await db.commit()

    logger.info(
        "patch_accepted",
        design_id=design_id,
        patch_id=patch_id,
        new_version_no=new_version_no,
    )

    return _format_design_response(
        design_id=design.id,
        intake_session_id=design.intake_session_id,
        current_version=new_version_no,
        version_record=new_version_record,
    )


async def reject_patch(
    db: AsyncSession,
    design_id: str,
    patch_id: str,
) -> RejectPatchResponse:
    """Mark a candidate patch as rejected."""
    design = await repo.get_design(db, design_id)
    if design is None:
        raise NotFoundError(f"Design '{design_id}' not found.")

    patch_record = await repo.get_patch(db, design_id, patch_id)
    if patch_record is None:
        raise NotFoundError(f"Patch '{patch_id}' not found for design '{design_id}'.")

    now_iso = datetime.now(UTC).isoformat()
    await repo.update_patch_status(db, patch_id, status="rejected", decided_at=now_iso)
    await db.commit()

    logger.info("patch_rejected", design_id=design_id, patch_id=patch_id)

    return RejectPatchResponse(id=patch_id, status="rejected")


async def restore_version(
    db: AsyncSession,
    design_id: str,
    request: RestoreRequest,
) -> RefinedDesignResponse:
    """Restore a historical design version as a new latest version (byte-for-byte spec copy)."""
    settings = get_settings()

    design = await repo.get_design(db, design_id)
    if design is None:
        raise NotFoundError(f"Design '{design_id}' not found.")

    if request.version_no == design.current_version:
        raise RestoreCurrentVersionError()

    if design.current_version >= settings.max_versions:
        raise CapVersionsError(settings.max_versions)

    target_ver = await repo.get_design_version(db, design_id, request.version_no)
    if target_ver is None:
        raise NotFoundError(f"Version {request.version_no} not found for design '{design_id}'.")

    now_iso = datetime.now(UTC).isoformat()
    new_version_no = design.current_version + 1
    new_version_id = str(uuid.uuid4())

    new_version_record = DesignVersionTable(
        id=new_version_id,
        design_id=design_id,
        version_no=new_version_no,
        brief_json=target_ver.brief_json,
        spec_json=target_ver.spec_json,  # Byte-for-byte copy
        explanation_json=None,
        prompt_version="refine_v1",
        models_json=target_ver.models_json,
        warnings_json=target_ver.warnings_json,
        change_note=f"Restored from v{request.version_no}.",
        created_at=now_iso,
    )

    await repo.insert_version_and_update_design(db, design, new_version_record)
    await db.commit()

    logger.info(
        "version_restored",
        design_id=design_id,
        restored_from=request.version_no,
        new_version_no=new_version_no,
    )

    return _format_design_response(
        design_id=design.id,
        intake_session_id=design.intake_session_id,
        current_version=new_version_no,
        version_record=new_version_record,
    )


async def get_messages(
    db: AsyncSession,
    design_id: str,
) -> MessagesResponse:
    """Return all chat messages for a design."""
    design = await repo.get_design(db, design_id)
    if design is None:
        raise NotFoundError(f"Design '{design_id}' not found.")

    records = await repo.get_all_messages(db, design_id)
    items = [
        ChatMessageItem(
            id=r.id,
            role=r.role,
            text=r.text,
            created_at=r.created_at,
        )
        for r in records
    ]
    return MessagesResponse(messages=items)


async def get_version_detail(
    db: AsyncSession,
    design_id: str,
    version_no: int,
) -> RefinedDesignResponse:
    """Retrieve read-only detail of a specific design version."""
    design = await repo.get_design(db, design_id)
    if design is None:
        raise NotFoundError(f"Design '{design_id}' not found.")

    version_record = await repo.get_design_version(db, design_id, version_no)
    if version_record is None:
        raise NotFoundError(f"Version {version_no} not found for design '{design_id}'.")

    return _format_design_response(
        design_id=design.id,
        intake_session_id=design.intake_session_id,
        current_version=design.current_version,
        version_record=version_record,
    )
