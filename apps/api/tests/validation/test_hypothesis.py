"""Bounded property-based tests for ArchitectureSpec validation using Hypothesis."""

from datetime import timedelta

from hypothesis import given, settings
from hypothesis import strategies as st

from archnemesis.modules.validation import (
    ArchitectureSpec,
    ConstraintSpec,
    EdgeSpec,
    Limits,
    NodeSpec,
    validate,
)


@st.composite
def valid_dag_specs(draw: st.DrawFn) -> ArchitectureSpec:
    """Generate random structurally valid DAG specifications."""
    num_nodes = draw(st.integers(min_value=3, max_value=8))
    node_ids = [f"node_{i:02d}" for i in range(num_nodes)]

    nodes = [
        NodeSpec(
            id=nid,
            name=f"Service {nid}",
            type="worker",
            role=f"Role for {nid}",
            inputs=["in_data"] if i > 0 else [],
            outputs=["out_data"] if i < num_nodes - 1 else [],
            needs_model=False,
        )
        for i, nid in enumerate(node_ids)
    ]

    # Build a linear backbone ensuring full reachability: 0 -> 1 -> ... -> num_nodes - 1
    edges: list[EdgeSpec] = [
        EdgeSpec.model_validate({"from": node_ids[i], "to": node_ids[i + 1], "flows": f"flow_{i}"})
        for i in range(num_nodes - 1)
    ]

    # Optionally add forward jump edges preserving DAG property
    for i in range(num_nodes):
        for j in range(i + 2, num_nodes):
            if draw(st.booleans()):
                edges.append(
                    EdgeSpec.model_validate(
                        {"from": node_ids[i], "to": node_ids[j], "flows": f"f_{i}_{j}"}
                    )
                )

    return ArchitectureSpec(
        nodes=nodes,
        edges=edges,
        constraints=[],
        entry_ids=[node_ids[0]],
        exit_ids=[node_ids[-1]],
    )


@settings(max_examples=50, deadline=timedelta(milliseconds=500))
@given(spec=valid_dag_specs())
def test_random_valid_dags_pass_validation(spec: ArchitectureSpec) -> None:
    """Random valid DAG topologies must always pass validation."""
    result = validate(spec, brief_constraints={}, limits=Limits())
    assert result.ok, f"Generated valid DAG failed validation: {[e.message for e in result.errors]}"
    assert len(result.errors) == 0


@settings(max_examples=50, deadline=timedelta(milliseconds=500))
@given(spec=valid_dag_specs())
def test_adding_orphan_is_always_caught(spec: ArchitectureSpec) -> None:
    """Adding an isolated orphan node must always produce E_ORPHAN."""
    orphan = NodeSpec(
        id="orphan_node",
        name="Orphan Service",
        type="isolated",
        role="Isolated from graph",
        inputs=[],
        outputs=[],
        needs_model=False,
    )
    spec_with_orphan = ArchitectureSpec(
        nodes=spec.nodes + [orphan],
        edges=spec.edges,
        constraints=spec.constraints,
        entry_ids=spec.entry_ids,
        exit_ids=spec.exit_ids,
    )
    result = validate(spec_with_orphan, brief_constraints={}, limits=Limits())
    codes = [e.code for e in result.errors]
    assert "E_ORPHAN" in codes


@settings(max_examples=50, deadline=timedelta(milliseconds=500))
@given(spec=valid_dag_specs())
def test_adding_duplicate_id_is_always_caught(spec: ArchitectureSpec) -> None:
    """Adding a duplicate node ID must always produce E_DUP_ID."""
    dup_node = NodeSpec(
        id=spec.nodes[0].id,
        name="Duplicate Node",
        type="worker",
        role="Duplicates first node id",
        inputs=[],
        outputs=[],
        needs_model=False,
    )
    spec_with_dup = ArchitectureSpec(
        nodes=spec.nodes + [dup_node],
        edges=spec.edges,
        constraints=spec.constraints,
        entry_ids=spec.entry_ids,
        exit_ids=spec.exit_ids,
    )
    result = validate(spec_with_dup, brief_constraints={}, limits=Limits())
    codes = [e.code for e in result.errors]
    assert "E_DUP_ID" in codes


@settings(max_examples=50, deadline=timedelta(milliseconds=500))
@given(spec=valid_dag_specs())
def test_adding_dangling_edge_is_always_caught(spec: ArchitectureSpec) -> None:
    """Adding an edge pointing to a non-existent node must always produce E_BAD_REF."""
    dangling_edge = EdgeSpec.model_validate(
        {"from": spec.nodes[0].id, "to": "non_existent_node", "flows": "leak"}
    )
    spec_with_bad_ref = ArchitectureSpec(
        nodes=spec.nodes,
        edges=spec.edges + [dangling_edge],
        constraints=spec.constraints,
        entry_ids=spec.entry_ids,
        exit_ids=spec.exit_ids,
    )
    result = validate(spec_with_bad_ref, brief_constraints={}, limits=Limits())
    codes = [e.code for e in result.errors]
    assert "E_BAD_REF" in codes


