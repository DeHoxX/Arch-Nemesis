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
from archnemesis.modules.validation.ordering import (
    OTHER_PARTS_LAYER,
    order_layers,
    order_nodes,
)
from archnemesis.modules.validation.patch import (
    Changes,
    DiffResult,
    Op,
    OpKind,
    Patch,
    PatchResult,
    PatchStatus,
    apply_patch,
    compute_diff,
    describe_diff,
)
from archnemesis.modules.validation.repair import patch_constraints
from archnemesis.modules.validation.validate import parse_and_validate, validate

__all__ = [
    "OTHER_PARTS_LAYER",
    "ArchitectureSpec",
    "Changes",
    "ConstraintSpec",
    "DiffResult",
    "EdgeSpec",
    "Limits",
    "NodeSpec",
    "Op",
    "OpKind",
    "Patch",
    "PatchResult",
    "PatchStatus",
    "ValidationIssue",
    "ValidationResult",
    "apply_patch",
    "compute_diff",
    "describe_diff",
    "order_layers",
    "order_nodes",
    "parse_and_validate",
    "patch_constraints",
    "validate",
]
