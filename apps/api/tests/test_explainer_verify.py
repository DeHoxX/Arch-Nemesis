"""Tests for the explanation draft verification engine."""

from archnemesis.modules.explainer.schemas import (
    CheckDraft,
    ExplanationDraft,
    FlowStepDraft,
    PartDraft,
)
from archnemesis.modules.explainer.verify import verify_draft
from archnemesis.modules.validation.models import (
    ArchitectureSpec,
    ConstraintSpec,
    EdgeSpec,
    NodeSpec,
)
from archnemesis.shared.brief import BriefConstraint, BriefNumber, RequirementBrief


def _make_sample_spec() -> ArchitectureSpec:
    return ArchitectureSpec(
        nodes=[
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
                needs_model=True,
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
        ],
        edges=[
            EdgeSpec.model_validate({"from": "ingress", "to": "analyzer", "flows": "Payload"}),
            EdgeSpec.model_validate({"from": "analyzer", "to": "storage", "flows": "Events"}),
        ],
        constraints=[
            ConstraintSpec(id="c1", text="All payload transfers must use TLS.", kind="security"),
        ],
        entry_ids=["ingress"],
        exit_ids=["storage"],
    )


def _make_sample_brief() -> RequirementBrief:
    return RequirementBrief(
        summary="A pipeline to ingest and analyze event payloads safely.",
        users="Internal data analysts",
        data_involved=["JSON payloads"],
        domain_hint="analytics",
        stated_constraints=[
            BriefConstraint(id="bc1", text="Must support 10,000 requests per second.")
        ],
        unverifiable_requirements=[],
        numbers_given=[
            BriefNumber(label="throughput", value="10,000", unit="req/sec"),
            BriefNumber(label="uptime", value="99.9", unit="%"),
        ],
        assumptions=[],
    )


def _make_valid_draft() -> ExplanationDraft:
    return ExplanationDraft(
        overview="This system ingests data, evaluates payloads, and persists results.",
        flow_steps=[
            FlowStepDraft(node_id="ingress", text="Traffic arrives at ingress gateway."),
            FlowStepDraft(node_id="analyzer", text="Payload analyzer inspects data for anomalies."),
            FlowStepDraft(node_id="storage", text="Event store persists final audit records."),
        ],
        parts=[
            PartDraft(
                node_id="ingress", text="Handles inbound HTTP connections and tls termination."
            ),
            PartDraft(node_id="analyzer", text="Performs inspection with an AI model."),
            PartDraft(node_id="storage", text="Provides relational storage for events."),
        ],
        checks=[
            CheckDraft(
                constraint_id="c1", text="Ensures cryptographic protection across transfers."
            ),
        ],
        models_text="Payload analyzer leverages an AI model for anomaly identification.",
    )


def test_valid_draft_passes_verification() -> None:
    spec = _make_sample_spec()
    brief = _make_sample_brief()
    draft = _make_valid_draft()

    issues = verify_draft(draft, spec, brief)
    assert issues == []


def test_unknown_node_reported() -> None:
    spec = _make_sample_spec()
    brief = _make_sample_brief()
    draft = _make_valid_draft()
    draft.flow_steps.append(FlowStepDraft(node_id="ghost_node", text="Spooky step."))
    draft.parts.append(PartDraft(node_id="alien_node", text="Alien part."))

    issues = verify_draft(draft, spec, brief)
    codes = [i.code for i in issues]
    assert "X_UNKNOWN_NODE" in codes
    unknown_messages = [i.message for i in issues if i.code == "X_UNKNOWN_NODE"]
    assert any("ghost_node" in msg for msg in unknown_messages)
    assert any("alien_node" in msg for msg in unknown_messages)


def test_unknown_constraint_reported() -> None:
    spec = _make_sample_spec()
    brief = _make_sample_brief()
    draft = _make_valid_draft()
    draft.checks.append(CheckDraft(constraint_id="c999", text="Imaginary check."))

    issues = verify_draft(draft, spec, brief)
    codes = [i.code for i in issues]
    assert "X_UNKNOWN_CONSTRAINT" in codes
    assert any("c999" in i.message for i in issues if i.code == "X_UNKNOWN_CONSTRAINT")


def test_missing_part_reported() -> None:
    spec = _make_sample_spec()
    brief = _make_sample_brief()
    draft = _make_valid_draft()
    draft.parts = [p for p in draft.parts if p.node_id != "storage"]

    issues = verify_draft(draft, spec, brief)
    codes = [i.code for i in issues]
    assert "X_MISSING_PART" in codes
    assert any("storage" in i.message for i in issues if i.code == "X_MISSING_PART")


def test_flow_order_violation_reported() -> None:
    spec = _make_sample_spec()
    brief = _make_sample_brief()
    draft = _make_valid_draft()
    # Invert the order of ingress and analyzer
    draft.flow_steps = [draft.flow_steps[1], draft.flow_steps[0], draft.flow_steps[2]]

    issues = verify_draft(draft, spec, brief)
    codes = [i.code for i in issues]
    assert "X_FLOW_ORDER" in codes


