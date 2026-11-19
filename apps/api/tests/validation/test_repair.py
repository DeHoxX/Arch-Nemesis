"""Unit tests and property-based tests for deterministic constraint graph repair."""

from typing import Any

import networkx as nx
from hypothesis import given, settings
from hypothesis import strategies as st

from archnemesis.modules.validation import Limits, validate
from archnemesis.modules.validation.models import (
    ArchitectureSpec,
    ConstraintSpec,
    EdgeSpec,
    NodeSpec,
)
from archnemesis.modules.validation.repair import patch_constraints, patch_dead_ends


def _create_node(node_id: str, is_model: bool = False) -> NodeSpec:
    return NodeSpec(
        id=node_id,
        name=node_id.replace("_", " ").title(),
        type="service",
        role=f"Role description for {node_id} component.",
        inputs=["data_in"],
        outputs=["data_out"],
        tech_options=["Python"],
        needs_model=is_model,
    )


def _edge(from_node: str, to: str, flows: str = "flow") -> EdgeSpec:
    return EdgeSpec.model_validate({"from": from_node, "to": to, "flows": flows})


def test_repair_must_pass_through_reroutes_bypass_path() -> None:
    """Real claims bypass path fixture: bypass is rerouted through fraud_scorer, acyclic, passes validate."""
    nodes = [
        _create_node("claim_gateway"),
        _create_node("ingress_queue"),
        _create_node("doc_extraction_agent", is_model=True),
        _create_node("policy_knowledge_store"),
        _create_node("policy_evaluator_agent", is_model=True),
        _create_node("claim_dispatcher"),
        _create_node("fraud_scorer", is_model=True),
        _create_node("auto_adjudicator_agent", is_model=True),
        _create_node("validator_agent", is_model=True),
    ]

    # Initial bypass path connects claim_dispatcher -> auto_adjudicator -> validator_agent
    # while fraud_scorer runs on a parallel branch to validator_agent
    edges = [
        _edge("claim_gateway", "ingress_queue", "submit"),
        _edge("ingress_queue", "doc_extraction_agent", "pull"),
        _edge("doc_extraction_agent", "policy_knowledge_store", "query"),
        _edge("policy_knowledge_store", "policy_evaluator_agent", "rules"),
        _edge("policy_evaluator_agent", "claim_dispatcher", "dispatch"),
        _edge("claim_dispatcher", "fraud_scorer", "check"),
        _edge("fraud_scorer", "validator_agent", "fraud_score_result"),
        _edge("claim_dispatcher", "auto_adjudicator_agent", "adjudicate"),
        _edge("auto_adjudicator_agent", "validator_agent", "validate"),
    ]

    constraints = [
        ConstraintSpec(
            id="c1",
            kind="must_pass_through",
            text="Every claim must pass through the fraud check before any approval.",
            node_id="fraud_scorer",
            covers=["bc1"],
        )
    ]

    spec = ArchitectureSpec(
        nodes=nodes,
        edges=edges,
        constraints=constraints,
        entry_ids=["claim_gateway"],
        exit_ids=["validator_agent"],
    )

    brief_constraints = {"bc1": "Fraud check mandatory"}
    limits = Limits()

    # Verify that original spec FAILS must_pass_through
    orig_result = validate(spec, brief_constraints, limits)
    assert not orig_result.ok
    assert any(e.code == "E_CONSTRAINT_VIOLATED" for e in orig_result.errors)

    # Apply deterministic patch
    patched_spec, warnings = patch_constraints(spec, brief_constraints, limits)
    assert len(warnings) == 1
    assert warnings[0].code == "W_CODE_REPAIR_APPLIED"
    assert "fraud_scorer" in warnings[0].message

    # Validate patched spec
    patched_result = validate(patched_spec, brief_constraints, limits)
    assert patched_result.ok
    assert len(patched_result.errors) == 0


