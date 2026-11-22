"""Data schemas and types for model suggestions (Stage 6A/6B, D-401, D-404)."""

from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class SizeBand(StrEnum):
    """Categorization of model size based on parameter counts."""

    SMALL = "small"
    MEDIUM = "medium"
    LARGE = "large"
    UNKNOWN = "unknown"


class ProbeResult(StrEnum):
    """Outcome of probing a Hugging Face repository on ModelFit."""

    OPEN = "open"
    GATED = "gated"
    UNKNOWN = "unknown"


class ModelProbeDetail(BaseModel):
    """Result of probing a repository on ModelFit detail endpoint.

    Contains access status and total parameters extracted strictly from
    normalized_model.total_params.
    """

    model_config = ConfigDict(extra="forbid")

    status: ProbeResult
    total_params: int | None = None


class ModelSuggestionItem(BaseModel):
    """Normalized suggestion item stored in database.

    URL fields are explicitly omitted from persistent storage and generated
    dynamically at response time as internal routes (/models/{id} and /models).
    """

    model_config = ConfigDict(extra="forbid")

    id: str
    author: str
    model_name: str
    task_tag: str
    total_params: int | None = None
    size_band: SizeBand
    downloads: int = 0
    likes: int = 0


class ModelSuggestionItemResponse(BaseModel):
    """Model suggestion item returned via API with dynamically computed URLs."""

    model_config = ConfigDict(extra="forbid")

    id: str
    author: str
    model_name: str
    task_tag: str
    total_params: int | None = None
    size_band: SizeBand
    downloads: int = 0
    likes: int = 0
    details_url: str | None = None
    browse_url: str | None = None


class ModelSuggestionsResponse(BaseModel):
    """API response envelope for model suggestions."""

    model_config = ConfigDict(extra="forbid")

    status: Literal["ok", "unavailable", "empty"]
    task_tag: str | None = None
    items: list[ModelSuggestionItemResponse] = Field(default_factory=list)
    message: str | None = None


class ModelTagOutput(BaseModel):
    """Structured JSON output schema for LLM task-tag classification."""

    model_config = ConfigDict(extra="ignore")

    task_tag: Literal[
        "text-generation",
        "text-to-speech",
        "automatic-speech-recognition",
        "text-to-image",
        "image-to-text",
        "feature-extraction",
        "sentence-similarity",
        "translation",
        "summarization",
        "question-answering",
    ]
