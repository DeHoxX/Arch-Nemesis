"""Unit and service-level tests for deterministic cycle repair (patch_cycles)."""

from __future__ import annotations

import random
from typing import Any

import networkx as nx
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from archnemesis.llm.fake import FakeLLMClient
from archnemesis.modules.architect.service import generate_and_validate
from archnemesis.modules.validation.graph import build_graph
from archnemesis.modules.validation.models import (
    ArchitectureSpec,
    EdgeSpec,
    Limits,
    NodeSpec,
)
from archnemesis.modules.validation.repair import patch_cycles
from archnemesis.modules.validation.validate import validate
from archnemesis.shared.brief import RequirementBrief

DEFAULT_LIMITS = Limits(
    max_nodes=20,
    max_edges=40,
)


def _make_node(node_id: str, node_type: str = "service", is_model: bool = False) -> NodeSpec:
    return NodeSpec(
        id=node_id,
        name=node_id.replace("_", " ").title(),
        type=node_type,
        role=f"Role description for {node_id}.",
        inputs=["data_in"],
        outputs=["data_out"],
        tech_options=["FastAPI", "Python"],
        needs_model=is_model,
    )


def _make_edge(from_node: str, to: str, flows: str = "Forward payload") -> EdgeSpec:
    return EdgeSpec.model_validate({"from": from_node, "to": to, "flows": flows})


def test_patch_cycles_no_op_on_dag() -> None:
    """Acyclic DAG is returned unmodified with zero warnings."""
    spec = ArchitectureSpec(
        nodes=[_make_node("entry"), _make_node("processor"), _make_node("exit")],
        edges=[_make_edge("entry", "processor"), _make_edge("processor", "exit")],
        entry_ids=["entry"],
        exit_ids=["exit"],
        constraints=[],
    )

    patched, warnings = patch_cycles(spec, {}, DEFAULT_LIMITS)
    assert patched == spec
    assert warnings == []


def test_patch_cycles_2_node_store_agent() -> None:
    """2-node loop between agent and store has feedback edge store->agent removed."""
    nodes = [
        _make_node("entry"),
        _make_node("agent", "agent", is_model=True),
        _make_node("store", "knowledge_store"),
        _make_node("exit"),
    ]
    edges = [
        _make_edge("entry", "agent"),
        _make_edge("agent", "store"),
        _make_edge("store", "exit"),
        _make_edge("store", "agent", flows="Feedback query loop"),
    ]
    spec = ArchitectureSpec(
        nodes=nodes,
        edges=edges,
        entry_ids=["entry"],
        exit_ids=["exit"],
        constraints=[],
    )

    # Initial graph contains cycle agent > store > agent
    g_init = build_graph(spec)
    assert not nx.is_directed_acyclic_graph(g_init)

    patched, warnings = patch_cycles(spec, {}, DEFAULT_LIMITS)

    assert nx.is_directed_acyclic_graph(build_graph(patched))
    assert len(patched.edges) == 3
    assert not any(e.from_node == "store" and e.to == "agent" for e in patched.edges)
    assert any(e.from_node == "agent" and e.to == "store" for e in patched.edges)

    assert len(warnings) == 1
    w = warnings[0]
    assert w.code == "W_CODE_REPAIR_APPLIED"
    assert w.severity == "warning"
    assert w.ids == ["store", "agent"]
    assert (
        w.message
        == "Cycle resolved by automated graph repair: removed feedback edge 'store' -> 'agent' to establish a valid acyclic architecture."
    )