def test_repair_warning_template_format() -> None:
    """W_CODE_REPAIR_APPLIED warning message matches the fixed template format."""
    import re

    nodes = [
        _create_node("node_a"),
        _create_node("node_t", is_model=True),
        _create_node("node_b"),
    ]
    edges = [_edge("node_a", "node_b", "f")]
    constraints = [
        ConstraintSpec(
            id="c1",
            kind="must_pass_through",
            text="Traffic must pass through node_t",
            node_id="node_t",
            covers=["bc1"],
        )
    ]
    spec = ArchitectureSpec(
        nodes=nodes,
        edges=edges,
        constraints=constraints,
        entry_ids=["node_a"],
        exit_ids=["node_b"],
    )
    patched, warnings = patch_constraints(spec, {"bc1": "req"}, Limits())
    assert patched is not None
    assert len(warnings) == 1
    pattern = (
        r"^Constraint '[^']+' satisfied by automated graph alignment: "
        r"routed \d+ edge\(s\) through '[^']+'\.$"
    )
    assert re.match(pattern, warnings[0].message)


def test_repair_exit_sink_bypass() -> None:
    """Exit-sink rule: auxiliary sinks (out-degree 0, exit_ids, not in constraint) are fed after T."""
    nodes = [
        _create_node("gateway"),
        _create_node("fraud_check", is_model=True),
        _create_node("delivery"),
        _create_node("audit_sink"),
    ]

    edges = [
        _edge("gateway", "fraud_check", "route"),
        _edge("fraud_check", "delivery", "deliver"),
        _edge("gateway", "audit_sink", "early_audit"),
    ]

    constraints = [
        ConstraintSpec(
            id="c1",
            kind="must_pass_through",
            text="All traffic must pass through fraud_check",
            node_id="fraud_check",
            covers=["bc1"],
        )
    ]

    spec = ArchitectureSpec(
        nodes=nodes,
        edges=edges,
        constraints=constraints,
        entry_ids=["gateway"],
        exit_ids=["delivery", "audit_sink"],
    )

    brief_constraints = {"bc1": "Fraud check mandatory"}
    limits = Limits()

    orig_result = validate(spec, brief_constraints, limits)
    assert not orig_result.ok

    patched_spec, warnings = patch_constraints(spec, brief_constraints, limits)
    assert len(warnings) == 1
    patched_result = validate(patched_spec, brief_constraints, limits)
    assert patched_result.ok

    # Check that audit_sink is now fed from fraud_check
    edge_pairs = [(e.from_node, e.to) for e in patched_spec.edges]
    assert ("fraud_check", "audit_sink") in edge_pairs
    assert ("gateway", "audit_sink") not in edge_pairs


def test_repair_must_precede_reroutes_bypass() -> None:
    """must_precede (a before b): bypass edges entering b are redirected through a."""
    nodes = [
        _create_node("gateway"),
        _create_node("filter_agent", is_model=True),
        _create_node("evaluator", is_model=True),
        _create_node("delivery"),
    ]

    # bypass: gateway connects directly to evaluator without filter_agent
    edges = [
        _edge("gateway", "evaluator", "raw"),
        _edge("evaluator", "delivery", "output"),
    ]

    constraints = [
        ConstraintSpec(
            id="c1",
            kind="must_precede",
            text="filter_agent must precede evaluator",
            a="filter_agent",
            b="evaluator",
            covers=["bc1"],
        )
    ]

    spec = ArchitectureSpec(
        nodes=nodes,
        edges=edges,
        constraints=constraints,
        entry_ids=["gateway"],
        exit_ids=["delivery"],
    )

    brief_constraints = {"bc1": "Filter before eval"}
    limits = Limits()

    orig_result = validate(spec, brief_constraints, limits)
    assert not orig_result.ok

    patched_spec, warnings = patch_constraints(spec, brief_constraints, limits)
    assert len(warnings) == 1
    assert warnings[0].code == "W_CODE_REPAIR_APPLIED"

    patched_result = validate(patched_spec, brief_constraints, limits)
    assert patched_result.ok


