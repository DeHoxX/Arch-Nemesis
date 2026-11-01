"""Tests for parse_and_validate error resilience and EdgeSpec aliasing."""

import pytest
from pydantic import ValidationError

from archnemesis.modules.validation import EdgeSpec, Limits, NodeSpec, parse_and_validate


def test_edge_spec_aliasing_and_serialization() -> None:
    """EdgeSpec parses {"from": ..., "to": ...} and dumps back with 'from'."""
    raw = {"from": "node_a", "to": "node_b", "flows": "payload"}
    edge = EdgeSpec.model_validate(raw)
    assert edge.from_node == "node_a"
    assert edge.to == "node_b"

    # Dump by alias must restore 'from' and include optional condition as None
    dumped = edge.model_dump(by_alias=True)
    assert dumped == {"from": "node_a", "to": "node_b", "flows": "payload", "condition": None}
    assert "from_node" not in dumped


def test_parse_and_validate_bad_types_never_raises() -> None:
    """Malformed non-dict and invalid property shapes produce E_SCHEMA and never raise."""
    raw_invalid = {
        "nodes": [{"id": 12345, "name": None}],  # Wrong types
        "edges": "not_a_list",
    }
    spec, result = parse_and_validate(raw_invalid, brief_constraints={}, limits=Limits())
    assert spec is None
    assert not result.ok
    assert len(result.errors) == 1
    assert result.errors[0].code == "E_SCHEMA"
    assert "The design is not in the required format:" in result.errors[0].message
    # Maximum 10 details capped
    details = result.errors[0].message.split(";")
    assert len(details) <= 10


def test_parse_and_validate_invalid_id_pattern() -> None:
    """Invalid node id pattern produces E_SCHEMA detail."""
    raw = {
        "nodes": [
            {
                "id": "123_invalid_start_with_number",
                "name": "Node",
                "type": "type",
                "role": "Role",
            }
        ]
    }
    spec, result = parse_and_validate(raw, brief_constraints={}, limits=Limits())
    assert spec is None
    assert not result.ok
    assert result.errors[0].code == "E_SCHEMA"
    assert "id" in result.errors[0].message


def test_node_spec_inputs_outputs_length_constraints() -> None:
    """Inputs and outputs accept data labels up to 120 chars and reject 121 chars."""
    valid_label = "a" * 120
    too_long_label = "a" * 121

    # 120 characters passes
    node = NodeSpec(
        id="valid_node",
        name="Valid Node",
        type="service",
        role="Handles operations",
        inputs=[valid_label],
        outputs=[valid_label],
    )
    assert len(node.inputs[0]) == 120
    assert len(node.outputs[0]) == 120

    # 121 characters in inputs raises ValidationError
    with pytest.raises(ValidationError):
        NodeSpec(
            id="bad_input_node",
            name="Bad Node",
            type="service",
            role="Handles operations",
            inputs=[too_long_label],
        )

    # 121 characters in outputs raises ValidationError
    with pytest.raises(ValidationError):
        NodeSpec(
            id="bad_output_node",
            name="Bad Node",
            type="service",
            role="Handles operations",
            outputs=[too_long_label],
        )

    # Via parse_and_validate, 121 chars yields E_SCHEMA
    raw_invalid = {
        "nodes": [
            {
                "id": "bad_node",
                "name": "Bad Node",
                "type": "service",
                "role": "Role",
                "inputs": [too_long_label],
                "outputs": [],
            }
        ],
        "edges": [],
        "constraints": [],
    }
    spec, result = parse_and_validate(raw_invalid, brief_constraints={}, limits=Limits())
    assert spec is None
    assert not result.ok
    assert any(err.code == "E_SCHEMA" for err in result.errors)


def test_edge_spec_condition_validation_and_alias() -> None:
    """EdgeSpec accepts condition up to 100 chars, rejects >100 chars, and serializes."""
    edge = EdgeSpec.model_validate(
        {"from": "a", "to": "b", "flows": "payload", "condition": "claim > 10000"}
    )
    assert edge.condition == "claim > 10000"
    dumped = edge.model_dump(by_alias=True)
    assert dumped["condition"] == "claim > 10000"
    assert dumped["from"] == "a"

    # Default condition is None
    edge_default = EdgeSpec.model_validate({"from": "a", "to": "b", "flows": "payload"})
    assert edge_default.condition is None

    # Condition > 100 chars raises ValidationError
    with pytest.raises(ValidationError):
        EdgeSpec.model_validate(
            {"from": "a", "to": "b", "flows": "payload", "condition": "x" * 101}
        )


