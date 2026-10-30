"""Pydantic schemas for the explainer module."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class FlowStepDraft(BaseModel):
    """A draft step in the end-to-end request flow proposed by the LLM."""

    model_config = ConfigDict(extra="ignore")

    node_id: str
    text: str = Field(max_length=300)


class PartDraft(BaseModel):
    """A draft explanation of a single architectural part proposed by the LLM."""

    model_config = ConfigDict(extra="ignore")

    node_id: str
    text: str = Field(max_length=300)


class CheckDraft(BaseModel):
    """A draft explanation of an architectural constraint proposed by the LLM."""

    model_config = ConfigDict(extra="ignore")

    constraint_id: str
    text: str = Field(max_length=300)


class ExplanationDraft(BaseModel):
    """Structured explanation draft produced by the LLM (before code verification)."""

    model_config = ConfigDict(extra="ignore")

    overview: str = Field(max_length=600)
    flow_steps: list[FlowStepDraft]
    parts: list[PartDraft]
    checks: list[CheckDraft]
    models_text: str = Field(default="", max_length=400)


class FlowStep(BaseModel):
    """Final verified request flow step with code-assigned step number and node name."""

    model_config = ConfigDict(extra="ignore")

    step: int
    node_id: str
    node_name: str
    text: str


class PartExplanation(BaseModel):
    """Final verified explanation for an individual architectural part."""

    model_config = ConfigDict(extra="ignore")

    node_id: str
    node_name: str
    text: str


class CheckExplanation(BaseModel):
    """Final verified explanation for an architectural check."""

    model_config = ConfigDict(extra="ignore")

    constraint_id: str
    text: str


class NodeReference(BaseModel):
    """Reference to an architectural node using an AI model."""

    model_config = ConfigDict(extra="ignore")

    id: str
    name: str


class ModelUsageExplanation(BaseModel):
    """Explanation section detailing which nodes employ AI models and why."""

    model_config = ConfigDict(extra="ignore")

    nodes: list[NodeReference]
    text: str


class Explanation(BaseModel):
    """Complete, verified explanation returned to the client and stored in the database."""

    model_config = ConfigDict(extra="ignore")

    overview: str
    flow: list[FlowStep]
    parts: list[PartExplanation]
    checks: list[CheckExplanation]
    models: ModelUsageExplanation
    source: Literal["llm", "fallback"]


class VerificationIssue(BaseModel):
    """A single diagnostic issue found while verifying an explanation draft."""

    model_config = ConfigDict(extra="ignore")

    code: str
    message: str
    field: str | None = None