def test_repair_skips_when_cycle_would_be_created() -> None:
    """If redirecting through target would create a cycle, the patch skips safely."""
    nodes = [
        _create_node("gateway"),
        _create_node("target", is_model=True),
        _create_node("worker"),
        _create_node("delivery"),
    ]

    # target already connects to worker; worker connects to gateway (invalid cycle)
    edges = [
        _edge("gateway", "delivery", "bypass"),
        _edge("target", "gateway", "reverse_edge"),
    ]

    constraints = [
        ConstraintSpec(
            id="c1",
            kind="must_pass_through",
            text="Must pass through target",
            node_id="target",
            covers=["bc1"],
        )
    ]

    spec = ArchitectureSpec(
        nodes=nodes,
        edges=edges,
        constraints=constraints,
        entry_ids=["gateway"],
        exit_ids=["delivery"],
    )

    limits = Limits()
    # Should not crash and should not patch if cycle would be formed
    patched_spec, warnings = patch_constraints(spec, {"bc1": "req"}, limits)
    assert len(warnings) == 0
    assert patched_spec.edges == spec.edges


def test_repair_skips_when_edge_limit_exceeded() -> None:
    """If adding an edge would exceed max_edges limit, patch is skipped."""
    nodes = [
        _create_node("gateway"),
        _create_node("target", is_model=True),
        _create_node("delivery"),
    ]
    edges = [
        _edge("gateway", "delivery", "bypass"),
    ]
    constraints = [
        ConstraintSpec(
            id="c1",
            kind="must_pass_through",
            text="Must pass through target",
            node_id="target",
            covers=["bc1"],
        )
    ]
    spec = ArchitectureSpec(
        nodes=nodes,
        edges=edges,
        constraints=constraints,
        entry_ids=["gateway"],
        exit_ids=["delivery"],
    )
    # limit max_edges to 1 (current count is 1; patch requires adding edges)
    tight_limits = Limits(max_nodes=25, max_edges=1)
    patched_spec, warnings = patch_constraints(spec, {"bc1": "req"}, tight_limits)
    assert len(warnings) == 0
    assert patched_spec.edges == spec.edges


def test_repair_leaves_already_valid_spec_untouched() -> None:
    """Already valid specification is returned completely unmodified with 0 warnings."""
    nodes = [
        _create_node("gateway"),
        _create_node("target", is_model=True),
        _create_node("delivery"),
    ]
    edges = [
        _edge("gateway", "target", "in"),
        _edge("target", "delivery", "out"),
    ]
    constraints = [
        ConstraintSpec(
            id="c1",
            kind="must_pass_through",
            text="Must pass through target",
            node_id="target",
            covers=["bc1"],
        )
    ]
    spec = ArchitectureSpec(
        nodes=nodes,
        edges=edges,
        constraints=constraints,
        entry_ids=["gateway"],
        exit_ids=["delivery"],
    )
    limits = Limits()
    patched_spec, warnings = patch_constraints(spec, {"bc1": "req"}, limits)
    assert len(warnings) == 0
    assert patched_spec == spec


def test_repair_must_not_connect_and_must_exist_untouched() -> None:
    """must_not_connect and must_exist are not patched by code repair."""
    nodes = [
        _create_node("node_a"),
        _create_node("node_b"),
        _create_node("delivery"),
    ]
    edges = [
        _edge("node_a", "node_b", "forbidden"),
        _edge("node_b", "delivery", "out"),
    ]
    constraints = [
        ConstraintSpec(
            id="c1",
            kind="must_not_connect",
            text="A must not connect to B",
            a="node_a",
            b="node_b",
            covers=["bc1"],
        ),
        ConstraintSpec(
            id="c2",
            kind="must_exist",
            text="Missing node must exist",
            node_id="nonexistent_node",
            covers=["bc2"],
        ),
    ]
    spec = ArchitectureSpec(
        nodes=nodes,
        edges=edges,
        constraints=constraints,
        entry_ids=["node_a"],
        exit_ids=["delivery"],
    )
    patched_spec, warnings = patch_constraints(spec, {"bc1": "r1", "bc2": "r2"}, Limits())
    assert len(warnings) == 0
    assert patched_spec == spec


