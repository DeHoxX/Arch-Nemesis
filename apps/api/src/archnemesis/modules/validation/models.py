"""Pydantic models, issue definitions, and limits for ArchitectureSpec validation."""

from dataclasses import dataclass
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

DataLabel = Annotated[str, Field(max_length=120)]


@dataclass(frozen=True)
class Limits:
    """Configurable limits passed into validation functions."""

    max_nodes: int = 15
    max_edges: int = 40


class NodeSpec(BaseModel):
    """Specification of an individual architectural node."""

    model_config = ConfigDict(extra="ignore")

    id: str = Field(pattern=r"^[a-z][a-z0-9_]{1,40}$")
    name: str = Field(max_length=60)
    type: str = Field(max_length=40)
    role: str = Field(max_length=300)
    inputs: list[DataLabel] = Field(default_factory=list, max_length=8)
    outputs: list[DataLabel] = Field(default_factory=list, max_length=8)
    tech_options: list[str] = Field(default_factory=list, max_length=5)
    needs_model: bool = False


class EdgeSpec(BaseModel):
    """Directed edge between two nodes representing communication or dataflow."""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    from_node: str = Field(alias="from")
    to: str
    flows: str = Field(max_length=200)


class ConstraintSpec(BaseModel):
    """A verifiable constraint rule over the architecture diagram."""

    model_config = ConfigDict(extra="ignore")

    id: str
    text: str
    kind: str  # Plain str to emit E_UNKNOWN_CONSTRAINT_KIND gracefully
    node_id: str | None = None
    a: str | None = None
    b: str | None = None
    covers: list[str] = Field(default_factory=list)


class ArchitectureSpec(BaseModel):
    """Complete specification of a generated system architecture."""

    model_config = ConfigDict(extra="ignore")

    nodes: list[NodeSpec] = Field(default_factory=list)
    edges: list[EdgeSpec] = Field(default_factory=list)
    constraints: list[ConstraintSpec] = Field(default_factory=list)
    entry_ids: list[str] = Field(default_factory=list)
    exit_ids: list[str] = Field(default_factory=list)


@dataclass(frozen=True)
class ValidationIssue:
    """A single diagnostic issue (error or warning) discovered during validation."""

    code: str
    severity: Literal["error", "warning"]
    message: str
    ids: list[str]


class ValidationResult:
    """Consolidated outcome of running the validation pipeline on an ArchitectureSpec."""

    def __init__(
        self,
        errors: list[ValidationIssue] | None = None,
        warnings: list[ValidationIssue] | None = None,
        skipped: list[str] | None = None,
    ) -> None:
        self.errors: list[ValidationIssue] = errors or []
        self.warnings: list[ValidationIssue] = warnings or []
        self.skipped: list[str] = skipped or []

    @property
    def ok(self) -> bool:
        """True if and only if there are zero blocking validation errors."""
        return len(self.errors) == 0
