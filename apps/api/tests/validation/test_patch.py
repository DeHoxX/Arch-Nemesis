"""Unit and property-based tests for pure patch application and diff computation."""

from datetime import timedelta

from hypothesis import given, settings
from hypothesis import strategies as st

from archnemesis.modules.validation.models import (
    ArchitectureSpec,
    ConstraintSpec,
    EdgeSpec,
    Limits,
    NodeSpec,
)
from archnemesis.modules.validation.patch import (
    Changes,
    ConstraintPatchSpec,
    DiffResult,
    EdgePatchSpec,
    NodePatchSpec,
    Op,
    Patch,
    apply_patch,
    describe_diff,
)
from archnemesis.modules.validation.validate import validate


def make_valid_base_spec() -> tuple[ArchitectureSpec, dict[str, str]]:
    """Create a fully valid 4-node pipeline with brief requirements covered."""
    nodes = [
        NodeSpec(
            id="node_in",
            name="Ingress Gateway",
            type="gateway",
            role="Accepts incoming requests",
            inputs=[],
            outputs=["payload"],
            needs_model=False,
        ),
        NodeSpec(
            id="node_auth",
            name="Auth Service",
            type="auth",
            role="Authenticates requests",
            inputs=["payload"],
            outputs=["auth_token"],
            needs_model=False,
        ),
        NodeSpec(
            id="node_proc",
            name="Processor Service",
            type="processor",
            role="Processes requests",
            inputs=["auth_token"],
            outputs=["result"],
            needs_model=False,
        ),
        NodeSpec(
            id="node_out",
            name="Egress Sink",
            type="sink",
            role="Returns response to client",
            inputs=["result"],
            outputs=[],
            needs_model=False,
        ),
    ]
    edges = [
        EdgeSpec.model_validate({"from": "node_in", "to": "node_auth", "flows": "req"}),
        EdgeSpec.model_validate({"from": "node_auth", "to": "node_proc", "flows": "token"}),
        EdgeSpec.model_validate({"from": "node_proc", "to": "node_out", "flows": "res"}),
    ]
    constraints = [
        ConstraintSpec(
            id="c_auth_pass",
            text="All traffic must pass through auth service",
            kind="must_pass_through",
            node_id="node_auth",
            covers=["bc1"],
        ),
        ConstraintSpec(
            id="c_proc_exist",
            text="Processor node must exist",
            kind="must_exist",
            node_id="node_proc",
            covers=["bc2"],
        ),
    ]
    spec = ArchitectureSpec(
        nodes=nodes,
        edges=edges,
        constraints=constraints,
        entry_ids=["node_in"],
        exit_ids=["node_out"],
    )
    briefs = {"bc1": "Security authentication required", "bc2": "Data processing required"}
    return spec, briefs


# =========================================================================
# Op Success Tests (all 9 operations)
# =========================================================================


def test_op_add_node_success() -> None:
    """add_node correctly inserts a valid node."""
    spec, briefs = make_valid_base_spec()
    new_node = NodePatchSpec(
        id="node_audit",
        name="Audit Logger",
        type="logger",
        role="Logs events",
        inputs=["auth_token"],
        outputs=["audit_record"],
    )
    # Add node and connect it into graph
    patch = Patch(
        ops=[
            Op(op="add_node", node=new_node),
            Op(
                op="add_edge",
                edge=EdgePatchSpec.model_validate(
                    {"from": "node_auth", "to": "node_audit", "flows": "evt"}
                ),
            ),
            Op(
                op="add_edge",
                edge=EdgePatchSpec.model_validate(
                    {"from": "node_audit", "to": "node_out", "flows": "rec"}
                ),
            ),
        ]
    )
    res = apply_patch(spec, patch, briefs, Limits())
    assert res.ok, f"apply_patch failed with issues: {res.issues}"
    assert res.status == "proposed"
    assert res.spec is not None
    assert any(n.id == "node_audit" for n in res.spec.nodes)
    assert res.diff is not None
    assert "node_audit" in res.diff.added_nodes