@given(
    node_count=st.integers(min_value=3, max_value=8),
)
@settings(max_examples=25)
def test_hypothesis_patch_maintains_dag(node_count: int) -> None:
    """Hypothesis property: patching an arbitrary linear chain with must_pass_through maintains a strict DAG."""
    node_ids = [f"n{i}" for i in range(node_count)]
    nodes = [_create_node(nid, is_model=(nid == "n1")) for nid in node_ids]

    # Create a linear DAG: n0 -> n2 -> n3 -> ... -> n(last), bypassing n1
    edges = [_edge("n0", "n2", "flow")]
    for i in range(2, node_count - 1):
        edges.append(_edge(f"n{i}", f"n{i + 1}", "flow"))

    constraints = [
        ConstraintSpec(
            id="c1",
            kind="must_pass_through",
            text="Must pass through n1",
            node_id="n1",
            covers=["bc1"],
        )
    ]

    spec = ArchitectureSpec(
        nodes=nodes,
        edges=edges,
        constraints=constraints,
        entry_ids=["n0"],
        exit_ids=[f"n{node_count - 1}"],
    )

    limits = Limits()
    patched_spec, _warnings = patch_constraints(spec, {"bc1": "req"}, limits)

    # The patched spec must strictly be a DAG
    g: nx.DiGraph[Any] = nx.DiGraph()
    g.add_nodes_from(n.id for n in patched_spec.nodes)
    for e in patched_spec.edges:
        g.add_edge(e.from_node, e.to)
    assert nx.is_directed_acyclic_graph(g)


def test_patch_dead_ends_simple_sink_added() -> None:
    """A dead-end sink node with in-degree > 0, out-degree 0 is added to exit_ids."""
    nodes = [
        _create_node("gateway"),
        _create_node("worker"),
        _create_node("delivery"),
        _create_node("audit_sink"),
    ]
    edges = [
        _edge("gateway", "worker"),
        _edge("worker", "delivery"),
        _edge("worker", "audit_sink"),
    ]
    spec = ArchitectureSpec(
        nodes=nodes,
        edges=edges,
        constraints=[],
        entry_ids=["gateway"],
        exit_ids=["delivery"],  # audit_sink omitted
    )
    limits = Limits()

    # Pre-check: validation fails with E_CANNOT_REACH_EXIT
    orig_val = validate(spec, {}, limits)
    assert not orig_val.ok
    assert any(e.code == "E_CANNOT_REACH_EXIT" for e in orig_val.errors)

    patched_spec, warnings = patch_dead_ends(spec, {}, limits)
    assert "audit_sink" in patched_spec.exit_ids
    assert len(warnings) == 1
    assert warnings[0].code == "W_CODE_REPAIR_APPLIED"
    assert "audit_sink" in warnings[0].message

    val_res = validate(patched_spec, {}, limits)
    assert val_res.ok


