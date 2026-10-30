"""Deterministic code-only fallback explanation generator and explanation assembly."""

from archnemesis.modules.explainer.schemas import (
    CheckExplanation,
    Explanation,
    ExplanationDraft,
    FlowStep,
    ModelUsageExplanation,
    NodeReference,
    PartExplanation,
)
from archnemesis.modules.validation.models import ArchitectureSpec
from archnemesis.modules.validation.ordering import order_nodes
from archnemesis.shared.brief import RequirementBrief


def format_names(names: list[str]) -> str:
    """Format a list of names into a human-readable string with commas and 'and'."""
    if not names:
        return ""
    if len(names) == 1:
        return names[0]
    if len(names) == 2:
        return f"{names[0]} and {names[1]}"
    return f"{', '.join(names[:-1])}, and {names[-1]}"


def build_fallback_explanation(
    spec: ArchitectureSpec,
    brief: RequirementBrief | None = None,
    flow_order: list[str] | None = None,
) -> Explanation:
    """Build a deterministic, code-only fallback Explanation strictly adhering to BUILD_PLAN.md:477."""
    if flow_order is None:
        try:
            flow_order = order_nodes(spec)
        except ValueError:
            flow_order = [n.id for n in spec.nodes]

    node_map = {n.id: n for n in spec.nodes}
    n = len(spec.nodes)

    # 1. Overview: This design has {n} parts. A request enters at {entries} and the result leaves at {exits}.
    entry_names = [node_map[eid].name for eid in spec.entry_ids if eid in node_map]
    if not entry_names and flow_order and flow_order[0] in node_map:
        entry_names = [node_map[flow_order[0]].name]

    exit_names = [node_map[xid].name for xid in spec.exit_ids if xid in node_map]
    if not exit_names and flow_order and flow_order[-1] in node_map:
        exit_names = [node_map[flow_order[-1]].name]

    entries_str = format_names(entry_names)
    exits_str = format_names(exit_names)
    overview = f"This design has {n} parts. A request enters at {entries_str} and the result leaves at {exits_str}."

    # 2. Flow step: {name}: {role}
    flow: list[FlowStep] = []
    for idx, nid in enumerate(flow_order):
        node = node_map.get(nid)
        if node is not None:
            flow.append(
                FlowStep(
                    step=idx + 1,
                    node_id=node.id,
                    node_name=node.name,
                    text=f"{node.name}: {node.role}",
                )
            )

    # 3. Part: {name} receives {inputs} and produces {outputs}. (omits empty clauses)
    parts: list[PartExplanation] = []
    for nid in flow_order:
        node = node_map.get(nid)
        if node is None:
            continue
        has_inputs = bool(node.inputs)
        has_outputs = bool(node.outputs)
        if has_inputs and has_outputs:
            text = f"{node.name} receives {', '.join(node.inputs)} and produces {', '.join(node.outputs)}."
        elif has_inputs and not has_outputs:
            text = f"{node.name} receives {', '.join(node.inputs)}."
        elif not has_inputs and has_outputs:
            text = f"{node.name} produces {', '.join(node.outputs)}."
        else:
            text = f"{node.name}."
        parts.append(
            PartExplanation(
                node_id=node.id,
                node_name=node.name,
                text=text,
            )
        )

    # 4. Check: constraint's own text
    checks = [
        CheckExplanation(
            constraint_id=c.id,
            text=c.text,
        )
        for c in spec.constraints
    ]

    # 5. Models: Parts that use an AI model: {names}. or No part is marked as using an AI model.
    model_nodes = [node for node in spec.nodes if node.needs_model]
    if model_nodes:
        model_names_str = format_names([m.name for m in model_nodes])
        models_text = f"Parts that use an AI model: {model_names_str}."
    else:
        models_text = "No part is marked as using an AI model."

    return Explanation(
        overview=overview,
        flow=flow,
        parts=parts,
        checks=checks,
        models=ModelUsageExplanation(
            nodes=[NodeReference(id=m.id, name=m.name) for m in model_nodes],
            text=models_text,
        ),
        source="fallback",
    )


def assemble_explanation(
    draft: ExplanationDraft,
    spec: ArchitectureSpec,
    flow_order: list[str] | None = None,
) -> Explanation:
    """Assemble a verified Explanation from an LLM draft with code-assigned step numbers and node names."""
    if flow_order is None:
        try:
            flow_order = order_nodes(spec)
        except ValueError:
            flow_order = [n.id for n in spec.nodes]

    node_map = {n.id: n for n in spec.nodes}

    flow = [
        FlowStep(
            step=idx + 1,
            node_id=step_draft.node_id,
            node_name=node_map[step_draft.node_id].name
            if step_draft.node_id in node_map
            else step_draft.node_id,
            text=step_draft.text,
        )
        for idx, step_draft in enumerate(draft.flow_steps)
    ]

    parts = [
        PartExplanation(
            node_id=part_draft.node_id,
            node_name=node_map[part_draft.node_id].name
            if part_draft.node_id in node_map
            else part_draft.node_id,
            text=part_draft.text,
        )
        for part_draft in draft.parts
    ]

    checks = [
        CheckExplanation(
            constraint_id=check_draft.constraint_id,
            text=check_draft.text,
        )
        for check_draft in draft.checks
    ]

    model_nodes = [NodeReference(id=n.id, name=n.name) for n in spec.nodes if n.needs_model]
    models_text = draft.models_text
    if not models_text:
        if model_nodes:
            names_str = format_names([n.name for n in model_nodes])
            models_text = f"Parts that use an AI model: {names_str}."
        else:
            models_text = "No part is marked as using an AI model."

    return Explanation(
        overview=draft.overview,
        flow=flow,
        parts=parts,
        checks=checks,
        models=ModelUsageExplanation(nodes=model_nodes, text=models_text),
        source="llm",
    )