def test_op_remove_node_success() -> None:
    """remove_node successfully deletes an unreferenced node."""
    spec, briefs = make_valid_base_spec()
    # First add an extra worker branch so we can delete a node cleanly
    extra = NodeSpec(
        id="node_extra",
        name="Extra Worker",
        type="worker",
        role="Auxiliary work",
        inputs=[],
        outputs=[],
    )
    spec.nodes.append(extra)
    patch = Patch(ops=[Op(op="remove_node", node_id="node_extra")])
    res = apply_patch(spec, patch, briefs, Limits())
    assert res.ok, f"apply_patch failed with issues: {res.issues}"
    assert res.status == "proposed"
    assert res.spec is not None
    assert not any(n.id == "node_extra" for n in res.spec.nodes)
    assert res.diff is not None
    assert "node_extra" in res.diff.removed_nodes


def test_op_edit_node_success() -> None:
    """edit_node successfully updates permissible fields."""
    spec, briefs = make_valid_base_spec()
    patch = Patch(
        ops=[
            Op(
                op="edit_node",
                node_id="node_auth",
                changes=Changes(
                    name="Enterprise Auth Service",
                    tech_options=["OAuth2", "Keycloak"],
                    needs_model=True,
                    ai_role="model",
                ),
            )
        ]
    )
    res = apply_patch(spec, patch, briefs, Limits())
    assert res.ok, f"apply_patch failed with issues: {res.issues}"
    assert res.status == "proposed"
    assert res.spec is not None
    node = next(n for n in res.spec.nodes if n.id == "node_auth")
    assert node.name == "Enterprise Auth Service"
    assert node.tech_options == ["OAuth2", "Keycloak"]
    assert node.needs_model is True
    assert node.ai_role == "model"
    assert res.diff is not None
    assert len(res.diff.changed_nodes) == 1
    assert "name" in res.diff.changed_nodes[0].changed_fields


def test_op_add_edge_success() -> None:
    """add_edge successfully inserts a new DAG jump edge without violating must_pass_through."""
    spec, briefs = make_valid_base_spec()
    patch = Patch(
        ops=[
            Op(
                op="add_edge",
                edge=EdgePatchSpec.model_validate(
                    {
                        "from": "node_auth",
                        "to": "node_out",
                        "flows": "fast_path",
                        "condition": "cached",
                    }
                ),
            )
        ]
    )
    res = apply_patch(spec, patch, briefs, Limits())
    assert res.ok, f"apply_patch failed with issues: {res.issues}"
    assert res.status == "proposed"
    assert res.spec is not None
    assert any(e.from_node == "node_auth" and e.to == "node_out" for e in res.spec.edges)
    assert res.diff is not None
    assert len(res.diff.added_edges) == 1


def test_op_remove_edge_success() -> None:
    """remove_edge successfully deletes an edge without disconnecting the graph."""
    spec, briefs = make_valid_base_spec()
    # Add redundant jump edge first that preserves must_pass_through on node_auth
    jump = EdgeSpec.model_validate(
        {"from": "node_auth", "to": "node_out", "flows": "bypass", "condition": "admin"}
    )
    spec.edges.append(jump)
    patch = Patch(ops=[Op(op="remove_edge", from_id="node_auth", to_id="node_out")])
    res = apply_patch(spec, patch, briefs, Limits())
    assert res.ok, f"apply_patch failed with issues: {res.issues}"
    assert res.status == "proposed"
    assert res.spec is not None
    assert not any(e.from_node == "node_auth" and e.to == "node_out" for e in res.spec.edges)
    assert res.diff is not None
    assert len(res.diff.removed_edges) == 1


def test_op_add_constraint_success() -> None:
    """add_constraint successfully attaches a new valid constraint that satisfies graph rules."""
    spec, briefs = make_valid_base_spec()
    c = ConstraintPatchSpec(
        id="c_out_not_in",
        text="Egress sink must not connect back to ingress gateway",
        kind="must_not_connect",
        a="node_out",
        b="node_in",
        covers=[],
    )
    patch = Patch(ops=[Op(op="add_constraint", constraint=c)])
    res = apply_patch(spec, patch, briefs, Limits())
    assert res.ok, f"apply_patch failed with issues: {res.issues}"
    assert res.status == "proposed"
    assert res.spec is not None
    assert any(con.id == "c_out_not_in" for con in res.spec.constraints)
    assert res.diff is not None
    assert "c_out_not_in" in res.diff.added_constraints