def test_patch_dead_ends_with_pass_through_conflict_rerouted() -> None:
    """Sink receives early data bypassing a must_pass_through checkpoint; repair reroutes bypass."""
    nodes = [
        _create_node("gateway"),
        _create_node("checkpoint"),
        _create_node("delivery"),
        _create_node("audit_sink"),
    ]
    edges = [
        _edge("gateway", "checkpoint"),
        _edge("checkpoint", "delivery"),
        _edge("gateway", "audit_sink"),  # bypasses checkpoint!
    ]
    constraints = [
        ConstraintSpec(
            id="c1",
            kind="must_pass_through",
            text="All traffic must pass through checkpoint",
            node_id="checkpoint",
            covers=["bc1"],
        )
    ]
    spec = ArchitectureSpec(
        nodes=nodes,
        edges=edges,
        constraints=constraints,
        entry_ids=["gateway"],
        exit_ids=["delivery"],
    )
    brief_constraints = {"bc1": "Checkpoint mandatory"}
    limits = Limits()

    patched_spec, warnings = patch_dead_ends(spec, brief_constraints, limits)
    assert "audit_sink" in patched_spec.exit_ids
    assert len(warnings) == 1
    assert warnings[0].code == "W_CODE_REPAIR_APPLIED"

    # Edge from gateway to audit_sink is removed, edge from checkpoint to audit_sink is added
    assert any(e.from_node == "checkpoint" and e.to == "audit_sink" for e in patched_spec.edges)
    assert not any(e.from_node == "gateway" and e.to == "audit_sink" for e in patched_spec.edges)

    val_res = validate(patched_spec, brief_constraints, limits)
    assert val_res.ok


def test_patch_dead_ends_unsafe_case_returns_original() -> None:
    """Cyclic or unrepairable graph returns the original spec unchanged with zero warnings."""
    nodes = [
        _create_node("node_a"),
        _create_node("node_b"),
        _create_node("node_c"),
    ]
    edges = [
        _edge("node_a", "node_b"),
        _edge("node_b", "node_a"),  # cycle!
        _edge("node_a", "node_c"),
    ]
    spec = ArchitectureSpec(
        nodes=nodes,
        edges=edges,
        constraints=[],
        entry_ids=["node_a"],
        exit_ids=["node_b"],
    )
    limits = Limits()

    patched_spec, warnings = patch_dead_ends(spec, {}, limits)
    assert patched_spec == spec
    assert warnings == []


def test_patch_dead_ends_limit_exceeded_returns_original() -> None:
    """When edge limit would be breached by repair rerouting, returns original spec."""
    nodes = [
        _create_node("gateway"),
        _create_node("checkpoint"),
        _create_node("delivery"),
        _create_node("audit_sink"),
    ]
    edges = [
        _edge("gateway", "checkpoint"),
        _edge("checkpoint", "delivery"),
        _edge("gateway", "audit_sink"),
    ]
    constraints = [
        ConstraintSpec(
            id="c1",
            kind="must_pass_through",
            text="Checkpoint required",
            node_id="checkpoint",
            covers=["bc1"],
        )
    ]
    spec = ArchitectureSpec(
        nodes=nodes,
        edges=edges,
        constraints=constraints,
        entry_ids=["gateway"],
        exit_ids=["delivery"],
    )
    # Set limit to current edge count (3); reroute requires replacing edges
    limits = Limits(max_edges=2)  # already exceeds or exactly 2

    patched_spec, warnings = patch_dead_ends(spec, {"bc1": "req"}, limits)
    assert patched_spec == spec
    assert warnings == []


def test_patch_dead_ends_determinism() -> None:
    """Calling patch_dead_ends multiple times on identical input produces identical output."""
    nodes = [
        _create_node("gateway"),
        _create_node("worker"),
        _create_node("delivery"),
        _create_node("audit_sink"),
    ]
    edges = [
        _edge("gateway", "worker"),
        _edge("worker", "delivery"),
        _edge("worker", "audit_sink"),
    ]
    spec = ArchitectureSpec(
        nodes=nodes,
        edges=edges,
        constraints=[],
        entry_ids=["gateway"],
        exit_ids=["delivery"],
    )
    limits = Limits()

    p1, w1 = patch_dead_ends(spec, {}, limits)
    p2, w2 = patch_dead_ends(spec, {}, limits)
    assert p1.model_dump() == p2.model_dump()
    assert [w.message for w in w1] == [w.message for w in w2]