def test_patch_cycles_3_node_loop() -> None:
    """3-node cycle A -> B -> C -> A removes backward edge C -> A."""
    nodes = [
        _make_node("entry"),
        _make_node("step_a"),
        _make_node("step_b"),
        _make_node("step_c"),
        _make_node("exit"),
    ]
    edges = [
        _make_edge("entry", "step_a"),
        _make_edge("step_a", "step_b"),
        _make_edge("step_b", "step_c"),
        _make_edge("step_c", "exit"),
        _make_edge("step_c", "step_a", flows="Review rework back edge"),
    ]
    spec = ArchitectureSpec(
        nodes=nodes,
        edges=edges,
        entry_ids=["entry"],
        exit_ids=["exit"],
        constraints=[],
    )

    patched, warnings = patch_cycles(spec, {}, DEFAULT_LIMITS)

    assert nx.is_directed_acyclic_graph(build_graph(patched))
    assert len(patched.edges) == 4
    assert not any(e.from_node == "step_c" and e.to == "step_a" for e in patched.edges)

    assert len(warnings) == 1
    w = warnings[0]
    assert w.code == "W_CODE_REPAIR_APPLIED"
    assert w.ids == ["step_c", "step_a"]
    assert (
        w.message
        == "Cycle resolved by automated graph repair: removed feedback edge 'step_c' -> 'step_a' to establish a valid acyclic architecture."
    )


def test_patch_cycles_reachability_preserved_candidate_rejected() -> None:
    """Candidate cut where every cycle edge loses reachability is rejected."""
    # Graph: entry -> a, a -> b, b -> a, a -> exit (entry_ids=[entry], exit_ids=[exit])
    # Before cut:
    #   entry_reachable_before = {entry, a, b, exit}
    #   exit_reachable_before = {entry, a, b, exit}
    # Cut a -> b:
    #   b loses entry reachability (no path from entry to b).
    # Cut b -> a:
    #   b loses exit reachability (no path from b to exit).
    # Neither cut preserves existing reachability, so safe_candidates is empty.
    nodes = [
        _make_node("entry"),
        _make_node("node_a"),
        _make_node("node_b"),
        _make_node("exit"),
    ]
    edges = [
        _make_edge("entry", "node_a"),
        _make_edge("node_a", "node_b"),
        _make_edge("node_b", "node_a"),
        _make_edge("node_a", "exit"),
    ]
    spec = ArchitectureSpec(
        nodes=nodes,
        edges=edges,
        entry_ids=["entry"],
        exit_ids=["exit"],
        constraints=[],
    )

    patched, warnings = patch_cycles(spec, {}, DEFAULT_LIMITS)
    assert patched == spec
    assert warnings == []


def test_patch_cycles_no_safe_cut_returns_original_with_zero_warnings() -> None:
    """When cycle has no cut preserving reachability, spec is returned unchanged even with parallel paths."""
    # Same graph: entry -> a, a -> b, b -> a, a -> exit, plus a healthy branch entry -> c -> exit
    nodes = [
        _make_node("entry"),
        _make_node("node_a"),
        _make_node("node_b"),
        _make_node("node_c"),
        _make_node("exit"),
    ]
    edges = [
        _make_edge("entry", "node_a"),
        _make_edge("node_a", "node_b"),
        _make_edge("node_b", "node_a"),
        _make_edge("node_a", "exit"),
        _make_edge("entry", "node_c"),
        _make_edge("node_c", "exit"),
    ]
    spec = ArchitectureSpec(
        nodes=nodes,
        edges=edges,
        entry_ids=["entry"],
        exit_ids=["exit"],
        constraints=[],
    )

    patched, warnings = patch_cycles(spec, {}, DEFAULT_LIMITS)
    assert patched == spec
    assert warnings == []