def test_op_edit_constraint_success() -> None:
    """edit_constraint updates text and covers without changing kind or id."""
    spec, briefs = make_valid_base_spec()
    patch = Patch(
        ops=[
            Op(
                op="edit_constraint",
                constraint_id="c_proc_exist",
                changes=Changes(text="Processor node must exist and handle scale"),
            )
        ]
    )
    res = apply_patch(spec, patch, briefs, Limits())
    assert res.ok, f"apply_patch failed with issues: {res.issues}"
    assert res.status == "proposed"
    assert res.spec is not None
    c = next(con for con in res.spec.constraints if con.id == "c_proc_exist")
    assert c.text == "Processor node must exist and handle scale"
    assert c.kind == "must_exist"  # unchanged
    assert res.diff is not None
    assert len(res.diff.changed_constraints) == 1
    assert "text" in res.diff.changed_constraints[0].changed_fields


def test_op_remove_constraint_success() -> None:
    """remove_constraint removes constraint when coverage is not broken."""
    spec, briefs = make_valid_base_spec()
    # Add a non-coverage constraint to remove cleanly
    spec.constraints.append(
        ConstraintSpec(
            id="c_extra",
            text="Auxiliary constraint",
            kind="must_exist",
            node_id="node_in",
            covers=[],
        )
    )
    patch = Patch(ops=[Op(op="remove_constraint", constraint_id="c_extra")])
    res = apply_patch(spec, patch, briefs, Limits())
    assert res.ok, f"apply_patch failed with issues: {res.issues}"
    assert res.status == "proposed"
    assert res.spec is not None
    assert not any(c.id == "c_extra" for c in res.spec.constraints)
    assert res.diff is not None
    assert "c_extra" in res.diff.removed_constraints


def test_op_set_entry_exit_success() -> None:
    """set_entry_exit updates entry and exit lists cleanly."""
    spec, briefs = make_valid_base_spec()
    patch = Patch(
        ops=[
            Op(
                op="set_entry_exit",
                entry_ids=["node_in"],
                exit_ids=["node_out"],
            )
        ]
    )
    res = apply_patch(spec, patch, briefs, Limits())
    assert res.ok, f"apply_patch failed with issues: {res.issues}"
    assert res.status == "proposed"
    assert res.spec is not None
    assert res.spec.entry_ids == ["node_in"]
    assert res.spec.exit_ids == ["node_out"]


# =========================================================================
# Every P_ Error Code Test
# =========================================================================


def test_error_p_empty_patch() -> None:
    """Empty ops list triggers P_EMPTY_PATCH."""
    spec, briefs = make_valid_base_spec()
    res = apply_patch(spec, Patch(ops=[]), briefs, Limits())
    assert not res.ok
    assert res.status == "blocked"
    assert len(res.issues) == 1
    assert res.issues[0].code == "P_EMPTY_PATCH"


def test_error_p_too_many_ops_at_limit_plus_one() -> None:
    """Ops count exceeding max_patch_ops triggers P_TOO_MANY_OPS at limit+1."""
    spec, briefs = make_valid_base_spec()
    limit = 3
    ops = [
        Op(
            op="edit_node",
            node_id="node_auth",
            changes=Changes(name=f"Name {i}"),
        )
        for i in range(limit + 1)
    ]
    res = apply_patch(spec, Patch(ops=ops), briefs, Limits(), max_patch_ops=limit)
    assert not res.ok
    assert res.status == "blocked"
    assert len(res.issues) == 1
    assert res.issues[0].code == "P_TOO_MANY_OPS"
    assert f"limit of {limit}" in res.issues[0].message


def test_error_p_missing_field() -> None:
    """Each operation missing its required fields returns P_MISSING_FIELD."""
    spec, briefs = make_valid_base_spec()

    cases = [
        Op(op="add_node", node=None),
        Op(op="remove_node", node_id=None),
        Op(op="edit_node", node_id="node_auth", changes=None),
        Op(op="edit_node", node_id=None, changes=Changes(name="New")),
        Op(op="add_edge", edge=None),
        Op(op="remove_edge", from_id=None, to_id="node_out"),
        Op(op="remove_edge", from_id="node_in", to_id=None),
        Op(op="add_constraint", constraint=None),
        Op(op="remove_constraint", constraint_id=None),
        Op(op="edit_constraint", constraint_id="c1", changes=None),
        Op(op="edit_constraint", constraint_id=None, changes=Changes(text="New")),
        Op(op="set_entry_exit", entry_ids=None, exit_ids=None),
    ]

    for missing_op in cases:
        res = apply_patch(spec, Patch(ops=[missing_op]), briefs, Limits())
        assert not res.ok
        assert res.status == "blocked"
        assert len(res.issues) == 1
        assert res.issues[0].code == "P_MISSING_FIELD", f"Failed for {missing_op}"


