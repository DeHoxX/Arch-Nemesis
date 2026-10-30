"""Verification engine for explanation drafts produced by the LLM."""

import math
import re

from archnemesis.modules.explainer.schemas import ExplanationDraft, VerificationIssue
from archnemesis.modules.validation.models import ArchitectureSpec
from archnemesis.modules.validation.ordering import order_nodes
from archnemesis.shared.brief import RequirementBrief

SPELLED_NUMBERS: dict[str, int] = {
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
    "eleven": 11,
    "twelve": 12,
    "thirteen": 13,
    "fourteen": 14,
    "fifteen": 15,
    "sixteen": 16,
    "seventeen": 17,
    "eighteen": 18,
    "nineteen": 19,
    "twenty": 20,
    "hundred": 100,
    "thousand": 1000,
    "million": 1000000,
    "billion": 1000000000,
}

SPELLED_NUMBERS_RE = re.compile(
    r"\b(" + "|".join(SPELLED_NUMBERS.keys()) + r")\b",
    re.IGNORECASE,
)

DIGIT_SEQUENCE_RE = re.compile(r"\d+(?:,\d+)*(?:\.\d+)?")

FORBIDDEN_WORDS_RE = re.compile(
    r"\b(cost|costs|price|pricing|budget|timeline|effort|roi|savings)\b",
    re.IGNORECASE,
)

COMPLIANCE_CLAIMS_RE = re.compile(
    r"\b(compliant|certified|guarantee|guarantees|guaranteed|fully secure)\b",
    re.IGNORECASE,
)


def _extract_allowed_numbers(
    spec: ArchitectureSpec,
    brief: RequirementBrief,
) -> tuple[set[int | float], set[str]]:
    """Extract numeric values and string representations permitted in explanations."""
    node_count = len(spec.nodes)
    allowed_numeric: set[int | float] = set(range(1, node_count + 1))
    allowed_strings: set[str] = {str(i) for i in range(1, node_count + 1)}

    for bn in brief.numbers_given:
        val_str = bn.value.strip()
        if not val_str:
            continue
        allowed_strings.add(val_str)
        cleaned_val = val_str.replace(",", "")
        allowed_strings.add(cleaned_val)

        for match in DIGIT_SEQUENCE_RE.finditer(val_str):
            seq = match.group(0)
            allowed_strings.add(seq)
            clean_seq = seq.replace(",", "")
            allowed_strings.add(clean_seq)
            try:
                if "." in clean_seq:
                    allowed_numeric.add(float(clean_seq))
                else:
                    int_val = int(clean_seq)
                    allowed_numeric.add(int_val)
                    allowed_numeric.add(float(int_val))
            except ValueError:
                pass

        try:
            if "." in cleaned_val:
                allowed_numeric.add(float(cleaned_val))
            else:
                int_val = int(cleaned_val)
                allowed_numeric.add(int_val)
                allowed_numeric.add(float(int_val))
        except ValueError:
            pass

    return allowed_numeric, allowed_strings


def _is_number_allowed(
    match_str: str,
    allowed_numeric: set[int | float],
    allowed_strings: set[str],
) -> bool:
    """Check if a matched digit sequence is within the allowed numbers."""
    if match_str in allowed_strings:
        return True
    clean = match_str.replace(",", "")
    if clean in allowed_strings:
        return True
    try:
        if "." in clean:
            val_f = float(clean)
            return any(math.isclose(val_f, float(n), rel_tol=1e-9) for n in allowed_numeric)
        val_i = int(clean)
        return val_i in allowed_numeric or float(val_i) in allowed_numeric
    except ValueError:
        return False


def _check_text_rules(
    text: str,
    field_name: str,
    allowed_numeric: set[int | float],
    allowed_strings: set[str],
    issues: list[VerificationIssue],
) -> None:
    """Check a text snippet for forbidden words, compliance claims, and unauthorized numbers."""
    for match in FORBIDDEN_WORDS_RE.finditer(text):
        issues.append(
            VerificationIssue(
                code="X_FORBIDDEN_WORD",
                message=f"Forbidden word '{match.group(0)}' found in explanation.",
                field=field_name,
            )
        )

    for match in COMPLIANCE_CLAIMS_RE.finditer(text):
        issues.append(
            VerificationIssue(
                code="X_COMPLIANCE_CLAIM",
                message=f"Compliance claim '{match.group(0)}' found in explanation.",
                field=field_name,
            )
        )

    for match in DIGIT_SEQUENCE_RE.finditer(text):
        num_str = match.group(0)
        if not _is_number_allowed(num_str, allowed_numeric, allowed_strings):
            issues.append(
                VerificationIssue(
                    code="X_NUMBER",
                    message=f"Unauthorized number '{num_str}' found in explanation.",
                    field=field_name,
                )
            )

    for match in SPELLED_NUMBERS_RE.finditer(text):
        word = match.group(0).lower()
        val = SPELLED_NUMBERS[word]
        if val not in allowed_numeric and float(val) not in allowed_numeric:
            issues.append(
                VerificationIssue(
                    code="X_NUMBER",
                    message=f"Unauthorized spelled number '{match.group(0)}' found in explanation.",
                    field=field_name,
                )
            )


