"""Pipeline coordinator for ArchitectureSpec validation."""

from typing import Any

from pydantic import ValidationError

from archnemesis.modules.validation.checks import (
    check_duplicate_ids,
    check_entries_exits,
    check_graph_structure,
    check_limits,
    check_references,
)
from archnemesis.modules.validation.constraints import check_constraints, check_coverage
from archnemesis.modules.validation.graph import build_graph
from archnemesis.modules.validation.lints import check_lints
from archnemesis.modules.validation.models import (
    ArchitectureSpec,
    Limits,
    ValidationIssue,
    ValidationResult,
)


def validate(
    spec: ArchitectureSpec,
    brief_constraints: dict[str, str],
    limits: Limits,
) -> ValidationResult:
    """Execute the multi-stage validation pipeline on an ArchitectureSpec.

    Stages:
        1. (Schema - handled in parse_and_validate)
        2. Duplicate IDs
        3. References & Entry/Exit existence
        4. Limits (node & edge counts)
        5. Graph structure (cycles, self-loops, duplicate edges, orphans, reachability)
           - Skipped if step 2 or step 3 produced errors.
        6. Constraints (semantic graph constraints)
           - Skipped if step 5 produced any error.
        7. Coverage (brief constraint satisfaction)
           - Always runs.
        8. Lints (style and design warnings)
           - Runs only if there are zero errors across all prior steps.
    """
    errors: list[ValidationIssue] = []
    warnings: list[ValidationIssue] = []
    skipped: list[str] = []

    # Step 2: Duplicate IDs
    step2_errors = check_duplicate_ids(spec)
    errors.extend(step2_errors)

    # Step 3: References & Entry/Exit
    step3_errors = check_references(spec) + check_entries_exits(spec)
    errors.extend(step3_errors)

    # Step 4: Limits
    step4_errors = check_limits(spec, limits)
    errors.extend(step4_errors)

    # Step 5: Graph structure
    if step2_errors or step3_errors:
        skipped.append("graph_structure (skipped due to ID or reference errors)")
        skipped.append("constraints (skipped due to skipped graph structure)")
    else:
        graph = build_graph(spec)
        step5_errors = check_graph_structure(spec, graph)
        errors.extend(step5_errors)

        # Step 6: Constraints
        if step5_errors:
            skipped.append("constraints (skipped due to graph structure errors)")
        else:
            step6_errors = check_constraints(spec, graph, brief_constraints)
            errors.extend(step6_errors)

    # Step 7: Coverage (always runs)
    step7_errors = check_coverage(spec, brief_constraints)
    errors.extend(step7_errors)

    # Step 8: Lints (only if no errors)
    if not errors:
        warnings.extend(check_lints(spec, limits))
    else:
        skipped.append("lints (skipped due to validation errors)")

    # Sort issues deterministically by (code, ids)
    sorted_errors = sorted(errors, key=lambda issue: (issue.code, issue.ids))
    sorted_warnings = sorted(warnings, key=lambda issue: (issue.code, issue.ids))

    return ValidationResult(errors=sorted_errors, warnings=sorted_warnings, skipped=skipped)


def parse_and_validate(
    raw: dict[str, Any],
    brief_constraints: dict[str, str],
    limits: Limits,
) -> tuple[ArchitectureSpec | None, ValidationResult]:
    """Parse raw JSON dict into ArchitectureSpec and validate it. Never raises exceptions."""
    try:
        spec = ArchitectureSpec.model_validate(raw)
    except ValidationError as exc:
        details: list[str] = []
        for err in exc.errors():
            loc = ".".join(str(elem) for elem in err["loc"])
            msg = err["msg"]
            details.append(f"{loc}: {msg}")
            if len(details) >= 10:
                break

        detail_str = "; ".join(details)
        issue = ValidationIssue(
            code="E_SCHEMA",
            severity="error",
            message=f"The design is not in the required format: {detail_str}.",
            ids=[],
        )
        result = ValidationResult(
            errors=[issue],
            warnings=[],
            skipped=[
                "duplicate_ids",
                "references",
                "limits",
                "graph_structure",
                "constraints",
                "coverage",
                "lints",
            ],
        )
        return None, result
    except Exception as exc:  # noqa: BLE001
        issue = ValidationIssue(
            code="E_SCHEMA",
            severity="error",
            message=f"The design is not in the required format: {exc}.",
            ids=[],
        )
        result = ValidationResult(errors=[issue], warnings=[], skipped=["all_checks"])
        return None, result

    result = validate(spec, brief_constraints, limits)
    return spec, result