def test_error_p_unknown_node() -> None:
    """Targeting a non-existent node returns P_UNKNOWN_NODE."""
    spec, briefs = make_valid_base_spec()
    res1 = apply_patch(
        spec,
        Patch(ops=[Op(op="remove_node", node_id="ghost_node")]),
        briefs,
        Limits(),
    )
    assert not res1.ok
    assert res1.status == "blocked"
    assert res1.issues[0].code == "P_UNKNOWN_NODE"

    res2 = apply_patch(
        spec,
        Patch(ops=[Op(op="edit_node", node_id="ghost_node", changes=Changes(name="New"))]),
        briefs,
        Limits(),
    )
    assert not res2.ok
    assert res2.status == "blocked"
    assert res2.issues[0].code == "P_UNKNOWN_NODE"


def test_error_p_unknown_edge() -> None:
    """Removing a non-existent edge returns P_UNKNOWN_EDGE."""
    spec, briefs = make_valid_base_spec()
    res = apply_patch(
        spec,
        Patch(ops=[Op(op="remove_edge", from_id="node_in", to_id="node_out")]),
        briefs,
        Limits(),
    )
    assert not res.ok
    assert res.status == "blocked"
    assert res.issues[0].code == "P_UNKNOWN_EDGE"


def test_error_p_unknown_constraint() -> None:
    """Targeting a non-existent constraint returns P_UNKNOWN_CONSTRAINT."""
    spec, briefs = make_valid_base_spec()
    res1 = apply_patch(
        spec,
        Patch(ops=[Op(op="remove_constraint", constraint_id="c_ghost")]),
        briefs,
        Limits(),
    )
    assert not res1.ok
    assert res1.status == "blocked"
    assert res1.issues[0].code == "P_UNKNOWN_CONSTRAINT"

    res2 = apply_patch(
        spec,
        Patch(ops=[Op(op="edit_constraint", constraint_id="c_ghost", changes=Changes(text="X"))]),
        briefs,
        Limits(),
    )
    assert not res2.ok
    assert res2.status == "blocked"
    assert res2.issues[0].code == "P_UNKNOWN_CONSTRAINT"


def test_error_p_duplicate_id() -> None:
    """Duplicate node, edge, or constraint ID returns P_DUPLICATE_ID."""
    spec, briefs = make_valid_base_spec()

    # Duplicate node
    res1 = apply_patch(
        spec,
        Patch(
            ops=[
                Op(
                    op="add_node",
                    node=NodePatchSpec(
                        id="node_auth",
                        name="Auth Dupe",
                        type="worker",
                        role="Dupe",
                    ),
                )
            ]
        ),
        briefs,
        Limits(),
    )
    assert not res1.ok
    assert res1.issues[0].code == "P_DUPLICATE_ID"

    # Duplicate edge
    res2 = apply_patch(
        spec,
        Patch(
            ops=[
                Op(
                    op="add_edge",
                    edge=EdgePatchSpec.model_validate(
                        {"from": "node_in", "to": "node_auth", "flows": "dupe"}
                    ),
                )
            ]
        ),
        briefs,
        Limits(),
    )
    assert not res2.ok
    assert res2.issues[0].code == "P_DUPLICATE_ID"

    # Duplicate constraint
    res3 = apply_patch(
        spec,
        Patch(
            ops=[
                Op(
                    op="add_constraint",
                    constraint=ConstraintPatchSpec(
                        id="c_auth_pass",
                        text="Dupe",
                        kind="must_exist",
                        node_id="node_in",
                    ),
                )
            ]
        ),
        briefs,
        Limits(),
    )
    assert not res3.ok
    assert res3.issues[0].code == "P_DUPLICATE_ID"


# =========================================================================
# Structural and Constraint Failure Rules
# =========================================================================


def test_remove_node_with_edges_gives_e_bad_ref() -> None:
    """Removing a node that still has connecting edges fails validation with E_BAD_REF."""
    spec, briefs = make_valid_base_spec()
    # node_auth has edges in and out
    patch = Patch(ops=[Op(op="remove_node", node_id="node_auth")])
    res = apply_patch(spec, patch, briefs, Limits())
    assert not res.ok
    assert res.status == "blocked"
    error_codes = [issue.code for issue in res.issues]
    assert "E_BAD_REF" in error_codes