def verify_draft(
    draft: ExplanationDraft,
    spec: ArchitectureSpec,
    brief: RequirementBrief,
    flow_order: list[str] | None = None,
) -> list[VerificationIssue]:
    """Verify an ExplanationDraft against the ArchitectureSpec and RequirementBrief.

    Returns a list of VerificationIssue diagnostic records (empty if draft is fully valid).
    """
    issues: list[VerificationIssue] = []

    spec_node_ids = {node.id for node in spec.nodes}
    spec_constraint_ids = {c.id for c in spec.constraints}

    # 1. Structural Checks: Unknown nodes and constraints
    for step in draft.flow_steps:
        if step.node_id not in spec_node_ids:
            issues.append(
                VerificationIssue(
                    code="X_UNKNOWN_NODE",
                    message=f"Unknown node '{step.node_id}' is not in the architecture specification.",
                    field="flow_steps",
                )
            )

    for part in draft.parts:
        if part.node_id not in spec_node_ids:
            issues.append(
                VerificationIssue(
                    code="X_UNKNOWN_NODE",
                    message=f"Unknown node '{part.node_id}' is not in the architecture specification.",
                    field="parts",
                )
            )

    for check in draft.checks:
        if check.constraint_id not in spec_constraint_ids:
            issues.append(
                VerificationIssue(
                    code="X_UNKNOWN_CONSTRAINT",
                    message=f"Unknown constraint '{check.constraint_id}' is not in the architecture specification.",
                    field="checks",
                )
            )

    # 2. Structural Checks: Missing parts
    part_node_ids = {part.node_id for part in draft.parts}
    for node in spec.nodes:
        if node.id not in part_node_ids:
            issues.append(
                VerificationIssue(
                    code="X_MISSING_PART",
                    message=f"Missing part explanation for node '{node.id}'.",
                    field="parts",
                )
            )

    # 3. Flow Order Check
    if flow_order is None:
        try:
            flow_order = order_nodes(spec)
        except ValueError:
            flow_order = [n.id for n in spec.nodes]

    flow_step_node_ids = [step.node_id for step in draft.flow_steps]
    if flow_step_node_ids != flow_order:
        issues.append(
            VerificationIssue(
                code="X_FLOW_ORDER",
                message="Flow steps must list every node exactly once in flow order.",
                field="flow_steps",
            )
        )

    # 4. Length Checks (X_TOO_LONG)
    if len(draft.overview) > 600:
        issues.append(
            VerificationIssue(
                code="X_TOO_LONG",
                message=f"Overview exceeds 600 characters ({len(draft.overview)}).",
                field="overview",
            )
        )

    for step in draft.flow_steps:
        if len(step.text) > 300:
            issues.append(
                VerificationIssue(
                    code="X_TOO_LONG",
                    message=f"Flow step for '{step.node_id}' exceeds 300 characters ({len(step.text)}).",
                    field="flow_steps",
                )
            )

    for part in draft.parts:
        if len(part.text) > 300:
            issues.append(
                VerificationIssue(
                    code="X_TOO_LONG",
                    message=f"Part explanation for '{part.node_id}' exceeds 300 characters ({len(part.text)}).",
                    field="parts",
                )
            )

    for check in draft.checks:
        if len(check.text) > 300:
            issues.append(
                VerificationIssue(
                    code="X_TOO_LONG",
                    message=f"Check explanation for '{check.constraint_id}' exceeds 300 characters ({len(check.text)}).",
                    field="checks",
                )
            )

    if len(draft.models_text) > 400:
        issues.append(
            VerificationIssue(
                code="X_TOO_LONG",
                message=f"Models text exceeds 400 characters ({len(draft.models_text)}).",
                field="models_text",
            )
        )

    # 5. Semantic Checks: Forbidden words, compliance claims, allowed numbers
    allowed_numeric, allowed_strings = _extract_allowed_numbers(spec, brief)

    _check_text_rules(draft.overview, "overview", allowed_numeric, allowed_strings, issues)

    for step in draft.flow_steps:
        _check_text_rules(
            step.text, f"flow_steps[{step.node_id}]", allowed_numeric, allowed_strings, issues
        )

    for part in draft.parts:
        _check_text_rules(
            part.text, f"parts[{part.node_id}]", allowed_numeric, allowed_strings, issues
        )

    for check in draft.checks:
        _check_text_rules(
            check.text, f"checks[{check.constraint_id}]", allowed_numeric, allowed_strings, issues
        )

    if draft.models_text:
        _check_text_rules(
            draft.models_text, "models_text", allowed_numeric, allowed_strings, issues
        )

    return issues
