"""Tests asserting that every validation code and lint matches fixed templates from real fixtures."""

import json
import re
from pathlib import Path

from archnemesis.modules.validation import Limits, parse_and_validate

BROKEN_DIR = Path(__file__).parent / "fixtures" / "broken"
LINTS_DIR = Path(__file__).parent / "fixtures" / "lints"

# All 17 blocking error codes and 4 lint codes from Build Plan Section 5 & Phase 2
ALL_CODES = {
    "E_SCHEMA",
    "E_DUP_ID",
    "E_BAD_REF",
    "E_NO_ENTRY",
    "E_NO_EXIT",
    "E_ORPHAN",
    "E_UNREACHABLE_FROM_ENTRY",
    "E_CANNOT_REACH_EXIT",
    "E_CYCLE",
    "E_SELF_LOOP",
    "E_DUP_EDGE",
    "E_NODE_LIMIT",
    "E_EDGE_LIMIT",
    "E_UNKNOWN_CONSTRAINT_KIND",
    "E_CONSTRAINT_BAD_PARAM",
    "E_CONSTRAINT_VIOLATED",
    "E_BRIEF_CONSTRAINT_UNCOVERED",
    "W_MODEL_NODE_NO_INPUTS",
    "W_NODE_NO_OUTPUTS",
    "W_TOO_FEW_NODES",
    "W_DUP_NODE_NAME",
    "W_NO_AI_NODE",
    "W_CODE_REPAIR_APPLIED",
    "W_AGENT_WITHOUT_TOOLS",
    "W_MERGE_AS_AGENT",
}

TEMPLATE_PATTERNS = {
    "E_SCHEMA": r"^The design is not in the required format: .+\.$",
    "E_DUP_ID": r"^Two or more nodes share the id '[^']+'\.$",
    "E_BAD_REF": r"^'[^']+' refers to '[^']+', which is not a node\.$",
    "E_NO_ENTRY": r"^The design has no entry node\.$",
    "E_NO_EXIT": r"^The design has no exit node\.$",
    "E_ORPHAN": r"^Node '[^']+' is not connected to anything\.$",
    "E_UNREACHABLE_FROM_ENTRY": r"^Node '[^']+' cannot be reached from any entry node\.$",
    "E_CANNOT_REACH_EXIT": r"^Node '[^']+' has no path to any exit node\.$",
    "E_CYCLE": r"^The flow loops back on itself through: .+\. Version 1 designs must not contain loops\.$",
    "E_SELF_LOOP": r"^Node '[^']+' has an edge to itself\.$",
    "E_DUP_EDGE": r"^There is more than one edge from '[^']+' to '[^']+'\.$",
    "E_NODE_LIMIT": r"^The design has \d+ nodes; the maximum is \d+\.$",
    "E_EDGE_LIMIT": r"^The design has \d+ edges; the maximum is \d+\.$",
    "E_UNKNOWN_CONSTRAINT_KIND": r"^Rule '[^']+' uses the unknown kind '[^']+'\. Allowed kinds: must_exist, must_pass_through, must_not_connect, must_precede\.$",
    "E_CONSTRAINT_BAD_PARAM": (
        r"^Rule '[^']+' \([^)]+\) .+\.$|"
        r"^Rule '[^']+' lists covers '[^']+', which is not in the brief\.$"
    ),
    "E_CONSTRAINT_VIOLATED": r"^Rule not satisfied: .+ \(witness: .+\)\.$|^Rule not satisfied: .+\.$|^Rule not satisfied: .+ \(a path .+\)\.$|^Rule not satisfied: .+ \(path .+\)\.$|^Rule not satisfied: .+ \('[^']+' is an entry .+\)\.$",
    "E_BRIEF_CONSTRAINT_UNCOVERED": r"^The requirement '[^']+' is not covered by any rule\. Add a rule that lists '[^']+' in covers\.$",
    "W_MODEL_NODE_NO_INPUTS": r"^Node '[^']+' uses an AI model but lists no inputs\.$",
    "W_NODE_NO_OUTPUTS": r"^Node '[^']+' lists no outputs\.$",
    "W_TOO_FEW_NODES": r"^The design has only \d+ nodes; most real systems need more parts\.$",
    "W_DUP_NODE_NAME": r"^Nodes '[^']+' and '[^']+' have the same name\.$",
    "W_NO_AI_NODE": r"^No node in the architecture is marked as using an AI model \(needs_model: true\)\.$",
    "W_CODE_REPAIR_APPLIED": r"^Constraint '[^']+' satisfied by automated graph alignment: routed \d+ edge\(s\) through '[^']+'\.$",
    "W_AGENT_WITHOUT_TOOLS": r"^Agent node '[^']+' is declared as an agent but lists no tools\.$",
    "W_MERGE_AS_AGENT": r"^Merge node '[^']+' combines parallel branches but is marked as an AI agent or model\. Plain code should be used unless AI judgment is required\.$",
}


def test_every_code_produced_by_fixture_and_matches_template() -> None:
    """Every blocking code and warning must be produced by at least one fixture and match its template."""
    observed_codes: set[str] = set()

    all_fixture_files = list(BROKEN_DIR.glob("*.json")) + list(LINTS_DIR.glob("*.json"))
    for file_path in all_fixture_files:
        with open(file_path, encoding="utf-8") as f:
            raw = json.load(f)

        brief_constraints = {}
        if "E_BRIEF_CONSTRAINT_UNCOVERED" in file_path.name:
            brief_constraints["uncovered_req"] = "Must protect consumer privacy"

        _spec, result = parse_and_validate(
            raw, brief_constraints=brief_constraints, limits=Limits()
        )
        for issue in result.errors + result.warnings:
            observed_codes.add(issue.code)
            pattern = TEMPLATE_PATTERNS.get(issue.code)
            assert pattern is not None, f"No template pattern defined for code {issue.code}"
            assert re.match(pattern, issue.message), (
                f"Message for {issue.code} did not match template pattern.\n"
                f"Message: {issue.message}\nPattern: {pattern}"
            )

    # W_CODE_REPAIR_APPLIED is produced dynamically by patch_constraints (tested in test_repair.py)
    # rather than statically by an error fixture in broken/ or lints/
    missing_codes = (ALL_CODES - {"W_CODE_REPAIR_APPLIED"}) - observed_codes
    assert not missing_codes, (
        f"The following codes were not produced by any broken fixture: {missing_codes}"
    )