def test_patch_cycles_tolerates_preexisting_unreachable_errors_under_non_regressive_gate() -> None:
    """Under the non-regressive gate, patch_cycles cuts an unreachable cycle without introducing new errors."""
    # Graph: entry -> step_a -> step_b -> exit, with side branch step_a -> side_c and cycle side_c <-> side_d.
    # Before cut: side_c and side_d cannot reach exit (E_CANNOT_REACH_EXIT already present in original validate).
    # Cut side_d -> side_c:
    #   side_c remains reachable from entry; side_d remains reachable from entry.
    #   Neither reached exit before, so exit reachability is not lost.
    # Resulting graph is acyclic and introduces no NEW error (E_CANNOT_REACH_EXIT was already present).
    # patch_cycles succeeds and emits a warning; full validate still reports E_CANNOT_REACH_EXIT.
    nodes = [
        _make_node("entry"),
        _make_node("step_a"),
        _make_node("step_b"),
        _make_node("side_c"),
        _make_node("side_d"),
        _make_node("exit"),
    ]
    edges = [
        _make_edge("entry", "step_a"),
        _make_edge("step_a", "step_b"),
        _make_edge("step_b", "exit"),
        _make_edge("step_a", "side_c"),
        _make_edge("side_c", "side_d"),
        _make_edge("side_d", "side_c"),
    ]
    spec = ArchitectureSpec(
        nodes=nodes,
        edges=edges,
        entry_ids=["entry"],
        exit_ids=["exit"],
        constraints=[],
    )

    patched, warnings = patch_cycles(spec, {}, DEFAULT_LIMITS)

    # A cut IS made to eliminate the cycle
    assert len(warnings) == 1
    assert warnings[0].ids == ["side_d", "side_c"]
    assert nx.is_directed_acyclic_graph(build_graph(patched))

    # Full validate still fails because side_c and side_d cannot reach exit (so service would not accept as finished)
    val = validate(patched, {}, DEFAULT_LIMITS)
    assert val.ok is False
    assert any(err.code == "E_CANNOT_REACH_EXIT" for err in val.errors)


def test_patch_cycles_entry_inside_cycle() -> None:
    """Entry node directly in cycle (entry -> A -> B -> entry) is handled without crash."""
    nodes = [_make_node("entry"), _make_node("step_a"), _make_node("step_b"), _make_node("exit")]
    edges = [
        _make_edge("entry", "step_a"),
        _make_edge("step_a", "step_b"),
        _make_edge("step_b", "exit"),
        _make_edge("step_b", "entry", flows="Loop back to entry"),
    ]
    spec = ArchitectureSpec(
        nodes=nodes,
        edges=edges,
        entry_ids=["entry"],
        exit_ids=["exit"],
        constraints=[],
    )

    patched, warnings = patch_cycles(spec, {}, DEFAULT_LIMITS)

    assert nx.is_directed_acyclic_graph(build_graph(patched))
    # step_b -> entry must be cut because cutting entry -> step_a breaks entry to exit reachability
    assert not any(e.from_node == "step_b" and e.to == "entry" for e in patched.edges)
    assert any(e.from_node == "entry" and e.to == "step_a" for e in patched.edges)
    assert len(warnings) == 1
    assert warnings[0].ids == ["step_b", "entry"]


def test_patch_cycles_determinism_shuffled_input() -> None:
    """Permuted edge and node orders produce identical cuts and warnings."""
    nodes = [
        _make_node("entry"),
        _make_node("agent", is_model=True),
        _make_node("store"),
        _make_node("exit"),
    ]
    edges = [
        _make_edge("entry", "agent"),
        _make_edge("agent", "store"),
        _make_edge("store", "exit"),
        _make_edge("store", "agent"),
    ]
    spec1 = ArchitectureSpec(
        nodes=nodes,
        edges=edges,
        entry_ids=["entry"],
        exit_ids=["exit"],
        constraints=[],
    )

    # Shuffle nodes and edges
    rng = random.Random(42)
    shuffled_nodes = list(nodes)
    rng.shuffle(shuffled_nodes)
    shuffled_edges = list(edges)
    rng.shuffle(shuffled_edges)

    spec2 = ArchitectureSpec(
        nodes=shuffled_nodes,
        edges=shuffled_edges,
        entry_ids=["entry"],
        exit_ids=["exit"],
        constraints=[],
    )

    patched1, warnings1 = patch_cycles(spec1, {}, DEFAULT_LIMITS)
    patched2, warnings2 = patch_cycles(spec2, {}, DEFAULT_LIMITS)

    assert sorted((e.from_node, e.to) for e in patched1.edges) == sorted(
        (e.from_node, e.to) for e in patched2.edges
    )
    assert [w.ids for w in warnings1] == [w.ids for w in warnings2]
    assert [w.message for w in warnings1] == [w.message for w in warnings2]