def test_patch_dead_ends_multi_sink() -> None:
    """Multiple dead-end sinks are sorted deterministically and added to exit_ids."""
    nodes = [
        _create_node("gateway"),
        _create_node("worker"),
        _create_node("delivery"),
        _create_node("telemetry_sink"),
        _create_node("audit_sink"),
    ]
    edges = [
        _edge("gateway", "worker"),
        _edge("worker", "delivery"),
        _edge("worker", "telemetry_sink"),
        _edge("worker", "audit_sink"),
    ]
    spec = ArchitectureSpec(
        nodes=nodes,
        edges=edges,
        constraints=[],
        entry_ids=["gateway"],
        exit_ids=["delivery"],
    )
    limits = Limits()

    patched_spec, warnings = patch_dead_ends(spec, {}, limits)
    assert "audit_sink" in patched_spec.exit_ids
    assert "telemetry_sink" in patched_spec.exit_ids
    assert patched_spec.exit_ids == sorted(patched_spec.exit_ids)
    assert len(warnings) == 1
    assert "audit_sink" in warnings[0].message
    assert "telemetry_sink" in warnings[0].message
    assert validate(patched_spec, {}, limits).ok


def test_repair_must_exist_sink_does_not_create_long_bypass_edge() -> None:
    """A sink referenced in must_exist is still an auxiliary sink; repair must not create an early bypass edge."""
    nodes = [
        _create_node("entry_gateway"),
        _create_node("intake_guardrail"),
        _create_node("branch_doc", is_model=True),
        _create_node("branch_photo", is_model=True),
        _create_node("aggregator"),
        _create_node("output_validator"),
        _create_node("delivery"),
        _create_node("masked_audit_store"),
    ]
    edges = [
        _edge("entry_gateway", "intake_guardrail", "raw_payload"),
        _edge("intake_guardrail", "branch_doc", "doc_task"),
        _edge("intake_guardrail", "branch_photo", "photo_task"),
        _edge("branch_doc", "aggregator", "doc_res"),
        _edge("branch_photo", "aggregator", "photo_res"),
        _edge("aggregator", "output_validator", "claim_record"),
        _edge("output_validator", "delivery", "validated_decision"),
        # The early bypass edge directly into audit sink from intake
        _edge("intake_guardrail", "masked_audit_store", "early_audit_data"),
    ]
    constraints = [
        ConstraintSpec(
            id="c_validator",
            kind="must_pass_through",
            text="All decisions must pass through output_validator",
            node_id="output_validator",
            covers=["bc1"],
        ),
        ConstraintSpec(
            id="c_audit",
            kind="must_exist",
            text="Masked audit store must exist for compliance",
            node_id="masked_audit_store",
            covers=["bc2"],
        ),
    ]
    spec = ArchitectureSpec(
        nodes=nodes,
        edges=edges,
        constraints=constraints,
        entry_ids=["entry_gateway"],
        exit_ids=["delivery", "masked_audit_store"],
    )
    brief_constraints = {
        "bc1": "Must pass through validator",
        "bc2": "Audit store must exist",
    }
    limits = Limits()

    # Initial spec fails validation because intake_guardrail -> masked_audit_store bypasses output_validator
    orig_val = validate(spec, brief_constraints, limits)
    assert not orig_val.ok

    # Apply patch_constraints
    patched_spec, warnings = patch_constraints(spec, brief_constraints, limits)
    assert len(warnings) == 1
    assert warnings[0].code == "W_CODE_REPAIR_APPLIED"

    # Crucial regression assertions:
    # 1. No long bypass edge intake_guardrail -> output_validator was added
    assert not any(
        e.from_node == "intake_guardrail" and e.to == "output_validator" for e in patched_spec.edges
    ), "Spurious cross-rank bypass edge intake_guardrail -> output_validator should not be added"

    # 2. Early edge to audit sink was removed
    assert not any(
        e.from_node == "intake_guardrail" and e.to == "masked_audit_store"
        for e in patched_spec.edges
    )

    # 3. Sink is now fed post-checkpoint (from output_validator)
    assert any(
        e.from_node == "output_validator" and e.to == "masked_audit_store"
        for e in patched_spec.edges
    ), "Sink must be fed from post-checkpoint node"

    # 4. Final patched spec passes validation
    final_val = validate(patched_spec, brief_constraints, limits)
    assert final_val.ok