def test_removing_node_that_must_pass_through_needs_is_blocked_and_names_rule() -> None:
    """Removing a node required by a must_pass_through constraint is blocked and names the rule."""
    spec, briefs = make_valid_base_spec()
    # Safely bypass node_auth with a direct edge so no graph structure error, but remove node_auth
    patch = Patch(
        ops=[
            Op(
                op="add_edge",
                edge=EdgePatchSpec.model_validate(
                    {"from": "node_in", "to": "node_proc", "flows": "bypass"}
                ),
            ),
            Op(op="remove_edge", from_id="node_in", to_id="node_auth"),
            Op(op="remove_edge", from_id="node_auth", to_id="node_proc"),
            Op(op="remove_node", node_id="node_auth"),
        ]
    )
    res = apply_patch(spec, patch, briefs, Limits())
    assert not res.ok
    assert res.status == "blocked"
    # Constraint references missing node_auth or rule fails
    rule_issues = [
        issue
        for issue in res.issues
        if "c_auth_pass" in issue.ids or "c_auth_pass" in issue.message or "node_auth" in issue.ids
    ]
    assert len(rule_issues) >= 1


def test_removing_rule_that_uncovers_brief_gives_needs_confirmation() -> None:
    """Removing a constraint that uniquely covers a brief constraint returns needs_confirmation."""
    spec, briefs = make_valid_base_spec()
    # c_auth_pass covers bc1
    patch = Patch(ops=[Op(op="remove_constraint", constraint_id="c_auth_pass")])
    res = apply_patch(spec, patch, briefs, Limits())
    assert not res.ok
    assert res.status == "needs_confirmation"
    assert res.uncovered_brief_ids == ["bc1"]
    error_codes = [issue.code for issue in res.issues]
    assert "E_BRIEF_CONSTRAINT_UNCOVERED" in error_codes

    # Re-applying with dropped_brief_ids={"bc1"} converts status to proposed and ok=True
    res_confirmed = apply_patch(
        spec,
        patch,
        briefs,
        Limits(),
        dropped_brief_ids=frozenset(["bc1"]),
    )
    assert res_confirmed.ok, f"apply_patch failed with issues: {res_confirmed.issues}"
    assert res_confirmed.status == "proposed"


def test_deep_copy_isolation() -> None:
    """Original ArchitectureSpec is never modified during apply_patch."""
    spec, briefs = make_valid_base_spec()
    orig_nodes_count = len(spec.nodes)
    orig_edges_count = len(spec.edges)

    patch = Patch(
        ops=[
            Op(
                op="add_node",
                node=NodePatchSpec(
                    id="node_new",
                    name="New Node",
                    type="service",
                    role="Service",
                ),
            )
        ]
    )
    apply_patch(spec, patch, briefs, Limits())
    assert len(spec.nodes) == orig_nodes_count
    assert len(spec.edges) == orig_edges_count


# =========================================================================
# Diff and describe_diff Determinism
# =========================================================================


def test_diff_and_describe_diff_exact_and_deterministic() -> None:
    """Diff computation and change note formatting are strictly ordered and deterministic."""
    spec, briefs = make_valid_base_spec()

    patch = Patch(
        ops=[
            Op(
                op="add_node",
                node=NodePatchSpec(
                    id="node_zeta",
                    name="Zeta Service",
                    type="worker",
                    role="Worker",
                ),
            ),
            Op(
                op="add_node",
                node=NodePatchSpec(
                    id="node_alpha",
                    name="Alpha Service",
                    type="worker",
                    role="Worker",
                ),
            ),
        ]
    )
    res = apply_patch(spec, patch, briefs, Limits())
    assert res.diff is not None
    # Nodes in diff must be sorted alphabetically by id
    assert res.diff.added_nodes == ["node_alpha", "node_zeta"]

    note = describe_diff(res.diff)
    assert note == "Added node node_alpha; Added node node_zeta."
    assert len(note) <= 200

    # Truncation test
    long_diff = DiffResult(
        added_nodes=[f"long_node_identifier_name_{i:03d}" for i in range(20)],
        removed_nodes=[],
        changed_nodes=[],
        added_edges=[],
        removed_edges=[],
        changed_edges=[],
        added_constraints=[],
        removed_constraints=[],
        changed_constraints=[],
        entry_changed=True,
        exit_changed=False,
    )
    long_note = describe_diff(long_diff)
    assert len(long_note) <= 200


