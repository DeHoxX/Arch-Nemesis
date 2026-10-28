"""Service layer for architecture generation and multi-step validation repair loop."""

import json

from archnemesis.errors import DesignFailedError, LLMNotConfiguredError
from archnemesis.llm.base import LLMClient, LLMNotConfigured, LLMTask
from archnemesis.modules.validation.models import ArchitectureSpec, Limits
from archnemesis.modules.validation.validate import parse_and_validate
from archnemesis.prompts import load_patterns, load_prompt
from archnemesis.settings import get_settings
from archnemesis.shared.brief import RequirementBrief

MAX_ARCHITECT_CALLS: int = 3


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


async def generate_and_validate(
    brief: RequirementBrief,
    llm: LLMClient,
) -> tuple[ArchitectureSpec, str, int]:
    """Generate an ArchitectureSpec with an automated repair loop capped at 3 calls total.

    Returns:
        (ArchitectureSpec, prompt_version, total_calls_used)
    """
    settings = get_settings()
    if not settings.llm_model_architect:
        raise LLMNotConfiguredError("LLM model for architect is not configured.")

    limits = Limits(max_nodes=settings.max_nodes, max_edges=settings.max_edges)
    brief_constraints = {c.id: c.text for c in brief.stated_constraints}
    brief_text = _format_brief_prompt(brief)

    # Call 1: Initial generation
    system_prompt = load_prompt("architect_v1.md")
    patterns_text = load_patterns()
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
    if result.ok and spec is not None:
        return spec, "architect_v1", 1

    last_raw = raw_output
    last_errors = [err.message for err in result.errors]

    # Repair loop: Up to 2 repair calls (total calls = 3)
    repair_system = load_prompt("architect_repair_v1.md")

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
        if result.ok and spec is not None:
            return spec, "architect_v1+architect_repair_v1", call_idx

        last_raw = raw_output
        last_errors = [err.message for err in result.errors]

    # Exhausted all 3 calls without valid specification
    raise DesignFailedError(issues=last_errors)
