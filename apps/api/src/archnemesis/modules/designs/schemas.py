"""Pydantic schemas for the designs API."""

from pydantic import BaseModel, ConfigDict, Field

from archnemesis.modules.explainer.schemas import Explanation
from archnemesis.modules.validation.models import ArchitectureSpec
from archnemesis.shared.brief import RequirementBrief


class CreateDesignRequest(BaseModel):
    """Payload to initiate architecture design generation."""

    model_config = ConfigDict(extra="ignore")

    session_id: str = Field(min_length=1, max_length=36)


class DesignResponse(BaseModel):
    """Detailed response for a generated system architecture design."""

    model_config = ConfigDict(extra="ignore")

    id: str
    intake_session_id: str
    current_version: int
    brief: RequirementBrief
    spec: ArchitectureSpec
    warnings: list[str] = Field(default_factory=list)
    flow_order: list[str]
    prompt_version: str
    explanation: Explanation | None = None
