"""Data schemas and types for model suggestions (Stage 6A, D-401)."""

from enum import StrEnum

from pydantic import BaseModel, ConfigDict


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


class ModelSuggestionItem(BaseModel):
    """Normalized suggestion item for an AI architecture node.

    URL fields are explicitly omitted here; URLs are generated dynamically
    at response time using modelfit_web_url and never stored.
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
