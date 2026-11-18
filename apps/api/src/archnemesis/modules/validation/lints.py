"""Lint rules and diagnostic warnings for ArchitectureSpec."""

from archnemesis.modules.validation.models import ArchitectureSpec, Limits, ValidationIssue
from archnemesis.modules.validation.ordering import (
    OTHER_PARTS_LAYER,
    _resolve_layer_display_names,
    order_layers,
)


def check_lints(spec: ArchitectureSpec, limits: Limits | None = None) -> list[ValidationIssue]:
    """Run lint checks that produce non-blocking warnings."""
    warnings: list[ValidationIssue] = []
    exit_set = set(spec.exit_ids)

    # 1. W_MODEL_NODE_NO_INPUTS: Node uses an AI model but lists no inputs
    for node in spec.nodes:
        if node.needs_model and not node.inputs:
            warnings.append(
                ValidationIssue(
                    code="W_MODEL_NODE_NO_INPUTS",
                    severity="warning",
                    message=f"Node '{node.id}' uses an AI model but lists no inputs.",
                    ids=[node.id],
                )
            )

    # 2. W_NODE_NO_OUTPUTS: Non-exit node lists no outputs
    for node in spec.nodes:
        if node.id not in exit_set and not node.outputs:
            warnings.append(
                ValidationIssue(
                    code="W_NODE_NO_OUTPUTS",
                    severity="warning",
                    message=f"Node '{node.id}' lists no outputs.",
                    ids=[node.id],
                )
            )

    # 3. W_TOO_FEW_NODES: Fewer than 3 nodes
    if len(spec.nodes) < 3:
        warnings.append(
            ValidationIssue(
                code="W_TOO_FEW_NODES",
                severity="warning",
                message=f"The design has only {len(spec.nodes)} nodes; most real systems need more parts.",
                ids=[n.id for n in spec.nodes],
            )
        )

    # 4. W_DUP_NODE_NAME: Same name ignoring case
    name_to_ids: dict[str, list[str]] = {}
    for node in spec.nodes:
        normalized = node.name.strip().lower()
        name_to_ids.setdefault(normalized, []).append(node.id)

    for ids in sorted(name_to_ids.values()):
        if len(ids) > 1:
            warnings.append(
                ValidationIssue(
                    code="W_DUP_NODE_NAME",
                    severity="warning",
                    message=f"Nodes '{ids[0]}' and '{ids[1]}' have the same name.",
                    ids=[ids[0], ids[1]],
                )
            )

    # 5. W_NO_AI_NODE: No node in the architecture uses an AI model
    if not any(node.needs_model for node in spec.nodes):
        warnings.append(
            ValidationIssue(
                code="W_NO_AI_NODE",
                severity="warning",
                message="No node in the architecture is marked as using an AI model (needs_model: true).",
                ids=[n.id for n in spec.nodes],
            )
        )

    # 6. W_CODE_REPAIR_APPLIED: Preserved if already present or checked on spec
    # (Produced by repair.patch_constraints)

    # 7. W_AGENT_WITHOUT_TOOLS: Agent node lists no tools
    for node in spec.nodes:
        if node.ai_role == "agent" and not node.tools:
            warnings.append(
                ValidationIssue(
                    code="W_AGENT_WITHOUT_TOOLS",
                    severity="warning",
                    message=f"Agent node '{node.id}' is declared as an agent but lists no tools.",
                    ids=[node.id],
                )
            )

    # 8. W_MERGE_AS_AGENT: Node with in-degree >= 2 marked as agent or model
    for node in sorted(spec.nodes, key=lambda n: n.id):
        in_deg = sum(1 for e in spec.edges if e.to == node.id)
        is_ai = bool(node.needs_model) or node.ai_role in ("agent", "model")
        if in_deg >= 2 and is_ai:
            warnings.append(
                ValidationIssue(
                    code="W_MERGE_AS_AGENT",
                    severity="warning",
                    message=(
                        f"Merge node '{node.id}' combines parallel branches but is marked as an AI agent or model. "
                        "Plain code should be used unless AI judgment is required."
                    ),
                    ids=[node.id],
                )
            )

    # 9. W_LAYER_MISSING: Node has no layer; it is shown under 'Other parts'
    for node in sorted(spec.nodes, key=lambda n: n.id):
        if node.layer is None or not node.layer.strip():
            warnings.append(
                ValidationIssue(
                    code="W_LAYER_MISSING",
                    severity="warning",
                    message=f"Node '{node.id}' has no layer; it is shown under 'Other parts'.",
                    ids=[node.id],
                )
            )

    # 10. W_TOO_MANY_LAYERS & 11. W_LAYER_BACKWARD
    try:
        ordered_layers = order_layers(spec)
    except ValueError:
        ordered_layers = []

    if ordered_layers:
        effective_limits = limits if limits is not None else Limits()
        if len(ordered_layers) > effective_limits.max_layers:
            warnings.append(
                ValidationIssue(
                    code="W_TOO_MANY_LAYERS",
                    severity="warning",
                    message=(
                        f"The design has {len(ordered_layers)} layers; "
                        f"more than {effective_limits.max_layers} is hard to read."
                    ),
                    ids=[n.id for n in spec.nodes],
                )
            )

        layer_index = {l_name: idx for idx, l_name in enumerate(ordered_layers)}
        layer_display_names = _resolve_layer_display_names(spec)
        node_layer_map: dict[str, str] = {}
        for node in spec.nodes:
            if node.layer is not None and node.layer.strip():
                cleaned = " ".join(node.layer.split()).strip()
                node_layer_map[node.id] = layer_display_names[cleaned.casefold()]
            else:
                node_layer_map[node.id] = OTHER_PARTS_LAYER

        for edge in sorted(spec.edges, key=lambda e: (e.from_node, e.to, e.flows)):
            from_idx = layer_index[node_layer_map[edge.from_node]]
            to_idx = layer_index[node_layer_map[edge.to]]
            if to_idx < from_idx:
                warnings.append(
                    ValidationIssue(
                        code="W_LAYER_BACKWARD",
                        severity="warning",
                        message=f"The flow from '{edge.from_node}' to '{edge.to}' goes back to an earlier layer.",
                        ids=[edge.from_node, edge.to],
                    )
                )

    return warnings
