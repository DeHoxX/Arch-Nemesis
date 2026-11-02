"""Service layer for lazy explanation generation, verification, and fallback."""

import json
from typing import Any

import structlog
from pydantic import ValidationError as PydanticValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from archnemesis.errors import NotFoundError
from archnemesis.llm.base import (
    LLMBadOutput,
    LLMClient,
    LLMNotConfigured,
    LLMRateLimited,
    LLMTask,
    LLMTimeout,
    LLMUnavailable,
)
from archnemesis.modules.explainer import repo
from archnemesis.modules.explainer.fallback import assemble_explanation, build_fallback_explanation
from archnemesis.modules.explainer.schemas import (
    Explanation,
    ExplanationDraft,
    VerificationIssue,
)
from archnemesis.modules.explainer.verify import verify_draft
from archnemesis.modules.validation.models import ArchitectureSpec
from archnemesis.modules.validation.ordering import order_nodes
from archnemesis.prompts import load_prompt
from archnemesis.shared.brief import RequirementBrief

logger = structlog.get_logger(__name__)

MAX_EXPLAINER_CALLS: int = 2


def _escape_untrusted_text(text: str) -> str:
    """Escape fake closing tags to prevent prompt injection."""
    return text.replace("</untrusted_user_text>", "&lt;/untrusted_user_text&gt;")


def _maybe_align_flow_steps(
    draft: ExplanationDraft,
    flow_order: list[str],
) -> None:
    """Sort draft flow_steps into flow_order if all expected node IDs are present exactly once."""
    step_ids = [step.node_id for step in draft.flow_steps]
    if len(step_ids) == len(flow_order) and set(step_ids) == set(flow_order):
        step_map = {step.node_id: step for step in draft.flow_steps}
        draft.flow_steps = [step_map[nid] for nid in flow_order]


def _extract_safe_validation_diagnostics(
    exc: Exception,
) -> tuple[dict[str, Any], str]:
    """Extract strictly safe metadata for logging and LLM retry feedback.

    Never exposes model prose, prompt content, node names, or input values.
    """
    error_type = type(exc).__name__
    if isinstance(exc, PydanticValidationError):
        raw_errors = exc.errors()
        error_count = len(raw_errors)
        failing_fields: list[str] = []
        for err in raw_errors[:10]:
            loc_parts = [str(p) for p in err.get("loc", ())]
            loc_str = ".".join(loc_parts) if loc_parts else "root"
            err_type = str(err.get("type", "unknown"))
            failing_fields.append(f"{loc_str}:{err_type}")

        log_meta: dict[str, Any] = {
            "error_type": error_type,
            "error_count": error_count,
            "failing_fields": failing_fields,
        }
        msg = (
            f"Schema validation failed: {', '.join(failing_fields)}"
            if failing_fields
            else "Output from model failed schema validation."
        )
        return log_meta, msg

    if isinstance(exc, LLMBadOutput):
        log_meta = {"error_type": error_type}
        if hasattr(exc, "raw") and isinstance(exc.raw, (str, bytes)):
            raw_len = len(exc.raw.encode("utf-8")) if isinstance(exc.raw, str) else len(exc.raw)
            log_meta["raw_length_bytes"] = raw_len
        elif hasattr(exc, "message") and isinstance(exc.message, str):
            log_meta["raw_length_bytes"] = len(exc.message.encode("utf-8"))

        msg = "Output from model was malformed or failed schema validation."
        return log_meta, msg

    # Fallback for ValueError or other parsing issues
    log_meta = {"error_type": error_type}
    msg = "Output from model was malformed or failed schema validation."
    return log_meta, msg


