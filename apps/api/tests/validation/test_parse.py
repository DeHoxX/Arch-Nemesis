"""Tests for parse_and_validate error resilience and EdgeSpec aliasing."""

from archnemesis.modules.validation import EdgeSpec, Limits, parse_and_validate


def test_edge_spec_aliasing_and_serialization() -> None:
    """EdgeSpec parses {"from": ..., "to": ...} and dumps back with 'from'."""
    raw = {"from": "node_a", "to": "node_b", "flows": "payload"}
    edge = EdgeSpec.model_validate(raw)
    assert edge.from_node == "node_a"
    assert edge.to == "node_b"

    # Dump by alias must restore 'from'
    dumped = edge.model_dump(by_alias=True)
    assert dumped == {"from": "node_a", "to": "node_b", "flows": "payload"}
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