def test_sanitize_covers_unit_strips_invalid_entries_and_preserves_valid() -> None:
    """Direct unit test: sanitize_covers drops non-brief IDs and preserves valid ones."""
    from archnemesis.modules.validation.models import ConstraintSpec, NodeSpec
    from archnemesis.modules.validation.repair import sanitize_covers

    spec = ArchitectureSpec(
        nodes=[
            NodeSpec(id="node_a", name="A", type="svc", role="Role A"),
            NodeSpec(id="node_b", name="B", type="svc", role="Role B"),
        ],
        edges=[EdgeSpec.model_validate({"from": "node_a", "to": "node_b", "flows": "f"})],
        constraints=[
            ConstraintSpec(
                id="c1",
                text="Test constraint",
                kind="must_exist",
                node_id="node_a",
                covers=["bc1", "Assumption: SSO login"],
            )
        ],
        entry_ids=["node_a"],
        exit_ids=["node_b"],
    )

    sanitized, warnings = sanitize_covers(spec, {"bc1": "Auth"})
    assert sanitized is not None
    assert len(warnings) == 1
    assert warnings[0].code == "W_CODE_REPAIR_APPLIED"
    assert "Sanitized constraint 'c1'" in warnings[0].message
    assert sanitized.constraints[0].covers == ["bc1"]


def test_fixed_flow_text_literal_is_checked_flow() -> None:
    """Test 1: FIXED_FLOW_TEXT literal equals 'Checked flow'."""
    from archnemesis.modules.validation.repair import FIXED_FLOW_TEXT

    assert FIXED_FLOW_TEXT == "Checked flow"


def test_patch_dead_ends_accepts_when_only_brief_coverage_error_remains() -> None:
    """Test 2: patch_dead_ends accepts repair when the only remaining error is E_BRIEF_CONSTRAINT_UNCOVERED."""
    nodes = [
        _create_node("ingress_gateway"),
        _create_node("processor"),
        _create_node("dead_end_processor"),
        _create_node("egress_sink"),
    ]
    # ingress -> processor -> egress_sink, ingress -> dead_end_processor (dead end missing from exit_ids)
    edges = [
        _edge("ingress_gateway", "processor", "submit"),
        _edge("processor", "egress_sink", "finish"),
        _edge("ingress_gateway", "dead_end_processor", "branch"),
    ]
    spec = ArchitectureSpec(
        nodes=nodes,
        edges=edges,
        constraints=[],
        entry_ids=["ingress_gateway"],
        exit_ids=["egress_sink"],
    )
    brief_constraints = {"bc_uncovered": "Audit log must be retained"}
    limits = Limits()

    # Pre-patch validation has E_CANNOT_REACH_EXIT and E_BRIEF_CONSTRAINT_UNCOVERED
    pre_val = validate(spec, brief_constraints, limits)
    assert not pre_val.ok
    assert {e.code for e in pre_val.errors} == {
        "E_CANNOT_REACH_EXIT",
        "E_BRIEF_CONSTRAINT_UNCOVERED",
    }

    patched_spec, warnings = patch_dead_ends(spec, brief_constraints, limits)

    # Patch should be accepted because only E_BRIEF_CONSTRAINT_UNCOVERED remains
    assert patched_spec is not None
    assert len(warnings) == 1
    assert warnings[0].code == "W_CODE_REPAIR_APPLIED"
    assert "dead_end_processor" in warnings[0].message

    # Post-patch validation errors must be EXACTLY E_BRIEF_CONSTRAINT_UNCOVERED
    post_val = validate(patched_spec, brief_constraints, limits)
    assert not post_val.ok
    assert {e.code for e in post_val.errors} == {"E_BRIEF_CONSTRAINT_UNCOVERED"}

    # dead_end_processor is now in exit_ids
    assert "dead_end_processor" in patched_spec.exit_ids


