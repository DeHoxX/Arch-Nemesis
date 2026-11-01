"""Pure validation module for ArchitectureSpec.

Exports models, issue definitions, deterministic ordering, and validation functions.
This module imports only Pydantic, NetworkX, and the Python standard library.
"""

from archnemesis.modules.validation.models import (
    ArchitectureSpec,
    ConstraintSpec,
    EdgeSpec,
    Limits,
    NodeSpec,
    ValidationIssue,
    ValidationResult,
)
from archnemesis.modules.validation.ordering import order_nodes
from archnemesis.modules.validation.repair import patch_constraints
from archnemesis.modules.validation.validate import parse_and_validate, validate

__all__ = [
    "ArchitectureSpec",
    "ConstraintSpec",
    "EdgeSpec",
    "Limits",
    "NodeSpec",
    "ValidationIssue",
    "ValidationResult",
    "order_nodes",
    "parse_and_validate",
    "patch_constraints",
    "validate",
]