def test_patch_cycles_same_spec_different_type_text() -> None:
    """Spec with identical topology but different node types produces the exact same cut."""
    # Spec 1 uses "database" and "cache"
    nodes1 = [
        _make_node("n_entry", node_type="gateway"),
        _make_node("n_proc", node_type="database"),
        _make_node("n_store", node_type="cache"),
        _make_node("n_exit", node_type="sink"),
    ]
    # Spec 2 uses arbitrary opposite types
    nodes2 = [
        _make_node("n_entry", node_type="arbitrary_alpha"),
        _make_node("n_proc", node_type="arbitrary_beta"),
        _make_node("n_store", node_type="arbitrary_gamma"),
        _make_node("n_exit", node_type="arbitrary_delta"),
    ]
    edges = [
        _make_edge("n_entry", "n_proc"),
        _make_edge("n_proc", "n_store"),
        _make_edge("n_store", "n_exit"),
        _make_edge("n_store", "n_proc"),
    ]
    spec1 = ArchitectureSpec(
        nodes=nodes1,
        edges=edges,
        entry_ids=["n_entry"],
        exit_ids=["n_exit"],
        constraints=[],
    )
    spec2 = ArchitectureSpec(
        nodes=nodes2,
        edges=edges,
        entry_ids=["n_entry"],
        exit_ids=["n_exit"],
        constraints=[],
    )

    patched1, warnings1 = patch_cycles(spec1, {}, DEFAULT_LIMITS)
    patched2, warnings2 = patch_cycles(spec2, {}, DEFAULT_LIMITS)

    # Identical edge cut decisions
    assert [(e.from_node, e.to) for e in patched1.edges] == [
        (e.from_node, e.to) for e in patched2.edges
    ]
    assert [w.ids for w in warnings1] == [w.ids for w in warnings2]


@settings(max_examples=30, deadline=None)
@given(
    st.lists(
        st.sampled_from(
            [
                ("n3", "n2"),
                ("n3", "n1"),
                ("n3", "n0"),
                ("n2", "n1"),
                ("n2", "n0"),
                ("n1", "n0"),
            ]
        ),
        min_size=1,
        max_size=3,
        unique=True,
    )
)
def test_patch_cycles_hypothesis_dag_with_back_edges(back_edges: list[tuple[str, str]]) -> None:
    """Hypothesis: valid DAG + 1-3 back-edges is either unchanged OR (acyclic AND no new errors)."""
    nodes = [_make_node(f"n{i}") for i in range(4)]
    # Hamiltonian path n0 -> n1 -> n2 -> n3 ensures valid forward reachability
    forward_edges = [
        _make_edge("n0", "n1"),
        _make_edge("n1", "n2"),
        _make_edge("n2", "n3"),
    ]
    edges = forward_edges + [_make_edge(u, v, flows="back_edge") for u, v in back_edges]
    spec = ArchitectureSpec(
        nodes=nodes,
        edges=edges,
        entry_ids=["n0"],
        exit_ids=["n3"],
        constraints=[],
    )

    patched, warnings = patch_cycles(spec, {}, DEFAULT_LIMITS)

    if not warnings:
        assert patched == spec
    else:
        # Acyclic DAG
        assert nx.is_directed_acyclic_graph(build_graph(patched))
        # No new errors introduced vs original
        val_orig = validate(spec, {}, DEFAULT_LIMITS)
        val_patched = validate(patched, {}, DEFAULT_LIMITS)
        orig_errs = {(e.code, tuple(e.ids)) for e in val_orig.errors if e.code != "E_CYCLE"}
        patched_errs = {(e.code, tuple(e.ids)) for e in val_patched.errors if e.code != "E_CYCLE"}
        assert patched_errs.issubset(orig_errs)


