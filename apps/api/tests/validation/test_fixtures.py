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


def test_w_no_ai_node_lint_direct() -> None:
    """W_NO_AI_NODE triggers only when zero nodes have needs_model: true and populates all node ids."""
    from archnemesis.modules.validation.lints import check_lints
    from archnemesis.modules.validation.models import ArchitectureSpec, NodeSpec

    # Case 1: No model nodes -> triggers warning with all node ids
    spec_no_ai = ArchitectureSpec(
        nodes=[
            NodeSpec(id="n1", name="N1", type="worker", role="R1", inputs=[], outputs=["out"]),
            NodeSpec(id="n2", name="N2", type="sink", role="R2", inputs=["out"], outputs=[]),
        ],
        edges=[],
        constraints=[],
        entry_ids=["n1"],
        exit_ids=["n2"],
    )
    warnings = check_lints(spec_no_ai)
    warning_codes = [w.code for w in warnings]
    assert "W_NO_AI_NODE" in warning_codes
    w_issue = next(w for w in warnings if w.code == "W_NO_AI_NODE")
    assert set(w_issue.ids) == {"n1", "n2"}
    assert (
        w_issue.message
        == "No node in the architecture is marked as using an AI model (needs_model: true)."
    )

    # Case 2: At least one model node -> zero W_NO_AI_NODE warning
    spec_with_ai = ArchitectureSpec(
        nodes=[
            NodeSpec(
                id="n1",
                name="N1",
                type="agent",
                role="R1",
                inputs=[],
                outputs=["out"],
                needs_model=True,
            ),
            NodeSpec(id="n2", name="N2", type="sink", role="R2", inputs=["out"], outputs=[]),
        ],
        edges=[],
        constraints=[],
        entry_ids=["n1"],
        exit_ids=["n2"],
    )
    warnings_with_ai = check_lints(spec_with_ai)
    assert "W_NO_AI_NODE" not in [w.code for w in warnings_with_ai]