def _format_architecture_data(
    spec: ArchitectureSpec,
    brief: RequirementBrief,
    flow_order: list[str],
) -> str:
    """Format architectural spec and brief numbers for inclusion in prompt data tags."""
    lines: list[str] = [
        "Architecture Components (in request flow order):",
    ]
    node_map = {n.id: n for n in spec.nodes}
    for nid in flow_order:
        node = node_map.get(nid)
        if node is None:
            continue
        inputs_str = ", ".join(node.inputs) if node.inputs else "none"
        outputs_str = ", ".join(node.outputs) if node.outputs else "none"
        uses_model_str = "yes" if node.needs_model else "no"
        lines.append(f"- node_id: {node.id}")
        lines.append(f"  name: {node.name}")
        lines.append(f"  role: {node.role}")
        lines.append(f"  inputs: {inputs_str}")
        lines.append(f"  outputs: {outputs_str}")
        lines.append(f"  uses_ai_model: {uses_model_str}")

    lines.append("\nCommunication Edges:")
    for edge in spec.edges:
        lines.append(f"- from: {edge.from_node} -> to: {edge.to} (flows: {edge.flows})")

    lines.append("\nArchitectural Constraints:")
    for c in spec.constraints:
        lines.append(f"- constraint_id: {c.id} (rule: {c.text})")

    if brief.numbers_given:
        lines.append("\nKnown Numbers from Brief:")
        for n in brief.numbers_given:
            lines.append(f"- {n.label}: {n.value} {n.unit}".strip())

    raw_text = "\n".join(lines)
    return _escape_untrusted_text(raw_text)


def _format_explainer_user_prompt(
    spec: ArchitectureSpec,
    brief: RequirementBrief,
    flow_order: list[str],
    issues: list[VerificationIssue] | None = None,
    previous_draft: ExplanationDraft | None = None,
) -> str:
    """Construct user prompt containing architecture data in untrusted tags."""
    arch_data = _format_architecture_data(spec, brief, flow_order)
    if not issues:
        return (
            "System Architecture Specification to Explain:\n\n"
            f"<untrusted_user_text>\n{arch_data}\n</untrusted_user_text>\n\n"
            "Produce a complete, verified ExplanationDraft adhering strictly to the system rules."
        )

    issue_lines: list[str] = []
    for i in issues:
        line = f"- [{i.code}] {i.message}"
        if i.code == "X_FLOW_ORDER":
            line += f"\n  Expected flow order (node ids): {', '.join(flow_order)}"
        issue_lines.append(line)
    issues_formatted = "\n".join(issue_lines)
    prev_draft_json = ""
    if previous_draft is not None:
        prev_draft_json = (
            f"\n\nPrevious Candidate Draft:\n{json.dumps(previous_draft.model_dump(), indent=2)}"
        )

    return (
        "The previous explanation draft failed code verification.\n\n"
        f"Verification Issues to Correct:\n{issues_formatted}"
        f"{prev_draft_json}\n\n"
        "System Architecture Specification to Explain:\n\n"
        f"<untrusted_user_text>\n{arch_data}\n</untrusted_user_text>\n\n"
        "Fix all reported issues and return a corrected ExplanationDraft conforming strictly to the rules."
    )


