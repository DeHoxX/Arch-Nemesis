"""Pydantic schemas for refinement chat, suggestions, patches, and version control."""

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from archnemesis.modules.validation.models import ArchitectureSpec, ValidationIssue
from archnemesis.modules.validation.patch import DiffResult, Patch, PatchStatus
from archnemesis.shared.brief import RequirementBrief


class ChatRequest(BaseModel):
    """User refinement chat message payload."""

    model_config = ConfigDict(extra="forbid")

    message: str = Field(min_length=1, max_length=1000)


class PatchSummary(BaseModel):
    """Summary of a proposed or evaluated patch."""

    model_config = ConfigDict(extra="ignore")

    id: str
    status: PatchStatus
    diff: DiffResult | None = None
    issues: list[ValidationIssue] = Field(default_factory=list)
    ops_count: int = 0
    preview_spec: ArchitectureSpec | None = None


class ChatResponse(BaseModel):
    """Refinement chat response payload."""

    model_config = ConfigDict(extra="ignore")

    message_id: str
    reply: str
    patch: PatchSummary | None = None


# LLM-facing schemas (strictly unconstrained: NO min/max/pattern on fields)
class RefinementLLMOutput(BaseModel):
    """Raw structured output expected from Gemini refinement task."""

    model_config = ConfigDict(extra="ignore")

    reply: str
    patch: Patch | None = None


class SuggestionItem(BaseModel):
    """Single suggested architectural improvement from Gemini."""

    model_config = ConfigDict(extra="ignore")

    title: str
    reason: str
    patch: Patch


class SuggestionsLLMOutput(BaseModel):
    """Raw structured output expected from Gemini suggestions task."""

    model_config = ConfigDict(extra="ignore")

    suggestions: list[SuggestionItem] = Field(default_factory=list)


class SuggestionItemResponse(BaseModel):
    """Single validated suggestion exposed to the client."""

    model_config = ConfigDict(extra="ignore")

    patch_id: str
    title: str
    reason: str
    status: PatchStatus
    diff: DiffResult | None = None
    preview_spec: ArchitectureSpec | None = None
    issues: list[ValidationIssue] = Field(default_factory=list)


class SuggestionsResponse(BaseModel):
    """Response payload returning valid suggestions and discarded count."""

    model_config = ConfigDict(extra="ignore")

    suggestions: list[SuggestionItemResponse]
    discarded_count: int
    discarded_issue_codes: list[list[str]] = Field(default_factory=list)


class AcceptPatchRequest(BaseModel):
    """Accept patch request body."""

    model_config = ConfigDict(extra="forbid")

    confirm_drop: bool = False


class RejectPatchResponse(BaseModel):
    """Reject patch response body."""

    model_config = ConfigDict(extra="ignore")

    id: str
    status: str = "rejected"


class RestoreRequest(BaseModel):
    """Restore target version request body."""

    model_config = ConfigDict(extra="forbid")

    version_no: int = Field(ge=1)


class ChatMessageItem(BaseModel):
    """Individual chat message item in conversation history."""

    model_config = ConfigDict(extra="ignore")

    id: str
    role: str
    text: str
    created_at: str


class MessagesResponse(BaseModel):
    """List of all chat messages for a design."""

    model_config = ConfigDict(extra="ignore")

    messages: list[ChatMessageItem]


class RefinedDesignResponse(BaseModel):
    """Architecture design representation returned by refinement operations."""

    model_config = ConfigDict(extra="ignore")

    id: str
    intake_session_id: str
    current_version: int
    brief: RequirementBrief
    spec: ArchitectureSpec
    warnings: list[str] = Field(default_factory=list)
    flow_order: list[str]
    prompt_version: str
    explanation: dict[str, Any] | None = None


class VersionSummaryItem(BaseModel):
    """Summary item for a design version in the version list."""

    model_config = ConfigDict(extra="ignore")

    version_no: int
    created_at: str
    change_note: str | None = None


class VersionsResponse(BaseModel):
    """List of all design versions for a design, newest first."""

    model_config = ConfigDict(extra="ignore")

    versions: list[VersionSummaryItem]
