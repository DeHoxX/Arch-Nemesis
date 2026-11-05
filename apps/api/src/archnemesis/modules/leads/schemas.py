"""Pydantic schemas for prospective client leads and admin review."""

from typing import Any

from email_validator import EmailNotValidError, validate_email
from pydantic import BaseModel, ConfigDict, Field, field_validator

from archnemesis.modules.validation.models import ArchitectureSpec
from archnemesis.shared.brief import RequirementBrief

CONSENT_TEXT_VERSION = "v1"


class CreateLeadRequest(BaseModel):
    """Payload submitted by a visitor when requesting team follow-up."""

    model_config = ConfigDict(extra="forbid")

    design_id: str = Field(min_length=1, max_length=64)
    version_no: int = Field(ge=1)
    name: str
    email: str
    note: str | None = None
    website: str | None = Field(default=None, max_length=200)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Name cannot be empty.")
        if len(cleaned) > 100:
            raise ValueError("Name cannot exceed 100 characters.")
        return cleaned

    @field_validator("email")
    @classmethod
    def validate_email_address(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Email cannot be empty.")
        if len(cleaned) > 254:
            raise ValueError("Email cannot exceed 254 characters.")
        try:
            validated = validate_email(cleaned, check_deliverability=False)
            return str(validated.normalized)
        except EmailNotValidError as exc:
            raise ValueError("Invalid email address format.") from exc

    @field_validator("note")
    @classmethod
    def validate_note(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            return None
        if len(cleaned) > 500:
            raise ValueError("Note cannot exceed 500 characters.")
        return cleaned


class CreateLeadResponse(BaseModel):
    """Uniform response returned upon receiving a lead."""

    model_config = ConfigDict(extra="forbid")

    status: str = "received"


class AdminLeadItem(BaseModel):
    """Lead summary entry returned to authenticated team members."""

    model_config = ConfigDict(extra="forbid")

    id: str
    created_at: str
    name: str
    email: str
    note: str | None
    design_id: str
    version_no: int


class AdminDesignVersionResponse(BaseModel):
    """Design version data returned for admin inspection of a lead's design."""

    model_config = ConfigDict(extra="forbid")

    brief: RequirementBrief
    spec: ArchitectureSpec
    warnings: list[str]
    flow_order: list[str]
    explanation: dict[str, Any] | None = None