async def get_or_generate_explanation(
    db: AsyncSession,
    design_id: str,
    version_no: int,
    llm: LLMClient,
) -> Explanation:
    """Retrieve existing explanation or lazily generate one with verification and fallback.

    No transaction is held open across external LLM network calls.
    Transient LLM errors (503/429/timeout) are re-raised without falling back.
    """
    # 1. Read existing design and version state (DB query finishes immediately)
    design = await repo.get_design(db, design_id)
    if design is None:
        raise NotFoundError(f"Design '{design_id}' not found.")

    version = await repo.get_design_version(db, design_id, version_no)
    if version is None:
        raise NotFoundError(f"Design version {version_no} for design '{design_id}' not found.")

    if version.explanation_json is not None:
        logger.info("explainer_cache_hit", design_id=design_id, version_no=version_no)
        return Explanation.model_validate(json.loads(version.explanation_json))

    spec = ArchitectureSpec.model_validate(json.loads(version.spec_json))
    brief = RequirementBrief.model_validate(json.loads(version.brief_json))
    flow_order = order_nodes(spec)

    # 2. Generation Loop (outside of open DB transactions)
    logger.info("explainer_generate_start", design_id=design_id, version_no=version_no)
    system_prompt = load_prompt("writer_v1.md")

    # Attempt 1
    attempt = 1
    user_prompt = _format_explainer_user_prompt(spec, brief, flow_order)
    draft: ExplanationDraft | None = None
    issues: list[VerificationIssue] = []
    diag_meta: dict[str, Any] = {}

    try:
        raw_output = await llm.generate_json(
            task=LLMTask.WRITER,
            system=system_prompt,
            user=user_prompt,
            schema=ExplanationDraft,
        )
        draft = ExplanationDraft.model_validate(raw_output)
        _maybe_align_flow_steps(draft, flow_order)
        issues = verify_draft(draft, spec, brief, flow_order)
    except (LLMUnavailable, LLMRateLimited, LLMTimeout, LLMNotConfigured):
        # Transient errors and configuration errors re-raise directly
        raise
    except (LLMBadOutput, PydanticValidationError, ValueError) as exc:
        draft = None
        diag_meta, diag_msg = _extract_safe_validation_diagnostics(exc)
        issues = [
            VerificationIssue(
                code="X_BAD_OUTPUT",
                message=diag_msg,
            )
        ]

    if draft is not None and not issues:
        logger.info(
            "explainer_generate_success",
            design_id=design_id,
            version_no=version_no,
            attempt=attempt,
            source="llm",
        )
        assembled = assemble_explanation(draft, spec, flow_order)
        return await repo.save_explanation(db, design_id, version_no, assembled)

    # Attempt 1 failed verification
    verify_meta: dict[str, Any] = dict(diag_meta)
    if any(i.code == "X_FLOW_ORDER" for i in issues):
        verify_meta["expected_flow_order"] = list(flow_order)
        verify_meta["received_flow_order"] = [
            step.node_id for step in (draft.flow_steps if draft else [])
        ]

    logger.info(
        "explainer_verify_failed",
        design_id=design_id,
        version_no=version_no,
        attempt=attempt,
        issue_codes=[i.code for i in issues],
        **verify_meta,
    )

    # Attempt 2
    attempt = 2
    repair_prompt = _format_explainer_user_prompt(
        spec,
        brief,
        flow_order,
        issues=issues,
        previous_draft=draft,
    )
    draft_2: ExplanationDraft | None = None
    issues_2: list[VerificationIssue] = []
    diag_meta_2: dict[str, Any] = {}

    try:
        raw_output_2 = await llm.generate_json(
            task=LLMTask.WRITER,
            system=system_prompt,
            user=repair_prompt,
            schema=ExplanationDraft,
        )
        draft_2 = ExplanationDraft.model_validate(raw_output_2)
        _maybe_align_flow_steps(draft_2, flow_order)
        issues_2 = verify_draft(draft_2, spec, brief, flow_order)
    except (LLMUnavailable, LLMRateLimited, LLMTimeout, LLMNotConfigured):
        raise
    except (LLMBadOutput, PydanticValidationError, ValueError) as exc_2:
        draft_2 = None
        diag_meta_2, diag_msg_2 = _extract_safe_validation_diagnostics(exc_2)
        issues_2 = [
            VerificationIssue(
                code="X_BAD_OUTPUT",
                message=diag_msg_2,
            )
        ]

    if draft_2 is not None and not issues_2:
        logger.info(
            "explainer_generate_success",
            design_id=design_id,
            version_no=version_no,
            attempt=attempt,
            source="llm",
        )
        assembled = assemble_explanation(draft_2, spec, flow_order)
        return await repo.save_explanation(db, design_id, version_no, assembled)

    # Attempt 2 failed: fall back to deterministic code-only explanation
    verify_meta_2: dict[str, Any] = dict(diag_meta_2)
    if any(i.code == "X_FLOW_ORDER" for i in issues_2):
        verify_meta_2["expected_flow_order"] = list(flow_order)
        verify_meta_2["received_flow_order"] = [
            step.node_id for step in (draft_2.flow_steps if draft_2 else [])
        ]

    logger.info(
        "explainer_verify_failed",
        design_id=design_id,
        version_no=version_no,
        attempt=attempt,
        issue_codes=[i.code for i in issues_2],
        **verify_meta_2,
    )
    logger.info(
        "explainer_fallback_applied",
        design_id=design_id,
        version_no=version_no,
        issue_codes=[i.code for i in issues_2],
    )
    assembled = build_fallback_explanation(spec, brief, flow_order)
    return await repo.save_explanation(db, design_id, version_no, assembled)
