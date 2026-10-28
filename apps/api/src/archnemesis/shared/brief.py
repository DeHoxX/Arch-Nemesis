"""RequirementBrief and supporting domain models."""

from pydantic import BaseModel, ConfigDict, Field


class BriefConstraint(BaseModel):
    """A user requirement constraint with code-assigned ID."""

    model_config = ConfigDict(extra="ignore")

    id: str
    text: str


class BriefNumber(BaseModel):
    """Numerical metric or constraint cited by the user."""

    model_config = ConfigDict(extra="ignore")

    label: str
    value: str
    unit: str


class RequirementBrief(BaseModel):
    """Validated brief capturing requirements extracted from the intake dialogue."""

    model_config = ConfigDict(extra="ignore")

    summary: str
    users: str
    data_involved: list[str] = Field(default_factory=list)
    domain_hint: str = ""
    stated_constraints: list[BriefConstraint] = Field(default_factory=list)
    unverifiable_requirements: list[str] = Field(default_factory=list)
    numbers_given: list[BriefNumber] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)
