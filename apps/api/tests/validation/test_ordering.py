"""Tests for Kahn's topological sort and ordering determinism."""

import random

import pytest

from archnemesis.modules.validation import ArchitectureSpec, EdgeSpec, NodeSpec, order_nodes


def test_order_nodes_deterministic_and_shuffled() -> None:
    """order_nodes must produce identical outputs regardless of input node and edge shuffling."""
    nodes = [
        NodeSpec(
            id="b_node",
            name="B",
            type="worker",
            role="Role",
            inputs=["in"],
            outputs=["out"],
            needs_model=False,
        ),
        NodeSpec(
            id="a_node",
            name="A",
            type="entry",
            role="Role",
            inputs=[],
            outputs=["in"],
            needs_model=False,
        ),
        NodeSpec(
            id="c_node",
            name="C",
            type="exit",
            role="Role",
            inputs=["out"],
            outputs=[],
            needs_model=False,
        ),
    ]
    edges = [
        EdgeSpec.model_validate({"from": "a_node", "to": "b_node", "flows": "f1"}),
        EdgeSpec.model_validate({"from": "b_node", "to": "c_node", "flows": "f2"}),
    ]

    base_spec = ArchitectureSpec(
        nodes=nodes, edges=edges, entry_ids=["a_node"], exit_ids=["c_node"]
    )
    base_order = order_nodes(base_spec)
    assert base_order == ["a_node", "b_node", "c_node"]

    # Shuffle repeatedly
    for seed in range(10):
        rng = random.Random(seed)
        shuffled_nodes = list(nodes)
        shuffled_edges = list(edges)
        rng.shuffle(shuffled_nodes)
        rng.shuffle(shuffled_edges)

        spec = ArchitectureSpec(
            nodes=shuffled_nodes,
            edges=shuffled_edges,
            entry_ids=["a_node"],
            exit_ids=["c_node"],
        )
        assert order_nodes(spec) == ["a_node", "b_node", "c_node"]


def test_order_nodes_every_edge_goes_forward() -> None:
    """Every edge in the ordered spec must point from an earlier index to a later index."""
    nodes = [
        NodeSpec(
            id=f"n_{i}",
            name=f"N{i}",
            type="worker",
            role="Role",
            inputs=[],
            outputs=[],
            needs_model=False,
        )
        for i in range(5)
    ]
    edges = [
        EdgeSpec.model_validate({"from": "n_0", "to": "n_1", "flows": "f"}),
        EdgeSpec.model_validate({"from": "n_0", "to": "n_2", "flows": "f"}),
        EdgeSpec.model_validate({"from": "n_1", "to": "n_3", "flows": "f"}),
        EdgeSpec.model_validate({"from": "n_2", "to": "n_3", "flows": "f"}),
        EdgeSpec.model_validate({"from": "n_3", "to": "n_4", "flows": "f"}),
    ]
    spec = ArchitectureSpec(nodes=nodes, edges=edges, entry_ids=["n_0"], exit_ids=["n_4"])
    order = order_nodes(spec)

    idx_map = {nid: i for i, nid in enumerate(order)}
    for edge in edges:
        assert idx_map[edge.from_node] < idx_map[edge.to]


def test_order_nodes_raises_value_error_on_cycle() -> None:
    """order_nodes must raise ValueError if the graph contains a cycle."""
    nodes = [
        NodeSpec(
            id="n_a", name="A", type="worker", role="Role", inputs=[], outputs=[], needs_model=False
        ),
        NodeSpec(
            id="n_b", name="B", type="worker", role="Role", inputs=[], outputs=[], needs_model=False
        ),
    ]
    edges = [
        EdgeSpec.model_validate({"from": "n_a", "to": "n_b", "flows": "f1"}),
        EdgeSpec.model_validate({"from": "n_b", "to": "n_a", "flows": "f2"}),
    ]
    spec = ArchitectureSpec(nodes=nodes, edges=edges, entry_ids=["n_a"], exit_ids=["n_b"])

    with pytest.raises(ValueError, match="cycles"):
        order_nodes(spec)
