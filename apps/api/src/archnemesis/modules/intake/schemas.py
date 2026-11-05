"""Schemas for intake API requests, responses, and LLM structured output."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from archnemesis.settings import get_settings
from archnemesis.shared.brief import BriefNumber, RequirementBrief

MAX_INPUT_CHARS: int = get_settings().max_input_chars


class IntakeBriefLLM(BaseModel):
    """Intake brief structure returned by the LLM (constraint texts only, no IDs)."""

    model_config = ConfigDict(extra="ignore")

    summary: str
    users: str
    data_involved: list[str] = Field(default_factory=list)
    domain_hint: str = ""
    stated_constraints: list[str] = Field(default_factory=list)
    unverifiable_requirements: list[str] = Field(default_factory=list)
    numbers_given: list[BriefNumber] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)


class IntakeLLMOutput(BaseModel):
    """Top-level structured output model for intake LLM task."""

    model_config = ConfigDict(extra="ignore")

    action: Literal["ask", "ready"]
    questions: list[str] = Field(default_factory=list)
    brief: IntakeBriefLLM | None = None


class IntakeTurnRequest(BaseModel):
    """Request payload for an intake dialogue turn."""

    session_id: str | None = Field(default=None, max_length=36)
    text: str = Field(min_length=1, max_length=MAX_INPUT_CHARS)


class IntakeTurnResponse(BaseModel):
    """Response payload for an intake dialogue turn."""

    status: Literal["needs_info", "ready"]
    session_id: str
    round: int
    questions: list[str] = Field(default_factory=list)
    brief: RequirementBrief | None = None