def test_patch_cycles_hypothesis_concrete_example_cut_made() -> None:
    """Concrete example proving the back-edge hypothesis property is not vacuous."""
    nodes = [_make_node(f"n{i}") for i in range(4)]
    forward_edges = [
        _make_edge("n0", "n1"),
        _make_edge("n1", "n2"),
        _make_edge("n2", "n3"),
    ]
    # Add back edge n2 -> n1
    edges = forward_edges + [_make_edge("n2", "n1", flows="back_edge")]
    spec = ArchitectureSpec(
        nodes=nodes,
        edges=edges,
        entry_ids=["n0"],
        exit_ids=["n3"],
        constraints=[],
    )

    patched, warnings = patch_cycles(spec, {}, DEFAULT_LIMITS)

    # Cut must be made!
    assert len(warnings) == 1
    assert warnings[0].ids == ["n2", "n1"]
    assert nx.is_directed_acyclic_graph(build_graph(patched))
    val_patched = validate(patched, {}, DEFAULT_LIMITS)
    assert val_patched.ok is True


@pytest.mark.asyncio
async def test_service_cycle_fixed_by_code_repair_zero_repair_llm_calls() -> None:
    """Service-level test: cycle fixed by code repair requires 0 repair LLM calls."""
    # Attempt 1 returns spec with agent <-> store cycle
    cyclic_spec_dict: dict[str, Any] = {
        "nodes": [
            {
                "id": "entry_gw",
                "name": "Entry Gateway",
                "type": "api_gateway",
                "role": "Entry point",
                "inputs": ["req"],
                "outputs": ["data"],
                "tech_options": ["FastAPI", "Kong"],
                "needs_model": False,
            },
            {
                "id": "agent_node",
                "name": "Triage Agent",
                "type": "agent",
                "role": "Triages cases",
                "inputs": ["data"],
                "outputs": ["triage"],
                "tech_options": ["LangGraph", "Python"],
                "needs_model": True,
            },
            {
                "id": "store_node",
                "name": "Knowledge Store",
                "type": "knowledge_store",
                "role": "Stores history",
                "inputs": ["triage"],
                "outputs": ["history"],
                "tech_options": ["PostgreSQL", "Redis"],
                "needs_model": False,
            },
            {
                "id": "exit_sink",
                "name": "Audit Sink",
                "type": "sink",
                "role": "Exit point",
                "inputs": ["history"],
                "outputs": ["done"],
                "tech_options": ["S3", "Kafka"],
                "needs_model": False,
            },
        ],
        "edges": [
            {"from": "entry_gw", "to": "agent_node", "flows": "request"},
            {"from": "agent_node", "to": "store_node", "flows": "query"},
            {"from": "store_node", "to": "exit_sink", "flows": "archive"},
            {"from": "store_node", "to": "agent_node", "flows": "response_loop"},
        ],
        "entry_ids": ["entry_gw"],
        "exit_ids": ["exit_sink"],
        "constraints": [],
    }

    # Fake LLM returns cyclic spec on call 1
    fake_client = FakeLLMClient([cyclic_spec_dict])

    brief = RequirementBrief(
        summary="Customer support triage",
        users="Support staff",
        domain_hint="Customer service",
        data_involved=["Tickets"],
        stated_constraints=[],
        numbers_given=[],
        assumptions=[],
    )

    spec, prompt_version, call_idx, result = await generate_and_validate(brief, fake_client)

    # Assert exactly 1 LLM call made (zero repair calls)
    assert len(fake_client.calls) == 1
    assert call_idx == 1
    assert prompt_version.endswith("+code_repair")
    assert result is not None
    assert result.ok is True
    assert nx.is_directed_acyclic_graph(build_graph(spec))
    # Assert feedback edge was removed
    assert not any(e.from_node == "store_node" and e.to == "agent_node" for e in spec.edges)
    assert any(w.code == "W_CODE_REPAIR_APPLIED" for w in result.warnings)


