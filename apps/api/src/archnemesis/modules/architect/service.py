"""Service layer for architecture generation and multi-step validation repair loop."""

from __future__ import annotations

import json
import re

import structlog

from archnemesis.errors import DesignFailedError, LLMNotConfiguredError
from archnemesis.llm.base import LLMClient, LLMNotConfigured, LLMTask
from archnemesis.modules.validation.models import (
    ArchitectureSpec,
    Limits,
    ValidationIssue,
    ValidationResult,
)
from archnemesis.modules.validation.repair import patch_constraints, patch_dead_ends
from archnemesis.modules.validation.validate import parse_and_validate, validate
from archnemesis.prompts import load_patterns, load_prompt
from archnemesis.settings import Settings, get_settings
from archnemesis.shared.brief import RequirementBrief

logger = structlog.get_logger()

MAX_ARCHITECT_CALLS: int = 3
ARCHITECT_PROMPT_NAME: str = "architect_v8"
ARCHITECT_REPAIR_PROMPT_NAME: str = "architect_repair_v8"

_PROMPT_NAME_RE = re.compile(r"^[A-Za-z0-9_-]+$")


def resolve_architect_prompt_names(settings: Settings | None = None) -> tuple[str, str]:
    """Resolve (architect_prompt_name, architect_repair_prompt_name) from settings or defaults.

    Validates prompt names against ^[A-Za-z0-9_-]+$ to prevent path traversal.
    """
    if settings is None:
        settings = get_settings()

    arch_name = settings.architect_prompt_name or ARCHITECT_PROMPT_NAME
    repair_name = settings.architect_repair_prompt_name or ARCHITECT_REPAIR_PROMPT_NAME

    if not _PROMPT_NAME_RE.match(arch_name):
        raise ValueError(f"Invalid architect prompt name: {arch_name!r}")
    if not _PROMPT_NAME_RE.match(repair_name):
        raise ValueError(f"Invalid architect repair prompt name: {repair_name!r}")

    return arch_name, repair_name


def _format_brief_prompt(brief: RequirementBrief) -> str:
    """Format brief fields for architecture generation prompt."""
    lines: list[str] = [
        f"Summary: {brief.summary}",
        f"Target Users: {brief.users}",
    ]
    if brief.domain_hint:
        lines.append(f"Domain Hint: {brief.domain_hint}")
    if brief.data_involved:
        lines.append(f"Data Involved: {', '.join(brief.data_involved)}")
    if brief.stated_constraints:
        lines.append("Stated Constraints:")
        for c in brief.stated_constraints:
            lines.append(f"  - [{c.id}] {c.text}")
    if brief.numbers_given:
        lines.append("Known Numbers:")
        for n in brief.numbers_given:
            lines.append(f"  - {n.label}: {n.value}")
    if brief.assumptions:
        lines.append("Assumptions:")
        for a in brief.assumptions:
            lines.append(f"  - {a}")
    return "\n".join(lines)


def _apply_code_repair(
    spec: ArchitectureSpec,
    brief_constraints: dict[str, str],
    limits: Limits,
) -> tuple[ArchitectureSpec, list[ValidationIssue]]:
    """Apply deterministic graph repair: dead-ends and constraints."""
    patched_spec = spec
    all_warnings: list[ValidationIssue] = []

    # 1. Patch dead ends if any exist
    dead_end_patched, dead_end_warnings = patch_dead_ends(patched_spec, brief_constraints, limits)
    if dead_end_warnings:
        patched_spec = dead_end_patched
        all_warnings.extend(dead_end_warnings)

    # 2. Patch constraints if any violations exist
    constraint_patched, constraint_warnings = patch_constraints(
        patched_spec, brief_constraints, limits
    )
    if constraint_warnings:
        patched_spec = constraint_patched
        all_warnings.extend(constraint_warnings)

    return patched_spec, all_warnings