def test_patch_dead_ends_rejects_when_non_coverage_errors_remain() -> None:
    """Test 3: patch_dead_ends rejects repair when structural/non-coverage errors remain."""
    nodes = [
        _create_node("ingress_gateway"),
        _create_node("dead_end_processor"),
        _create_node("cycle_node"),
        _create_node("egress_sink"),
    ]
    # Graph has a cycle cycle_node <-> dead_end_processor plus ingress
    edges = [
        _edge("ingress_gateway", "dead_end_processor", "submit"),
        _edge("dead_end_processor", "cycle_node", "to_cycle"),
        _edge("cycle_node", "dead_end_processor", "back_cycle"),
    ]
    spec = ArchitectureSpec(
        nodes=nodes,
        edges=edges,
        constraints=[],
        entry_ids=["ingress_gateway"],
        exit_ids=["egress_sink"],
    )
    brief_constraints = {"bc_uncovered": "Audit log must be retained"}
    limits = Limits()

    patched_spec, warnings = patch_dead_ends(spec, brief_constraints, limits)

    # Rejection returns original spec unchanged and no warnings
    assert patched_spec == spec
    assert warnings == []


def test_patch_dead_ends_and_patch_constraints_preserve_node_layers() -> None:
    """Test 4: patch_dead_ends and patch_constraints never modify or drop node.layer."""
    nodes = [
        NodeSpec(
            id="gateway",
            name="Gateway",
            type="service",
            role="Gateway entry point",
            inputs=["in"],
            outputs=["out"],
            tech_options=["Python"],
            layer="Intake",
        ),
        NodeSpec(
            id="worker",
            name="Worker",
            type="service",
            role="Worker processing",
            inputs=["in"],
            outputs=["out"],
            tech_options=["Python"],
            layer="Processing",
        ),
        NodeSpec(
            id="sink",
            name="Sink",
            type="service",
            role="Sink exit point",
            inputs=["in"],
            outputs=["out"],
            tech_options=["Python"],
            layer="Output",
        ),
    ]
    edges = [_edge("gateway", "worker", "job")]
    spec = ArchitectureSpec(
        nodes=nodes,
        edges=edges,
        constraints=[],
        entry_ids=["gateway"],
        exit_ids=["sink"],
    )
    brief_constraints = {"bc1": "Compliance audit"}
    limits = Limits()

    # Apply patch_dead_ends
    patched_de, _ = patch_dead_ends(spec, brief_constraints, limits)
    layer_map_de = {n.id: n.layer for n in patched_de.nodes}
    assert layer_map_de == {"gateway": "Intake", "worker": "Processing", "sink": "Output"}

    # Apply patch_constraints on a spec with must_pass_through requiring patch
    must_pass_spec = ArchitectureSpec(
        nodes=nodes,
        edges=[
            _edge("gateway", "sink", "bypass"),
            _edge("gateway", "worker", "side"),
        ],
        constraints=[
            ConstraintSpec(
                id="c1",
                kind="must_pass_through",
                text="Must pass worker",
                node_id="worker",
                covers=["bc1"],
            )
        ],
        entry_ids=["gateway"],
        exit_ids=["sink"],
    )
    patched_pc, _ = patch_constraints(must_pass_spec, brief_constraints, limits)
    layer_map_pc = {n.id: n.layer for n in patched_pc.nodes}
    assert layer_map_pc == {"gateway": "Intake", "worker": "Processing", "sink": "Output"}