def test_pipeline_order_cycles_before_dead_ends_and_constraints() -> None:
    """In _apply_code_repair, patch_cycles runs first, enabling patch_dead_ends on resulting DAG."""
    from archnemesis.modules.architect.service import _apply_code_repair

    # Spec has BOTH a cycle AND a dead end missing from exit_ids
    # entry -> agent <-> store -> exit
    # and dead_end_node: agent -> dead_end_node (in_degree 1, out_degree 0, not in exit_ids)
    nodes = [
        _make_node("entry"),
        _make_node("agent", is_model=True),
        _make_node("store"),
        _make_node("dead_end_sink"),
        _make_node("exit"),
    ]
    edges = [
        _make_edge("entry", "agent"),
        _make_edge("agent", "store"),
        _make_edge("store", "exit"),
        _make_edge("store", "agent"),  # cycle
        _make_edge("agent", "dead_end_sink"),  # dead end
    ]
    spec = ArchitectureSpec(
        nodes=nodes,
        edges=edges,
        entry_ids=["entry"],
        exit_ids=["exit"],
        constraints=[],
    )

    # Initial graph is cyclic
    assert not nx.is_directed_acyclic_graph(build_graph(spec))

    patched, warnings = _apply_code_repair(spec, {}, DEFAULT_LIMITS)

    # Both repairs applied!
    assert nx.is_directed_acyclic_graph(build_graph(patched))
    # Dead end added to exit_ids
    assert "dead_end_sink" in patched.exit_ids
    # Cycle edge removed
    assert not any(e.from_node == "store" and e.to == "agent" for e in patched.edges)
    # Both warnings present
    warning_messages = [w.message for w in warnings]
    assert any("Cycle resolved by automated graph repair" in m for m in warning_messages)
    assert any(
        "Added dead-end sink node(s) 'dead_end_sink' to exit_ids" in m for m in warning_messages
    )
    val = validate(patched, {}, DEFAULT_LIMITS)
    assert val.ok is True


def test_pipeline_cycle_and_dead_end_repaired_end_to_end() -> None:
    """Entire _apply_code_repair pipeline heals both cycle and dead end end-to-end."""
    from archnemesis.modules.architect.service import _apply_code_repair

    # Spec: entry -> agent <-> store -> exit, plus dead end: store -> dead_end
    nodes = [
        _make_node("entry"),
        _make_node("agent", is_model=True),
        _make_node("store"),
        _make_node("dead_end"),
        _make_node("exit"),
    ]
    edges = [
        _make_edge("entry", "agent"),
        _make_edge("agent", "store"),
        _make_edge("store", "exit"),
        _make_edge("store", "agent", flows="Cycle back-edge"),
        _make_edge("store", "dead_end", flows="Dead-end flow"),
    ]
    spec = ArchitectureSpec(
        nodes=nodes,
        edges=edges,
        entry_ids=["entry"],
        exit_ids=["exit"],
        constraints=[],
    )

    # Initial graph is cyclic and dead_end is missing from exit_ids
    assert not nx.is_directed_acyclic_graph(build_graph(spec))
    assert "dead_end" not in spec.exit_ids

    patched, warnings = _apply_code_repair(spec, {}, DEFAULT_LIMITS)

    # After entire pipeline:
    # 1. Graph is an acyclic DAG
    assert nx.is_directed_acyclic_graph(build_graph(patched))
    # 2. Cycle edge is removed
    assert not any(e.from_node == "store" and e.to == "agent" for e in patched.edges)
    # 3. Dead end node is added to exit_ids
    assert "dead_end" in patched.exit_ids
    # 4. Warnings emitted for both repairs
    assert any("Cycle resolved by automated graph repair" in w.message for w in warnings)
    assert any("dead_end" in w.ids for w in warnings)
    # 5. Result is 100% valid
    val = validate(patched, {}, DEFAULT_LIMITS)
    assert val.ok is True