@st.composite
def linear_backbone_specs(draw: st.DrawFn) -> ArchitectureSpec:
    """Generate a strictly linear pipeline 0 -> 1 -> ... -> n-1 (guarantees a is predecessor of b)."""
    num_nodes = draw(st.integers(min_value=3, max_value=6))
    node_ids = [f"node_{i:02d}" for i in range(num_nodes)]

    nodes = [
        NodeSpec(
            id=nid,
            name=f"Service {nid}",
            type="worker",
            role=f"Role for {nid}",
            inputs=["in_data"] if i > 0 else [],
            outputs=["out_data"] if i < num_nodes - 1 else [],
            needs_model=False,
        )
        for i, nid in enumerate(node_ids)
    ]

    edges: list[EdgeSpec] = [
        EdgeSpec.model_validate({"from": node_ids[i], "to": node_ids[i + 1], "flows": f"flow_{i}"})
        for i in range(num_nodes - 1)
    ]

    return ArchitectureSpec(
        nodes=nodes,
        edges=edges,
        constraints=[],
        entry_ids=[node_ids[0]],
        exit_ids=[node_ids[-1]],
    )


# 1. must_exist: passing and failing
@settings(max_examples=50, deadline=timedelta(milliseconds=500))
@given(spec=valid_dag_specs())
def test_hypothesis_must_exist_passing(spec: ArchitectureSpec) -> None:
    """A must_exist constraint targeting an existing node passes."""
    target_id = spec.nodes[0].id
    constraint = ConstraintSpec(
        id="c_exist", text="Node must exist", kind="must_exist", node_id=target_id, covers=[]
    )
    spec_with_c = ArchitectureSpec(
        nodes=spec.nodes,
        edges=spec.edges,
        constraints=[constraint],
        entry_ids=spec.entry_ids,
        exit_ids=spec.exit_ids,
    )
    result = validate(spec_with_c, brief_constraints={}, limits=Limits())
    assert result.ok
    assert len(result.errors) == 0


@settings(max_examples=50, deadline=timedelta(milliseconds=500))
@given(spec=valid_dag_specs())
def test_hypothesis_must_exist_failing(spec: ArchitectureSpec) -> None:
    """A must_exist constraint referencing a missing node fails with E_CONSTRAINT_BAD_PARAM."""
    constraint = ConstraintSpec(
        id="c_exist_bad",
        text="Node must exist",
        kind="must_exist",
        node_id="non_existent_node",
        covers=[],
    )
    spec_with_c = ArchitectureSpec(
        nodes=spec.nodes,
        edges=spec.edges,
        constraints=[constraint],
        entry_ids=spec.entry_ids,
        exit_ids=spec.exit_ids,
    )
    result = validate(spec_with_c, brief_constraints={}, limits=Limits())
    assert not result.ok
    codes = [e.code for e in result.errors]
    assert "E_CONSTRAINT_BAD_PARAM" in codes


# 2. must_pass_through: passing and failing (with witness)
@settings(max_examples=50, deadline=timedelta(milliseconds=500))
@given(spec=linear_backbone_specs())
def test_hypothesis_must_pass_through_passing(spec: ArchitectureSpec) -> None:
    """In a strictly linear backbone, middle node cannot be avoided; must_pass_through passes."""
    mid_node = spec.nodes[1].id
    constraint = ConstraintSpec(
        id="c_pass",
        text="Must pass through middle node",
        kind="must_pass_through",
        node_id=mid_node,
        covers=[],
    )
    spec_with_c = ArchitectureSpec(
        nodes=spec.nodes,
        edges=spec.edges,
        constraints=[constraint],
        entry_ids=spec.entry_ids,
        exit_ids=spec.exit_ids,
    )
    result = validate(spec_with_c, brief_constraints={}, limits=Limits())
    assert result.ok
    assert len(result.errors) == 0


@settings(max_examples=50, deadline=timedelta(milliseconds=500))
@given(spec=linear_backbone_specs())
def test_hypothesis_must_pass_through_failing_with_witness(spec: ArchitectureSpec) -> None:
    """Adding a direct entry-to-exit bypass causes must_pass_through to fail with a witness."""
    mid_node = spec.nodes[1].id
    constraint = ConstraintSpec(
        id="c_pass",
        text="Must pass through middle node",
        kind="must_pass_through",
        node_id=mid_node,
        covers=[],
    )
    # Add bypass edge from entry directly to exit
    bypass_edge = EdgeSpec.model_validate(
        {"from": spec.entry_ids[0], "to": spec.exit_ids[0], "flows": "bypass"}
    )
    spec_with_bypass = ArchitectureSpec(
        nodes=spec.nodes,
        edges=spec.edges + [bypass_edge],
        constraints=[constraint],
        entry_ids=spec.entry_ids,
        exit_ids=spec.exit_ids,
    )
    result = validate(spec_with_bypass, brief_constraints={}, limits=Limits())
    assert not result.ok
    viol_errors = [e for e in result.errors if e.code == "E_CONSTRAINT_VIOLATED"]
    assert len(viol_errors) >= 1
    # Check that witness path is included in message
    assert "a path that avoids" in viol_errors[0].message