def test_too_long_limits_reported() -> None:
    spec = _make_sample_spec()
    brief = _make_sample_brief()
    draft = _make_valid_draft()

    draft.overview = "a" * 601
    draft.flow_steps[0].text = "b" * 301
    draft.parts[0].text = "c" * 301
    draft.checks[0].text = "d" * 301
    draft.models_text = "e" * 401

    issues = verify_draft(draft, spec, brief)
    too_long_issues = [i for i in issues if i.code == "X_TOO_LONG"]
    assert len(too_long_issues) == 5


def test_forbidden_words_detected() -> None:
    spec = _make_sample_spec()
    brief = _make_sample_brief()

    forbidden_list = [
        "cost",
        "costs",
        "price",
        "pricing",
        "budget",
        "timeline",
        "effort",
        "roi",
        "savings",
    ]
    for word in forbidden_list:
        draft = _make_valid_draft()
        draft.overview = f"This overview discusses the {word} of the architecture."
        issues = verify_draft(draft, spec, brief)
        codes = [i.code for i in issues]
        assert "X_FORBIDDEN_WORD" in codes, f"Expected {word} to trigger X_FORBIDDEN_WORD"


def test_hyphenated_forbidden_word_detected() -> None:
    spec = _make_sample_spec()
    brief = _make_sample_brief()
    draft = _make_valid_draft()
    draft.overview = "We recommend a zero-cost solution."
    issues = verify_draft(draft, spec, brief)
    codes = [i.code for i in issues]
    assert "X_FORBIDDEN_WORD" in codes


def test_compliance_claims_detected() -> None:
    spec = _make_sample_spec()
    brief = _make_sample_brief()

    claims = ["compliant", "certified", "guarantee", "guarantees", "guaranteed", "fully secure"]
    for phrase in claims:
        draft = _make_valid_draft()
        draft.parts[0].text = f"This component is {phrase} against attack."
        issues = verify_draft(draft, spec, brief)
        codes = [i.code for i in issues]
        assert "X_COMPLIANCE_CLAIM" in codes, f"Expected {phrase} to trigger X_COMPLIANCE_CLAIM"


def test_number_rule_allowed_brief_numbers_pass() -> None:
    spec = _make_sample_spec()
    brief = _make_sample_brief()
    draft = _make_valid_draft()
    draft.overview = "Processes up to 10,000 requests with 99.9% target availability."

    issues = verify_draft(draft, spec, brief)
    number_issues = [i for i in issues if i.code == "X_NUMBER"]
    assert number_issues == []


def test_number_rule_invented_digit_number_fails() -> None:
    spec = _make_sample_spec()
    brief = _make_sample_brief()
    draft = _make_valid_draft()
    draft.overview = "Processes up to 42 items per batch."

    issues = verify_draft(draft, spec, brief)
    number_issues = [i for i in issues if i.code == "X_NUMBER"]
    assert len(number_issues) == 1
    assert "42" in number_issues[0].message


def test_spelled_numbers_rules() -> None:
    # 3 nodes in sample spec: nodes are 1, 2, 3
    spec = _make_sample_spec()
    brief = _make_sample_brief()

    # "three" is allowed because node count is 3 (range 1..3 includes 3)
    draft_three = _make_valid_draft()
    draft_three.overview = "There are three primary stages in this pipeline."
    issues_three = verify_draft(draft_three, spec, brief)
    assert not any(i.code == "X_NUMBER" for i in issues_three)

    # "one", "two", "first", "second", "third" are everyday words and are never checked
    draft_everyday = _make_valid_draft()
    draft_everyday.overview = "The first step handles one item and the second handles two."
    issues_everyday = verify_draft(draft_everyday, spec, brief)
    assert not any(i.code == "X_NUMBER" for i in issues_everyday)

    # "four" fails because node count is 3 and 4 is not in brief
    draft_four = _make_valid_draft()
    draft_four.overview = "There are four primary components."
    issues_four = verify_draft(draft_four, spec, brief)
    assert any(i.code == "X_NUMBER" and "four" in i.message.lower() for i in issues_four)


def test_spelled_three_fails_when_node_count_is_two() -> None:
    spec = _make_sample_spec()
    # Reduce spec to 2 nodes
    spec.nodes = spec.nodes[:2]
    spec.edges = [spec.edges[0]]
    brief = _make_sample_brief()

    draft = ExplanationDraft(
        overview="There are three components in total.",
        flow_steps=[
            FlowStepDraft(node_id="ingress", text="Step one."),
            FlowStepDraft(node_id="analyzer", text="Step two."),
        ],
        parts=[
            PartDraft(node_id="ingress", text="Part one."),
            PartDraft(node_id="analyzer", text="Part two."),
        ],
        checks=[
            CheckDraft(constraint_id="c1", text="TLS enforced."),
        ],
        models_text="",
    )

    issues = verify_draft(draft, spec, brief)
    number_issues = [i for i in issues if i.code == "X_NUMBER"]
    assert len(number_issues) == 1
    assert "three" in number_issues[0].message.lower()
