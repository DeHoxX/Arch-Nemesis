"""Tests for the code-only fallback explanation generator and explanation assembly."""

from archnemesis.modules.explainer.fallback import (
    assemble_explanation,
    build_fallback_explanation,
    format_names,
)
from archnemesis.modules.explainer.schemas import (
    CheckDraft,
    ExplanationDraft,
    FlowStepDraft,
    PartDraft,
)
from archnemesis.modules.validation.models import (
    ArchitectureSpec,
    ConstraintSpec,
    EdgeSpec,
    NodeSpec,
)


def _make_spec(
    needs_model: bool = True,
    multi_entries: bool = False,
) -> ArchitectureSpec:
    entry_ids = ["ingress"]
    nodes = [
        NodeSpec(
            id="ingress",
            name="Ingress Gateway",
            type="gateway",
            role="Receives HTTPS traffic from external users",
            inputs=["HTTP Requests"],
            outputs=["Cleaned Payload"],
            tech_options=["Envoy"],
            needs_model=False,
        ),
        NodeSpec(
            id="analyzer",
            name="Payload Analyzer",
            type="service",
            role="Analyzes payload for anomaly detection",
            inputs=["Cleaned Payload"],
            outputs=["Analysis Result"],
            tech_options=["FastAPI"],
            needs_model=needs_model,
        ),
        NodeSpec(
            id="storage",
            name="Event Store",
            type="database",
            role="Persists audited events",
            inputs=["Analysis Result"],
            outputs=[],
            tech_options=["PostgreSQL"],
            needs_model=False,
        ),
    ]
    edges = [
        EdgeSpec.model_validate({"from": "ingress", "to": "analyzer", "flows": "Payload"}),
        EdgeSpec.model_validate({"from": "analyzer", "to": "storage", "flows": "Events"}),
    ]

    if multi_entries:
        nodes.insert(
            1,
            NodeSpec(
                id="webhook",
                name="Webhook Listener",
                type="service",
                role="Receives third-party webhooks",
                inputs=[],
                outputs=["Cleaned Payload"],
                tech_options=["FastAPI"],
                needs_model=False,
            ),
        )
        edges.append(
            EdgeSpec.model_validate({"from": "webhook", "to": "analyzer", "flows": "Webhook Data"})
        )
        entry_ids.append("webhook")

    return ArchitectureSpec(
        nodes=nodes,
        edges=edges,
        constraints=[
            ConstraintSpec(id="c1", text="All payload transfers must use TLS.", kind="security"),
        ],
        entry_ids=entry_ids,
        exit_ids=["storage"],
    )


def test_format_names_helper() -> None:
    assert format_names([]) == ""
    assert format_names(["Node A"]) == "Node A"
    assert format_names(["Node A", "Node B"]) == "Node A and Node B"
    assert format_names(["Node A", "Node B", "Node C"]) == "Node A, Node B, and Node C"


def test_fallback_explanation_structure_and_templates() -> None:
    spec = _make_spec(needs_model=True)
    explanation = build_fallback_explanation(spec)

    assert explanation.source == "fallback"
    assert (
        explanation.overview
        == "This design has 3 parts. A request enters at Ingress Gateway and the result leaves at Event Store."
    )

    # Flow steps
    assert len(explanation.flow) == 3
    assert explanation.flow[0].step == 1
    assert explanation.flow[0].node_id == "ingress"
    assert explanation.flow[0].node_name == "Ingress Gateway"
    assert explanation.flow[0].text == "Ingress Gateway: Receives HTTPS traffic from external users"

    # Parts
    assert len(explanation.parts) == 3
    # Ingress has inputs and outputs
    assert (
        explanation.parts[0].text
        == "Ingress Gateway receives HTTP Requests and produces Cleaned Payload."
    )
    # Storage has inputs only
    assert explanation.parts[2].text == "Event Store receives Analysis Result."

    # Checks
    assert len(explanation.checks) == 1
    assert explanation.checks[0].constraint_id == "c1"
    assert explanation.checks[0].text == "All payload transfers must use TLS."

    # Models
    assert len(explanation.models.nodes) == 1
    assert explanation.models.nodes[0].id == "analyzer"
    assert explanation.models.nodes[0].name == "Payload Analyzer"
    assert explanation.models.text == "Parts that use an AI model: Payload Analyzer."


def test_fallback_explanation_multi_entries() -> None:
    spec = _make_spec(needs_model=True, multi_entries=True)
    explanation = build_fallback_explanation(spec)

    assert (
        explanation.overview
        == "This design has 4 parts. A request enters at Ingress Gateway and Webhook Listener and the result leaves at Event Store."
    )
    # Webhook Listener has outputs only (inputs empty)
    webhook_part = next(p for p in explanation.parts if p.node_id == "webhook")
    assert webhook_part.text == "Webhook Listener produces Cleaned Payload."


def test_fallback_explanation_no_models() -> None:
    spec = _make_spec(needs_model=False)
    explanation = build_fallback_explanation(spec)

    assert explanation.models.nodes == []
    assert explanation.models.text == "No part is marked as using an AI model."


def test_fallback_part_with_neither_inputs_nor_outputs() -> None:
    spec = ArchitectureSpec(
        nodes=[
            NodeSpec(
                id="standalone",
                name="Standalone Service",
                type="service",
                role="Performs independent batch jobs",
                inputs=[],
                outputs=[],
            )
        ],
        edges=[],
        constraints=[],
        entry_ids=["standalone"],
        exit_ids=["standalone"],
    )
    explanation = build_fallback_explanation(spec)
    assert len(explanation.parts) == 1
    assert explanation.parts[0].text == "Standalone Service."


def test_assemble_explanation_from_draft() -> None:
    spec = _make_spec(needs_model=True)
    draft = ExplanationDraft(
        overview="User-facing overview text.",
        flow_steps=[
            FlowStepDraft(node_id="ingress", text="Custom flow 1."),
            FlowStepDraft(node_id="analyzer", text="Custom flow 2."),
            FlowStepDraft(node_id="storage", text="Custom flow 3."),
        ],
        parts=[
            PartDraft(node_id="ingress", text="Custom part 1."),
            PartDraft(node_id="analyzer", text="Custom part 2."),
            PartDraft(node_id="storage", text="Custom part 3."),
        ],
        checks=[
            CheckDraft(constraint_id="c1", text="Custom check 1."),
        ],
        models_text="Custom models usage explanation.",
    )

    assembled = assemble_explanation(draft, spec)

    assert assembled.source == "llm"
    assert assembled.overview == "User-facing overview text."
    assert len(assembled.flow) == 3
    assert assembled.flow[0].step == 1
    assert assembled.flow[0].node_name == "Ingress Gateway"
    assert assembled.flow[0].text == "Custom flow 1."
    assert assembled.flow[1].step == 2
    assert assembled.flow[1].node_name == "Payload Analyzer"
    assert assembled.flow[1].text == "Custom flow 2."
    assert assembled.parts[0].node_name == "Ingress Gateway"
    assert assembled.models.text == "Custom models usage explanation."