def test_node_spec_ai_role_and_tools_validation() -> None:
    """NodeSpec validates tools max length 60 and max 5 tools."""
    # Valid tools
    node = NodeSpec(
        id="agent_node",
        name="Agent",
        type="agent",
        role="Performs work",
        ai_role="agent",
        tools=["web_search", "code_interpreter"],
    )
    assert node.ai_role == "agent"
    assert node.needs_model is True
    assert node.tools == ["web_search", "code_interpreter"]

    # More than 5 tools raises ValidationError
    with pytest.raises(ValidationError):
        NodeSpec(
            id="bad_tools_node",
            name="Agent",
            type="agent",
            role="Performs work",
            tools=["t1", "t2", "t3", "t4", "t5", "t6"],
        )

    # Tool name > 60 chars raises ValidationError
    with pytest.raises(ValidationError):
        NodeSpec(
            id="bad_tool_len",
            name="Agent",
            type="agent",
            role="Performs work",
            tools=["a" * 61],
        )


def test_node_spec_model_validator_synchronization() -> None:
    """Verify bidirectional synchronization between needs_model and ai_role across all 4 cases."""
    # Case 1: ai_role in ("model", "agent") sets needs_model=True
    node_agent = NodeSpec.model_validate(
        {"id": "a1", "name": "A1", "type": "t", "role": "r", "ai_role": "agent"}
    )
    assert node_agent.ai_role == "agent"
    assert node_agent.needs_model is True

    node_model = NodeSpec.model_validate(
        {"id": "m1", "name": "M1", "type": "t", "role": "r", "ai_role": "model"}
    )
    assert node_model.ai_role == "model"
    assert node_model.needs_model is True

    # Case 2: needs_model=True and ai_role missing or none sets ai_role="model"
    node_legacy = NodeSpec.model_validate(
        {"id": "l1", "name": "L1", "type": "t", "role": "r", "needs_model": True}
    )
    assert node_legacy.ai_role == "model"
    assert node_legacy.needs_model is True

    node_none_model = NodeSpec.model_validate(
        {
            "id": "l2",
            "name": "L2",
            "type": "t",
            "role": "r",
            "needs_model": True,
            "ai_role": "none",
        }
    )
    assert node_none_model.ai_role == "model"
    assert node_none_model.needs_model is True

    # Case 3: ai_role="none" with needs_model=False stays
    node_none = NodeSpec.model_validate(
        {
            "id": "n1",
            "name": "N1",
            "type": "t",
            "role": "r",
            "ai_role": "none",
            "needs_model": False,
        }
    )
    assert node_none.ai_role == "none"
    assert node_none.needs_model is False

    # Case 4: default with neither specified
    node_default = NodeSpec.model_validate({"id": "d1", "name": "D1", "type": "t", "role": "r"})
    assert node_default.ai_role == "none"
    assert node_default.needs_model is False


def test_legacy_stored_design_backward_compatibility() -> None:
    """Old stored specs (needs_model: true, no ai_role or tools) parse with 100% backward compatibility."""
    import json
    from pathlib import Path

    fixture_path = Path(__file__).parent / "fixtures" / "valid" / "customer_support_rag.json"
    with open(fixture_path, encoding="utf-8") as f:
        raw = json.load(f)

    # Build brief constraints dictionary from declared covers matching test_fixtures.py pattern
    brief_constraints = {}
    for c in raw.get("constraints", []):
        for cover in c.get("covers", []):
            brief_constraints[cover] = f"Requirement for {cover}"

    spec, result = parse_and_validate(raw, brief_constraints=brief_constraints, limits=Limits())
    assert spec is not None
    assert result.ok
    assert not any(err.code == "E_SCHEMA" for err in result.errors)

    # Non-vacuous check: at least one node has needs_model True
    model_nodes = [n for n in spec.nodes if n.needs_model]
    assert len(model_nodes) >= 1

    # Every node with needs_model True has ai_role "model" and empty tools
    for node in model_nodes:
        assert node.ai_role == "model"
        assert node.tools == []

    # Non-model nodes default to "none" and empty tools
    non_model_nodes = [n for n in spec.nodes if not n.needs_model]
    assert len(non_model_nodes) >= 1
    for node in non_model_nodes:
        assert node.ai_role == "none"
        assert node.tools == []
