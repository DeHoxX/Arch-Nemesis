"""Schemas for intake API requests, responses, and LLM structured output."""

import re
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from archnemesis.settings import get_settings
from archnemesis.shared.brief import BriefNumber, RequirementBrief

MAX_INPUT_CHARS: int = get_settings().max_input_chars

FORBIDDEN_WORDS_RE = re.compile(
    r"\b(cost|costs|price|pricing|budget|timeline|effort|roi|savings)\b",
    re.IGNORECASE,
)

COMPLIANCE_CLAIMS_RE = re.compile(
    r"\b(compliant|certified|guarantee|guarantees|guaranteed|fully secure)\b",
    re.IGNORECASE,
)


class IntakeQuestion(BaseModel):
    """Structured clarifying question with proactive suggestions."""

    model_config = ConfigDict(extra="ignore")

    question: str = Field(min_length=1, max_length=200)
    suggested_answer: str | None = Field(default=None)
    options: list[str] = Field(default_factory=list)

    @field_validator("suggested_answer", mode="before")
    @classmethod
    def clean_suggested_answer(cls, v: Any) -> str | None:
        if v is None:
            return None
        if not isinstance(v, str):
            return None
        s = v.strip()
        if not s or len(s) > 200:
            return None
        if FORBIDDEN_WORDS_RE.search(s) or COMPLIANCE_CLAIMS_RE.search(s):
            return None
        return s

    @field_validator("options", mode="before")
    @classmethod
    def clean_options(cls, v: Any) -> list[str]:
        if not isinstance(v, list):
            return []
        cleaned: list[str] = []
        for item in v:
            if isinstance(item, str):
                s = item.strip()
                if 1 <= len(s) <= 60 and not (
                    FORBIDDEN_WORDS_RE.search(s) or COMPLIANCE_CLAIMS_RE.search(s)
                ):
                    cleaned.append(s)
            if len(cleaned) == 3:
                break
        return cleaned


def _coerce_questions_list(v: Any) -> Any:
    if not isinstance(v, list):
        return v
    coerced: list[Any] = []
    for item in v:
        if isinstance(item, str):
            coerced.append({"question": item})
        else:
            coerced.append(item)
    return coerced


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
    questions: list[IntakeQuestion] = Field(default_factory=list)
    brief: IntakeBriefLLM | None = None

    @field_validator("questions", mode="before")
    @classmethod
    def coerce_questions(cls, v: Any) -> Any:
        return _coerce_questions_list(v)


class IntakeTurnRequest(BaseModel):
    """Request payload for an intake dialogue turn."""

    session_id: str | None = Field(default=None, max_length=36)
    text: str = Field(min_length=1, max_length=MAX_INPUT_CHARS)


class IntakeTurnResponse(BaseModel):
    """Response payload for an intake dialogue turn."""

    status: Literal["needs_info", "ready"]
    session_id: str
    round: int
    questions: list[IntakeQuestion] = Field(default_factory=list)
    brief: RequirementBrief | None = None

    @field_validator("questions", mode="before")
    @classmethod
    def coerce_questions(cls, v: Any) -> Any:
        return _coerce_questions_list(v)
