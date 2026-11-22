"""Model suggestions module for Arch-Nemesis (Stage 6A, D-401)."""

from archnemesis.modules.models.client import ModelFitClient, ModelFitUnavailable
from archnemesis.modules.models.router import router
from archnemesis.modules.models.schemas import (
    ModelSuggestionItem,
    ModelSuggestionItemResponse,
    ModelSuggestionsResponse,
    ProbeResult,
    SizeBand,
)
from archnemesis.modules.models.selection import partition_candidates, select_model_suggestions
from archnemesis.modules.models.tags import (
    CLOSED_PIPELINE_TAGS,
    PipelineTag,
    fallback_pipeline_tag,
)

__all__ = [
    "CLOSED_PIPELINE_TAGS",
    "ModelFitClient",
    "ModelFitUnavailable",
    "ModelSuggestionItem",
    "ModelSuggestionItemResponse",
    "ModelSuggestionsResponse",
    "PipelineTag",
    "ProbeResult",
    "SizeBand",
    "fallback_pipeline_tag",
    "partition_candidates",
    "router",
    "select_model_suggestions",
]