def test_w_merge_as_agent_lint_direct() -> None:
    """W_MERGE_AS_AGENT triggers when in-degree >= 2 and node is an AI agent or model."""
    from archnemesis.modules.validation.lints import check_lints
    from archnemesis.modules.validation.models import ArchitectureSpec, EdgeSpec, NodeSpec

    def _e(from_node: str, to: str, flows: str, condition: str | None = None) -> EdgeSpec:
        d = {"from": from_node, "to": to, "flows": flows}
        if condition is not None:
            d["condition"] = condition
        return EdgeSpec.model_validate(d)

    # Case 1: Merge node with in-degree 2 and ai_role='agent' -> triggers warning
    spec_agent_merge = ArchitectureSpec(
        nodes=[
            NodeSpec(
                id="entry",
                name="Entry",
                type="gateway",
                role="Entry",
                inputs=[],
                outputs=["a", "b"],
            ),
            NodeSpec(id="w1", name="W1", type="worker", role="W1", inputs=["a"], outputs=["out1"]),
            NodeSpec(id="w2", name="W2", type="worker", role="W2", inputs=["b"], outputs=["out2"]),
            NodeSpec(
                id="aggregator",
                name="Aggregator",
                type="agent",
                role="Merge",
                inputs=["out1", "out2"],
                outputs=["res"],
                needs_model=True,
                ai_role="agent",
                tools=["search_tool"],
            ),
            NodeSpec(id="exit", name="Exit", type="sink", role="Exit", inputs=["res"], outputs=[]),
        ],
        edges=[
            _e("entry", "w1", "a"),
            _e("entry", "w2", "b"),
            _e("w1", "aggregator", "out1"),
            _e("w2", "aggregator", "out2"),
            _e("aggregator", "exit", "res"),
        ],
        constraints=[],
        entry_ids=["entry"],
        exit_ids=["exit"],
    )
    warnings = check_lints(spec_agent_merge)
    warning_codes = [w.code for w in warnings]
    assert "W_MERGE_AS_AGENT" in warning_codes
    w_issue = next(w for w in warnings if w.code == "W_MERGE_AS_AGENT")
    assert w_issue.ids == ["aggregator"]
    assert (
        w_issue.message
        == "Merge node 'aggregator' combines parallel branches but is marked as an AI agent or model. Plain code should be used unless AI judgment is required."
    )

    # Case 2: Plain code merge node (ai_role='none', needs_model=False) -> does NOT trigger W_MERGE_AS_AGENT
    spec_plain_merge = spec_agent_merge.model_copy(deep=True)
    for n in spec_plain_merge.nodes:
        if n.id == "aggregator":
            n.ai_role = "none"
            n.needs_model = False
            n.tools = []
    warnings_plain = check_lints(spec_plain_merge)
    assert "W_MERGE_AS_AGENT" not in [w.code for w in warnings_plain]

    # Case 3: Merge node with conditional outgoing edges -> STILL triggers W_MERGE_AS_AGENT
    spec_conditional_merge = ArchitectureSpec(
        nodes=[
            NodeSpec(
                id="entry",
                name="Entry",
                type="gateway",
                role="Entry",
                inputs=[],
                outputs=["a", "b"],
            ),
            NodeSpec(id="w1", name="W1", type="worker", role="W1", inputs=["a"], outputs=["out1"]),
            NodeSpec(id="w2", name="W2", type="worker", role="W2", inputs=["b"], outputs=["out2"]),
            NodeSpec(
                id="aggregator",
                name="Aggregator",
                type="model",
                role="Merge",
                inputs=["out1", "out2"],
                outputs=["res1", "res2"],
                needs_model=True,
                ai_role="model",
            ),
            NodeSpec(
                id="exit1", name="Exit 1", type="sink", role="Exit 1", inputs=["res1"], outputs=[]
            ),
            NodeSpec(
                id="exit2", name="Exit 2", type="sink", role="Exit 2", inputs=["res2"], outputs=[]
            ),
        ],
        edges=[
            _e("entry", "w1", "a"),
            _e("entry", "w2", "b"),
            _e("w1", "aggregator", "out1"),
            _e("w2", "aggregator", "out2"),
            _e("aggregator", "exit1", "res1", condition="amount < 1000"),
            _e("aggregator", "exit2", "res2", condition="amount >= 1000"),
        ],
        constraints=[],
        entry_ids=["entry"],
        exit_ids=["exit1", "exit2"],
    )
    warnings_cond = check_lints(spec_conditional_merge)
    assert "W_MERGE_AS_AGENT" in [w.code for w in warnings_cond]

    # Case 4: Multiple merge nodes -> one warning per node, sorted ids
    spec_multi_merge = ArchitectureSpec(
        nodes=[
            NodeSpec(
                id="entry",
                name="Entry",
                type="gateway",
                role="Entry",
                inputs=[],
                outputs=["a", "b"],
            ),
            NodeSpec(id="w1", name="W1", type="worker", role="W1", inputs=["a"], outputs=["o1"]),
            NodeSpec(id="w2", name="W2", type="worker", role="W2", inputs=["b"], outputs=["o2"]),
            NodeSpec(
                id="merge_z",
                name="Merge Z",
                type="agent",
                role="Z",
                inputs=["o1", "o2"],
                outputs=["oz"],
                needs_model=True,
                ai_role="agent",
                tools=["t1"],
            ),
            NodeSpec(
                id="merge_a",
                name="Merge A",
                type="model",
                role="A",
                inputs=["o1", "o2"],
                outputs=["oa"],
                needs_model=True,
                ai_role="model",
            ),
            NodeSpec(
                id="exit", name="Exit", type="sink", role="Exit", inputs=["oz", "oa"], outputs=[]
            ),
        ],
        edges=[
            _e("entry", "w1", "a"),
            _e("entry", "w2", "b"),
            _e("w1", "merge_z", "o1"),
            _e("w2", "merge_z", "o2"),
            _e("w1", "merge_a", "o1"),
            _e("w2", "merge_a", "o2"),
            _e("merge_z", "exit", "oz"),
            _e("merge_a", "exit", "oa"),
        ],
        constraints=[],
        entry_ids=["entry"],
        exit_ids=["exit"],
    )
    warnings_multi = check_lints(spec_multi_merge)
    merge_warnings = [w for w in warnings_multi if w.code == "W_MERGE_AS_AGENT"]
    assert len(merge_warnings) == 2
    assert merge_warnings[0].ids == ["merge_a"]
    assert merge_warnings[1].ids == ["merge_z"]