# =========================================================================
# Hypothesis Invariant Test
# =========================================================================


@st.composite
def patch_valid_dag_specs(draw: st.DrawFn) -> tuple[ArchitectureSpec, dict[str, str]]:
    """Generate random valid DAG specs with 2+ char node IDs and all brief constraints covered."""
    num_nodes = draw(st.integers(min_value=3, max_value=6))
    node_ids = [f"nd_{i:02d}" for i in range(num_nodes)]

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

    # Every brief constraint is covered by a constraint
    brief_dict = {"bc_01": "Requirement one", "bc_02": "Requirement two"}
    constraints = [
        ConstraintSpec(
            id="c_cov_01",
            text="Must exist node 0",
            kind="must_exist",
            node_id=node_ids[0],
            covers=["bc_01"],
        ),
        ConstraintSpec(
            id="c_cov_02",
            text="Must exist node 1",
            kind="must_exist",
            node_id=node_ids[1],
            covers=["bc_02"],
        ),
    ]

    spec = ArchitectureSpec(
        nodes=nodes,
        edges=edges,
        constraints=constraints,
        entry_ids=[node_ids[0]],
        exit_ids=[node_ids[-1]],
    )
    return spec, brief_dict


@st.composite
def random_patch_operations(
    draw: st.DrawFn,
) -> Patch:
    """Generate random patch operations (both valid and invalid)."""
    op_kind = draw(
        st.sampled_from(
            [
                "add_node",
                "remove_node",
                "edit_node",
                "add_edge",
                "remove_edge",
                "add_constraint",
                "remove_constraint",
                "set_entry_exit",
            ]
        )
    )

    ops: list[Op] = []
    if op_kind == "add_node":
        idx = draw(st.integers(min_value=10, max_value=99))
        ops.append(
            Op(
                op="add_node",
                node=NodePatchSpec(
                    id=f"nd_{idx}",
                    name=f"Random Node {idx}",
                    type="service",
                    role="Generated",
                ),
            )
        )
    elif op_kind == "remove_node":
        ops.append(Op(op="remove_node", node_id="nd_01"))
    elif op_kind == "edit_node":
        ops.append(
            Op(
                op="edit_node",
                node_id="nd_00",
                changes=Changes(name="Updated Name"),
            )
        )
    elif op_kind == "add_edge":
        ops.append(
            Op(
                op="add_edge",
                edge=EdgePatchSpec.model_validate(
                    {"from": "nd_00", "to": "nd_02", "flows": "jump"}
                ),
            )
        )
    elif op_kind == "remove_edge":
        ops.append(Op(op="remove_edge", from_id="nd_00", to_id="nd_01"))
    elif op_kind == "add_constraint":
        ops.append(
            Op(
                op="add_constraint",
                constraint=ConstraintPatchSpec(
                    id="c_rand",
                    text="Random must exist",
                    kind="must_exist",
                    node_id="nd_00",
                ),
            )
        )
    elif op_kind == "remove_constraint":
        ops.append(Op(op="remove_constraint", constraint_id="c_cov_01"))
    elif op_kind == "set_entry_exit":
        ops.append(Op(op="set_entry_exit", entry_ids=["nd_00"]))

    return Patch(ops=ops)


@settings(max_examples=50, deadline=timedelta(milliseconds=500))
@given(
    spec_and_briefs=patch_valid_dag_specs(),
    patch=random_patch_operations(),
)
def test_hypothesis_apply_patch_soundness(
    spec_and_briefs: tuple[ArchitectureSpec, dict[str, str]],
    patch: Patch,
) -> None:
    """Hypothesis invariant: apply_patch either fails or returns a fully valid spec, never an invalid spec marked ok."""
    spec, briefs = spec_and_briefs
    # Non-empty guard
    assert len(spec.nodes) >= 3
    assert len(briefs) >= 2
    assert len(patch.ops) >= 1

    res = apply_patch(spec, patch, briefs, Limits())
    if res.ok:
        assert res.spec is not None
        # Must pass independent validate() with zero errors
        val_check = validate(res.spec, briefs, Limits())
        assert val_check.ok, (
            f"apply_patch returned ok=True on invalid spec! Issues: {[e.message for e in val_check.errors]}"
        )
        assert len(val_check.errors) == 0
    else:
        assert res.status in ("blocked", "needs_confirmation")
        assert len(res.issues) > 0
