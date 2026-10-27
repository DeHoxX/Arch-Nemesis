"""Unit and fixture discovery tests for ArchitectureSpec validation."""

import json
from pathlib import Path

import pytest

from archnemesis.modules.validation import Limits, parse_and_validate

FIXTURES_DIR = Path(__file__).parent / "fixtures"
VALID_DIR = FIXTURES_DIR / "valid"
BROKEN_DIR = FIXTURES_DIR / "broken"
LINTS_DIR = FIXTURES_DIR / "lints"

VALID_FILES = sorted(VALID_DIR.glob("*.json"), key=lambda p: p.name)
BROKEN_FILES = sorted(BROKEN_DIR.glob("*.json"), key=lambda p: p.name)
LINT_FILES = sorted(LINTS_DIR.glob("*.json"), key=lambda p: p.name)


@pytest.mark.parametrize("file_path", VALID_FILES, ids=lambda p: p.name)
def test_valid_fixture(file_path: Path) -> None:
    """Every valid domain fixture must pass validation with ok=True and zero errors."""
    with open(file_path, encoding="utf-8") as f:
        raw = json.load(f)

    # Build brief constraints dictionary from declared covers
    brief_constraints = {}
    for c in raw.get("constraints", []):
        for cover in c.get("covers", []):
            brief_constraints[cover] = f"Requirement for {cover}"

    spec, result = parse_and_validate(raw, brief_constraints=brief_constraints, limits=Limits())
    assert spec is not None, f"Failed to parse {file_path.name}: {result.errors}"
    assert result.ok, (
        f"Fixture {file_path.name} failed with errors: {[e.message for e in result.errors]}"
    )
    assert len(result.errors) == 0


@pytest.mark.parametrize("file_path", BROKEN_FILES, ids=lambda p: p.name)
def test_broken_fixture(file_path: Path) -> None:
    """Every broken fixture must fail validation with its prefixed error code and ok=False."""
    expected_code = file_path.name.split("__")[0]
    with open(file_path, encoding="utf-8") as f:
        raw = json.load(f)

    # For uncovered constraint test, provide an uncovered brief requirement
    brief_constraints = {}
    if expected_code == "E_BRIEF_CONSTRAINT_UNCOVERED":
        brief_constraints["uncovered_req"] = "Must protect consumer privacy"

    _spec, result = parse_and_validate(raw, brief_constraints=brief_constraints, limits=Limits())
    assert not result.ok, (
        f"Fixture {file_path.name} was expected to fail validation, but result.ok was True."
    )
    codes = [err.code for err in result.errors]
    assert expected_code in codes, (
        f"Fixture {file_path.name} did not produce expected error code '{expected_code}'. "
        f"Found error codes: {codes}. Issues: {[i.message for i in result.errors]}"
    )


@pytest.mark.parametrize("file_path", LINT_FILES, ids=lambda p: p.name)
def test_lint_fixture(file_path: Path) -> None:
    """Lint-only fixtures produce diagnostic warnings, have zero errors, and remain ok=True."""
    expected_code = file_path.name.split("__")[0]
    with open(file_path, encoding="utf-8") as f:
        raw = json.load(f)

    _spec, result = parse_and_validate(raw, brief_constraints={}, limits=Limits())
    assert result.ok, (
        f"Lint fixture {file_path.name} failed unexpectedly: {[e.message for e in result.errors]}"
    )
    assert len(result.errors) == 0, (
        f"Lint fixture {file_path.name} produced errors: {result.errors}"
    )
    warning_codes = [w.code for w in result.warnings]
    assert expected_code in warning_codes, (
        f"Lint fixture {file_path.name} did not produce expected warning '{expected_code}'. "
        f"Found warnings: {warning_codes}."
    )


def test_orphan_not_reported_as_unreachable() -> None:
    """An orphan node (isolated) must trigger E_ORPHAN and NOT E_UNREACHABLE_FROM_ENTRY or E_CANNOT_REACH_EXIT."""
    orphan_file = BROKEN_DIR / "E_ORPHAN__isolated_node.json"
    with open(orphan_file, encoding="utf-8") as f:
        raw = json.load(f)

    spec, result = parse_and_validate(raw, brief_constraints={}, limits=Limits())
    assert spec is not None
    codes = [e.code for e in result.errors]
    assert "E_ORPHAN" in codes
    assert "E_UNREACHABLE_FROM_ENTRY" not in codes
    assert "E_CANNOT_REACH_EXIT" not in codes
