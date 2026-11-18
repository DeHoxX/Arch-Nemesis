"""Tests for Kahn's topological sort and ordering determinism."""

import random

import pytest

from archnemesis.modules.validation import (
    OTHER_PARTS_LAYER,
    ArchitectureSpec,
    EdgeSpec,
    NodeSpec,
    order_layers,
    order_nodes,
)


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


def test_order_layers_dag_longest_path() -> None:
    """order_layers orders layers by smallest longest-path rank of their nodes."""
    nodes = [
        NodeSpec(
            id="n_in",
            name="Ingress",
            type="gateway",
            role="r",
            inputs=[],
            outputs=["d1"],
            needs_model=False,
            layer="Ingress",
        ),
        NodeSpec(
            id="n_mid",
            name="Mid",
            type="processor",
            role="r",
            inputs=["d1"],
            outputs=["d2"],
            needs_model=False,
            layer="Compute",
        ),
        NodeSpec(
            id="n_db",
            name="DB",
            type="database",
            role="r",
            inputs=["d2"],
            outputs=[],
            needs_model=False,
            layer="Storage",
        ),
    ]
    edges = [
        EdgeSpec.model_validate({"from": "n_in", "to": "n_mid", "flows": "f1"}),
        EdgeSpec.model_validate({"from": "n_mid", "to": "n_db", "flows": "f2"}),
    ]
    spec = ArchitectureSpec(nodes=nodes, edges=edges, entry_ids=["n_in"], exit_ids=["n_db"])
    assert order_layers(spec) == ["Ingress", "Compute", "Storage"]


def test_order_layers_tie_breaking_by_name() -> None:
    """Ties in layer min_rank are broken alphabetically by layer name (case-insensitive)."""
    nodes = [
        NodeSpec(
            id="n_a",
            name="A",
            type="gateway",
            role="r",
            inputs=[],
            outputs=["d1"],
            needs_model=False,
            layer="Web Ingress",
        ),
        NodeSpec(
            id="n_b",
            name="B",
            type="gateway",
            role="r",
            inputs=[],
            outputs=["d2"],
            needs_model=False,
            layer="API Ingress",
        ),
        NodeSpec(
            id="n_c",
            name="C",
            type="sink",
            role="r",
            inputs=["d1", "d2"],
            outputs=[],
            needs_model=False,
            layer="Storage",
        ),
    ]
    edges = [
        EdgeSpec.model_validate({"from": "n_a", "to": "n_c", "flows": "f1"}),
        EdgeSpec.model_validate({"from": "n_b", "to": "n_c", "flows": "f2"}),
    ]
    spec = ArchitectureSpec(nodes=nodes, edges=edges, entry_ids=["n_a", "n_b"], exit_ids=["n_c"])
    # Both "Web Ingress" and "API Ingress" have min_rank 0; "API Ingress" < "Web Ingress"
    assert order_layers(spec) == ["API Ingress", "Web Ingress", "Storage"]


def test_order_layers_deterministic_under_shuffle() -> None:
    """order_layers is deterministic when node and edge orders are shuffled."""
    nodes = [
        NodeSpec(
            id="n_0",
            name="N0",
            type="t",
            role="r",
            inputs=[],
            outputs=["d0"],
            needs_model=False,
            layer="Layer A",
        ),
        NodeSpec(
            id="n_1",
            name="N1",
            type="t",
            role="r",
            inputs=["d0"],
            outputs=["d1"],
            needs_model=False,
            layer="Layer B",
        ),
        NodeSpec(
            id="n_2",
            name="N2",
            type="t",
            role="r",
            inputs=["d1"],
            outputs=["d2"],
            needs_model=False,
            layer="Layer C",
        ),
        NodeSpec(
            id="n_3",
            name="N3",
            type="t",
            role="r",
            inputs=["d2"],
            outputs=[],
            needs_model=False,
            layer="Layer D",
        ),
    ]
    edges = [
        EdgeSpec.model_validate({"from": "n_0", "to": "n_1", "flows": "f0"}),
        EdgeSpec.model_validate({"from": "n_1", "to": "n_2", "flows": "f1"}),
        EdgeSpec.model_validate({"from": "n_2", "to": "n_3", "flows": "f2"}),
    ]
    spec_base = ArchitectureSpec(nodes=nodes, edges=edges, entry_ids=["n_0"], exit_ids=["n_3"])
    expected = order_layers(spec_base)

    rng = random.Random(42)
    for _ in range(10):
        shuffled_nodes = list(nodes)
        shuffled_edges = list(edges)
        rng.shuffle(shuffled_nodes)
        rng.shuffle(shuffled_edges)
        shuffled_spec = ArchitectureSpec(
            nodes=shuffled_nodes, edges=shuffled_edges, entry_ids=["n_0"], exit_ids=["n_3"]
        )
        assert order_layers(shuffled_spec) == expected