# 3. must_not_connect: passing and failing (with witness)
@settings(max_examples=50, deadline=timedelta(milliseconds=500))
@given(spec=valid_dag_specs())
def test_hypothesis_must_not_connect_passing(spec: ArchitectureSpec) -> None:
    """In any DAG, the exit node has no directed path back to the entry node; must_not_connect passes."""
    exit_id = spec.exit_ids[0]
    entry_id = spec.entry_ids[0]
    constraint = ConstraintSpec(
        id="c_no_conn",
        text="Exit must not connect back to entry",
        kind="must_not_connect",
        a=exit_id,
        b=entry_id,
        covers=[],
    )
    spec_with_c = ArchitectureSpec(
        nodes=spec.nodes,
        edges=spec.edges,
        constraints=[constraint],
        entry_ids=spec.entry_ids,
        exit_ids=spec.exit_ids,
    )
    result = validate(spec_with_c, brief_constraints={}, limits=Limits())
    assert result.ok
    assert len(result.errors) == 0


@settings(max_examples=50, deadline=timedelta(milliseconds=500))
@given(spec=valid_dag_specs())
def test_hypothesis_must_not_connect_failing_with_witness(spec: ArchitectureSpec) -> None:
    """In a valid DAG where entry reaches exit, asserting they must not connect fails with witness path."""
    entry_id = spec.entry_ids[0]
    exit_id = spec.exit_ids[0]
    constraint = ConstraintSpec(
        id="c_no_conn_fail",
        text="Entry must not connect to exit",
        kind="must_not_connect",
        a=entry_id,
        b=exit_id,
        covers=[],
    )
    spec_with_c = ArchitectureSpec(
        nodes=spec.nodes,
        edges=spec.edges,
        constraints=[constraint],
        entry_ids=spec.entry_ids,
        exit_ids=spec.exit_ids,
    )
    result = validate(spec_with_c, brief_constraints={}, limits=Limits())
    assert not result.ok
    viol_errors = [e for e in result.errors if e.code == "E_CONSTRAINT_VIOLATED"]
    assert len(viol_errors) >= 1
    assert "path found from" in viol_errors[0].message


# 4. must_precede: passing and failing (with witness)
@settings(max_examples=50, deadline=timedelta(milliseconds=500))
@given(spec=linear_backbone_specs())
def test_hypothesis_must_precede_passing(spec: ArchitectureSpec) -> None:
    """In a linear backbone 0 -> 1 -> 2 -> ..., node 1 precedes node 2 with no bypass."""
    node_1 = spec.nodes[1].id
    node_2 = spec.nodes[2].id
    constraint = ConstraintSpec(
        id="c_precede",
        text="Node 1 must precede Node 2",
        kind="must_precede",
        a=node_1,
        b=node_2,
        covers=[],
    )
    spec_with_c = ArchitectureSpec(
        nodes=spec.nodes,
        edges=spec.edges,
        constraints=[constraint],
        entry_ids=spec.entry_ids,
        exit_ids=spec.exit_ids,
    )
    result = validate(spec_with_c, brief_constraints={}, limits=Limits())
    assert result.ok
    assert len(result.errors) == 0


@settings(max_examples=50, deadline=timedelta(milliseconds=500))
@given(spec=linear_backbone_specs())
def test_hypothesis_must_precede_failing_with_witness(spec: ArchitectureSpec) -> None:
    """Adding an entry-to-node2 bypass edge violates must_precede(1, 2) and yields witness path."""
    entry_id = spec.entry_ids[0]
    node_1 = spec.nodes[1].id
    node_2 = spec.nodes[2].id
    constraint = ConstraintSpec(
        id="c_precede",
        text="Node 1 must precede Node 2",
        kind="must_precede",
        a=node_1,
        b=node_2,
        covers=[],
    )
    bypass_edge = EdgeSpec.model_validate({"from": entry_id, "to": node_2, "flows": "bypass_to_2"})
    spec_with_bypass = ArchitectureSpec(
        nodes=spec.nodes,
        edges=spec.edges + [bypass_edge],
        constraints=[constraint],
        entry_ids=spec.entry_ids,
        exit_ids=spec.exit_ids,
    )
    result = validate(spec_with_bypass, brief_constraints={}, limits=Limits())
    assert not result.ok
    viol_errors = [e for e in result.errors if e.code == "E_CONSTRAINT_VIOLATED"]
    assert len(viol_errors) >= 1
    assert "without passing through" in viol_errors[0].message