async def generate_and_validate(
    brief: RequirementBrief,
    llm: LLMClient,
) -> tuple[ArchitectureSpec, str, int, ValidationResult | None]:
    """Generate an ArchitectureSpec with an automated repair loop capped at 3 calls total.

    Returns:
        (ArchitectureSpec, prompt_version, total_calls_used, validation_result)
    """
    settings = get_settings()
    if not settings.llm_model_architect:
        raise LLMNotConfiguredError("LLM model for architect is not configured.")

    prompt_name, repair_prompt_name = resolve_architect_prompt_names(settings)

    limits = Limits(
        max_nodes=settings.max_nodes,
        max_edges=settings.max_edges,
        max_layers=settings.max_layers,
    )
    brief_constraints = {c.id: c.text for c in brief.stated_constraints}
    brief_text = _format_brief_prompt(brief)

    # Call 1: Initial generation
    system_prompt = load_prompt(f"{prompt_name}.md")
    patterns_text = load_patterns(version="v5")
    user_prompt = (
        f"Architectural Reference Patterns:\n\n{patterns_text}\n\n"
        f"---\n\n"
        f"Requirement Brief to Implement:\n\n"
        f"<untrusted_user_text>\n{brief_text}\n</untrusted_user_text>\n\n"
        f"Synthesize a complete, valid ArchitectureSpec satisfying all constraints."
    )

    try:
        raw_output = await llm.generate_json(
            task=LLMTask.ARCHITECT,
            system=system_prompt,
            user=user_prompt,
            schema=ArchitectureSpec,
        )
    except LLMNotConfigured as exc:
        raise LLMNotConfiguredError(str(exc)) from exc

    spec, result = parse_and_validate(raw_output, brief_constraints, limits)
    logger.info(
        "design_attempt",
        attempt=1,
        issue_codes=[err.code for err in result.errors],
        constraint_kinds=[c.kind for c in spec.constraints] if spec else [],
    )

    if result.ok and spec is not None:
        return spec, prompt_name, 1, result

    last_raw = raw_output
    last_errors = [err.message for err in result.errors]

    # Attempt deterministic code repair after Call 1 failure
    if spec is not None:
        patched_spec, repair_warnings = _apply_code_repair(spec, brief_constraints, limits)
        if repair_warnings:
            patched_result = validate(patched_spec, brief_constraints, limits)
            known_node_ids = {n.id for n in patched_spec.nodes}
            repaired_node_ids = list(
                dict.fromkeys(
                    nid for w in repair_warnings for nid in w.ids if nid in known_node_ids
                )
            )
            logger.info(
                "code_repair",
                attempt=1,
                issue_codes=[w.code for w in repair_warnings],
                node_ids=repaired_node_ids,
                edges_net_change=len(patched_spec.edges) - len(spec.edges),
            )
            if patched_result.ok:
                # Merge repair warnings into result warnings
                merged_warnings = list(patched_result.warnings) + repair_warnings
                final_result = ValidationResult(
                    errors=patched_result.errors,
                    warnings=merged_warnings,
                    skipped=patched_result.skipped,
                )
                return (
                    spec.model_validate(patched_spec.model_dump()),
                    f"{prompt_name}+code_repair",
                    1,
                    final_result,
                )
            last_raw = patched_spec.model_dump(by_alias=True)
            last_errors = [err.message for err in patched_result.errors]

    # Repair loop: Up to 2 repair calls (total calls = 3)
    repair_system = load_prompt(f"{repair_prompt_name}.md")

    for call_idx in range(2, MAX_ARCHITECT_CALLS + 1):
        errors_formatted = "\n".join(f"- {err}" for err in last_errors)
        previous_json = json.dumps(last_raw, indent=2)

        repair_user_prompt = (
            f"The previous architecture specification failed validation.\n\n"
            f"Validation Errors to Fix:\n{errors_formatted}\n\n"
            f"Previous Specification Candidate:\n{previous_json}\n\n"
            f"<untrusted_user_text>\n"
            f"{brief_text}\n"
            f"</untrusted_user_text>\n\n"
            f"Fix all reported validation errors and return a repaired, fully valid ArchitectureSpec."
        )

        try:
            raw_output = await llm.generate_json(
                task=LLMTask.ARCHITECT,
                system=repair_system,
                user=repair_user_prompt,
                schema=ArchitectureSpec,
            )
        except LLMNotConfigured as exc:
            raise LLMNotConfiguredError(str(exc)) from exc

        spec, result = parse_and_validate(raw_output, brief_constraints, limits)
        logger.info(
            "design_attempt",
            attempt=call_idx,
            issue_codes=[err.code for err in result.errors],
            constraint_kinds=[c.kind for c in spec.constraints] if spec else [],
        )

        if result.ok and spec is not None:
            return spec, f"{prompt_name}+{repair_prompt_name}", call_idx, result

        last_raw = raw_output
        last_errors = [err.message for err in result.errors]

        # Attempt deterministic code repair after repair call failure
        if spec is not None:
            patched_spec, repair_warnings = _apply_code_repair(spec, brief_constraints, limits)
            if repair_warnings:
                patched_result = validate(patched_spec, brief_constraints, limits)
                known_node_ids = {n.id for n in patched_spec.nodes}
                repaired_node_ids = list(
                    dict.fromkeys(
                        nid for w in repair_warnings for nid in w.ids if nid in known_node_ids
                    )
                )
                logger.info(
                    "code_repair",
                    attempt=call_idx,
                    issue_codes=[w.code for w in repair_warnings],
                    node_ids=repaired_node_ids,
                    edges_net_change=len(patched_spec.edges) - len(spec.edges),
                )
                if patched_result.ok:
                    merged_warnings = list(patched_result.warnings) + repair_warnings
                    final_result = ValidationResult(
                        errors=patched_result.errors,
                        warnings=merged_warnings,
                        skipped=patched_result.skipped,
                    )
                    version_label = f"{prompt_name}+{repair_prompt_name}+code_repair"
                    return (
                        spec.model_validate(patched_spec.model_dump()),
                        version_label,
                        call_idx,
                        final_result,
                    )
                last_raw = patched_spec.model_dump(by_alias=True)
                last_errors = [err.message for err in patched_result.errors]

    # Exhausted all 3 calls without valid specification
    raise DesignFailedError(issues=last_errors)
