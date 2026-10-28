"""Pydantic schemas for the designs API."""

from pydantic import BaseModel, ConfigDict

from archnemesis.modules.validation.models import ArchitectureSpec


class CreateDesignRequest(BaseModel):
    """Payload to initiate architecture design generation."""

    model_config = ConfigDict(extra="ignore")

    session_id: str


class DesignResponse(BaseModel):
    """Detailed response for a generated system architecture design."""

    model_config = ConfigDict(extra="ignore")

    id: str
    intake_session_id: str
    current_version: int
    spec: ArchitectureSpec
    flow_order: list[str]
    prompt_version: str
