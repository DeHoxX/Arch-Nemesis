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
from archnemesis.modules.validation.repair import patch_constraints


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