def test_order_layers_assigns_missing_to_other_parts() -> None:
    """Nodes without layer are assigned to OTHER_PARTS_LAYER and ordered by rank."""
    nodes = [
        NodeSpec(
            id="n_in",
            name="Ingress",
            type="gateway",
            role="r",
            inputs=[],
            outputs=["d1"],
            needs_model=False,
            layer="Ingress",
        ),
        NodeSpec(
            id="n_mid",
            name="Mid",
            type="processor",
            role="r",
            inputs=["d1"],
            outputs=["d2"],
            needs_model=False,
            layer=None,
        ),
        NodeSpec(
            id="n_db",
            name="DB",
            type="database",
            role="r",
            inputs=["d2"],
            outputs=[],
            needs_model=False,
            layer="Storage",
        ),
    ]
    edges = [
        EdgeSpec.model_validate({"from": "n_in", "to": "n_mid", "flows": "f1"}),
        EdgeSpec.model_validate({"from": "n_mid", "to": "n_db", "flows": "f2"}),
    ]
    spec = ArchitectureSpec(nodes=nodes, edges=edges, entry_ids=["n_in"], exit_ids=["n_db"])
    assert order_layers(spec) == ["Ingress", OTHER_PARTS_LAYER, "Storage"]


def test_order_layers_normalizes_whitespace_and_case_variants() -> None:
    """Whitespace is stripped/collapsed and case variants are grouped under canonical display name."""
    nodes = [
        NodeSpec(
            id="n_1",
            name="N1",
            type="t",
            role="r",
            inputs=[],
            outputs=["d1"],
            needs_model=False,
            layer="  Data   Processing  ",
        ),
        NodeSpec(
            id="n_2",
            name="N2",
            type="t",
            role="r",
            inputs=["d1"],
            outputs=[],
            needs_model=False,
            layer="data processing",
        ),
    ]
    edges = [
        EdgeSpec.model_validate({"from": "n_1", "to": "n_2", "flows": "f1"}),
    ]
    spec = ArchitectureSpec(nodes=nodes, edges=edges, entry_ids=["n_1"], exit_ids=["n_2"])
    layers = order_layers(spec)
    assert len(layers) == 1
    assert layers[0] in ("Data Processing", "data processing")


def test_order_layers_raises_on_cycle() -> None:
    """order_layers raises ValueError if the graph contains a cycle."""
    nodes = [
        NodeSpec(
            id="n_a",
            name="A",
            type="t",
            role="r",
            inputs=[],
            outputs=[],
            needs_model=False,
            layer="L1",
        ),
        NodeSpec(
            id="n_b",
            name="B",
            type="t",
            role="r",
            inputs=[],
            outputs=[],
            needs_model=False,
            layer="L2",
        ),
    ]
    edges = [
        EdgeSpec.model_validate({"from": "n_a", "to": "n_b", "flows": "f1"}),
        EdgeSpec.model_validate({"from": "n_b", "to": "n_a", "flows": "f2"}),
    ]
    spec = ArchitectureSpec(nodes=nodes, edges=edges, entry_ids=["n_a"], exit_ids=["n_b"])
    with pytest.raises(ValueError, match="cycles"):
        order_layers(spec)
