"""Pure patch application, difference computation, and change description for ArchitectureSpec.

All limits (patch size ceilings, string lengths, node id regex patterns) are verified
in code or by downstream validate(), keeping LLM-facing schemas unconstrained to avoid
Gemini 400 INVALID_ARGUMENT errors.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from archnemesis.modules.validation.models import (
    ArchitectureSpec,
    ConstraintSpec,
    EdgeSpec,
    Limits,
    NodeSpec,
    ValidationIssue,
)
from archnemesis.modules.validation.validate import validate

OpKind = Literal[
    "add_node",
    "remove_node",
    "edit_node",
    "add_edge",
    "remove_edge",
    "add_constraint",
    "edit_constraint",
    "remove_constraint",
    "set_entry_exit",
]

PatchStatus = Literal[
    "proposed",
    "blocked",
    "needs_confirmation",
    "accepted",
    "rejected",
    "superseded",
    "discarded",
]

DEFAULT_MAX_PATCH_OPS = 20


class NodePatchSpec(BaseModel):
    """Node specification in patch operations (unconstrained types for LLM)."""

    model_config = ConfigDict(extra="ignore")

    id: str
    name: str
    type: str
    role: str
    inputs: list[str] = Field(default_factory=list)
    outputs: list[str] = Field(default_factory=list)
    tech_options: list[str] = Field(default_factory=list)
    needs_model: bool = False
    ai_role: Literal["none", "model", "agent"] = "none"
    tools: list[str] = Field(default_factory=list)


class EdgePatchSpec(BaseModel):
    """Edge specification in patch operations (unconstrained types for LLM)."""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    from_node: str = Field(alias="from")
    to: str
    flows: str
    condition: str | None = None


class ConstraintPatchSpec(BaseModel):
    """Constraint specification in patch operations (unconstrained types for LLM)."""

    model_config = ConfigDict(extra="ignore")

    id: str
    text: str
    kind: str
    node_id: str | None = None
    a: str | None = None
    b: str | None = None
    covers: list[str] = Field(default_factory=list)


class Changes(BaseModel):
    """Flat set of optional change fields matching refine_G."""

    model_config = ConfigDict(extra="ignore")

    name: str | None = None
    type: str | None = None
    role: str | None = None
    inputs: list[str] | None = None
    outputs: list[str] | None = None
    tech_options: list[str] | None = None
    needs_model: bool | None = None
    ai_role: Literal["none", "model", "agent"] | None = None
    tools: list[str] | None = None
    flows: str | None = None
    condition: str | None = None
    text: str | None = None
    node_id: str | None = None
    a: str | None = None
    b: str | None = None
    covers: list[str] | None = None


class Op(BaseModel):
    """Single architecture graph mutation operation."""

    model_config = ConfigDict(extra="ignore")

    op: OpKind
    node: NodePatchSpec | None = None
    node_id: str | None = None
    edge: EdgePatchSpec | None = None
    from_id: str | None = None
    to_id: str | None = None
    constraint: ConstraintPatchSpec | None = None
    constraint_id: str | None = None
    changes: Changes | None = None
    entry_ids: list[str] | None = None
    exit_ids: list[str] | None = None


class Patch(BaseModel):
    """Collection of operations to mutate an ArchitectureSpec."""

    model_config = ConfigDict(extra="ignore")

    ops: list[Op] = Field(default_factory=list)


class NodeChange(BaseModel):
    """Field-level change tracking for a modified node."""

    model_config = ConfigDict(extra="ignore")

    id: str
    changed_fields: list[str]


class EdgeDiff(BaseModel):
    """Added or removed edge descriptor."""

    model_config = ConfigDict(extra="ignore")

    from_node: str
    to: str
    flows: str = ""
    condition: str | None = None


class EdgeChange(BaseModel):
    """Field-level change tracking for a modified edge."""

    model_config = ConfigDict(extra="ignore")

    from_node: str
    to: str
    changed_fields: list[str]


class ConstraintChange(BaseModel):
    """Field-level change tracking for a modified constraint."""

    model_config = ConfigDict(extra="ignore")

    id: str
    changed_fields: list[str]


class DiffResult(BaseModel):
    """Deterministic structural diff between two ArchitectureSpecs."""

    model_config = ConfigDict(extra="ignore")

    added_nodes: list[str]
    removed_nodes: list[str]
    changed_nodes: list[NodeChange]
    added_edges: list[EdgeDiff]
    removed_edges: list[EdgeDiff]
    changed_edges: list[EdgeChange]
    added_constraints: list[str]
    removed_constraints: list[str]
    changed_constraints: list[ConstraintChange]
    entry_changed: bool
    exit_changed: bool


class PatchResult(BaseModel):
    """Result of attempting to apply a Patch to an ArchitectureSpec."""

    model_config = ConfigDict(extra="ignore")

    ok: bool
    status: PatchStatus
    spec: ArchitectureSpec | None = None
    diff: DiffResult | None = None
    issues: list[ValidationIssue] = Field(default_factory=list)
    uncovered_brief_ids: list[str] = Field(default_factory=list)


def compute_diff(old: ArchitectureSpec, new: ArchitectureSpec) -> DiffResult:
    """Compute deterministic structural diff between two specs, ordered by IDs."""
    old_nodes = {n.id: n for n in old.nodes}
    new_nodes = {n.id: n for n in new.nodes}

    added_nodes = sorted([nid for nid in new_nodes if nid not in old_nodes])
    removed_nodes = sorted([nid for nid in old_nodes if nid not in new_nodes])
    changed_nodes: list[NodeChange] = []

    for nid in sorted(set(old_nodes).intersection(new_nodes)):
        old_n = old_nodes[nid]
        new_n = new_nodes[nid]
        c_fields: list[str] = []
        for field_name in (
            "ai_role",
            "inputs",
            "name",
            "needs_model",
            "outputs",
            "role",
            "tech_options",
            "tools",
            "type",
        ):
            if getattr(old_n, field_name) != getattr(new_n, field_name):
                c_fields.append(field_name)
        if c_fields:
            changed_nodes.append(NodeChange(id=nid, changed_fields=sorted(c_fields)))

    old_edges = {(e.from_node, e.to): e for e in old.edges}
    new_edges = {(e.from_node, e.to): e for e in new.edges}

    added_edges = [
        EdgeDiff(from_node=e.from_node, to=e.to, flows=e.flows, condition=e.condition)
        for (f, t), e in sorted(new_edges.items(), key=lambda item: item[0])
        if (f, t) not in old_edges
    ]
    removed_edges = [
        EdgeDiff(from_node=e.from_node, to=e.to, flows=e.flows, condition=e.condition)
        for (f, t), e in sorted(old_edges.items(), key=lambda item: item[0])
        if (f, t) not in new_edges
    ]
    changed_edges: list[EdgeChange] = []
    for pair in sorted(set(old_edges).intersection(new_edges)):
        old_e = old_edges[pair]
        new_e = new_edges[pair]
        e_fields: list[str] = []
        for field_name in ("condition", "flows"):
            if getattr(old_e, field_name) != getattr(new_e, field_name):
                e_fields.append(field_name)
        if e_fields:
            changed_edges.append(
                EdgeChange(from_node=pair[0], to=pair[1], changed_fields=sorted(e_fields))
            )

    old_constraints = {c.id: c for c in old.constraints}
    new_constraints = {c.id: c for c in new.constraints}

    added_constraints = sorted([cid for cid in new_constraints if cid not in old_constraints])
    removed_constraints = sorted([cid for cid in old_constraints if cid not in new_constraints])
    changed_constraints: list[ConstraintChange] = []

    for cid in sorted(set(old_constraints).intersection(new_constraints)):
        old_c = old_constraints[cid]
        new_c = new_constraints[cid]
        c_fields = []
        for field_name in ("a", "b", "covers", "kind", "node_id", "text"):
            if getattr(old_c, field_name) != getattr(new_c, field_name):
                c_fields.append(field_name)
        if c_fields:
            changed_constraints.append(ConstraintChange(id=cid, changed_fields=sorted(c_fields)))

    entry_changed = sorted(old.entry_ids) != sorted(new.entry_ids)
    exit_changed = sorted(old.exit_ids) != sorted(new.exit_ids)

    return DiffResult(
        added_nodes=added_nodes,
        removed_nodes=removed_nodes,
        changed_nodes=changed_nodes,
        added_edges=added_edges,
        removed_edges=removed_edges,
        changed_edges=changed_edges,
        added_constraints=added_constraints,
        removed_constraints=removed_constraints,
        changed_constraints=changed_constraints,
        entry_changed=entry_changed,
        exit_changed=exit_changed,
    )


def describe_diff(diff: DiffResult) -> str:
    """Summarize diff into a human-readable change note <= 200 characters."""
    parts: list[str] = []

    for nid in diff.added_nodes:
        parts.append(f"Added node {nid}")
    for nid in diff.removed_nodes:
        parts.append(f"Removed node {nid}")
    for nc in diff.changed_nodes:
        parts.append(f"Edited node {nc.id}")

    for e in diff.added_edges:
        parts.append(f"Added edge {e.from_node} > {e.to}")
    for e in diff.removed_edges:
        parts.append(f"Removed edge {e.from_node} > {e.to}")
    for ec in diff.changed_edges:
        parts.append(f"Edited edge {ec.from_node} > {ec.to}")

    for cid in diff.added_constraints:
        parts.append(f"Added constraint {cid}")
    for cid in diff.removed_constraints:
        parts.append(f"Removed constraint {cid}")
    for cc in diff.changed_constraints:
        parts.append(f"Edited constraint {cc.id}")

    if diff.entry_changed:
        parts.append("Updated entry nodes")
    if diff.exit_changed:
        parts.append("Updated exit nodes")

    if not parts:
        return "No changes."

    note = "; ".join(parts) + "."
    if len(note) > 200:
        note = note[:200]
    return note


def _format_pydantic_error(exc: ValidationError) -> ValidationIssue:
    """Format Pydantic schema validation error into an E_SCHEMA issue."""
    details: list[str] = []
    for err in exc.errors():
        loc = ".".join(str(elem) for elem in err["loc"])
        msg = err["msg"]
        details.append(f"{loc}: {msg}")
        if len(details) >= 10:
            break
    detail_str = "; ".join(details)
    return ValidationIssue(
        code="E_SCHEMA",
        severity="error",
        message=f"The patched design is not in the required format: {detail_str}.",
        ids=[],
    )


def apply_patch(
    spec: ArchitectureSpec,
    patch: Patch,
    brief_constraints: dict[str, str],
    limits: Limits,
    dropped_brief_ids: frozenset[str] = frozenset(),
    max_patch_ops: int = DEFAULT_MAX_PATCH_OPS,
) -> PatchResult:
    """Apply ordered patch operations to a deep copy of spec and validate result.

    Does NOT use code repair. Enforces operational patch limits (P_EMPTY_PATCH,
    P_TOO_MANY_OPS) and op validation rules (P_MISSING_FIELD, P_UNKNOWN_NODE,
    P_UNKNOWN_EDGE, P_UNKNOWN_CONSTRAINT, P_DUPLICATE_ID).
    """
    if not patch.ops:
        return PatchResult(
            ok=False,
            status="blocked",
            issues=[
                ValidationIssue(
                    code="P_EMPTY_PATCH",
                    severity="error",
                    message="Patch contains zero operations.",
                    ids=[],
                )
            ],
        )

    if len(patch.ops) > max_patch_ops:
        return PatchResult(
            ok=False,
            status="blocked",
            issues=[
                ValidationIssue(
                    code="P_TOO_MANY_OPS",
                    severity="error",
                    message=(
                        f"Patch contains {len(patch.ops)} operations, exceeding limit of {max_patch_ops}."
                    ),
                    ids=[],
                )
            ],
        )

    spec_copy = spec.model_copy(deep=True)
    removed_constraint_ids: set[str] = set()

    for op in patch.ops:
        if op.op == "add_node":
            if op.node is None:
                return PatchResult(
                    ok=False,
                    status="blocked",
                    issues=[
                        ValidationIssue(
                            code="P_MISSING_FIELD",
                            severity="error",
                            message="Operation 'add_node' requires 'node'.",
                            ids=["add_node"],
                        )
                    ],
                )
            if any(n.id == op.node.id for n in spec_copy.nodes):
                return PatchResult(
                    ok=False,
                    status="blocked",
                    issues=[
                        ValidationIssue(
                            code="P_DUPLICATE_ID",
                            severity="error",
                            message=f"Node '{op.node.id}' already exists.",
                            ids=[op.node.id],
                        )
                    ],
                )
            spec_copy.nodes.append(NodeSpec.model_construct(**op.node.model_dump()))

        elif op.op == "remove_node":
            if not op.node_id:
                return PatchResult(
                    ok=False,
                    status="blocked",
                    issues=[
                        ValidationIssue(
                            code="P_MISSING_FIELD",
                            severity="error",
                            message="Operation 'remove_node' requires 'node_id'.",
                            ids=["remove_node"],
                        )
                    ],
                )
            if not any(n.id == op.node_id for n in spec_copy.nodes):
                return PatchResult(
                    ok=False,
                    status="blocked",
                    issues=[
                        ValidationIssue(
                            code="P_UNKNOWN_NODE",
                            severity="error",
                            message=f"Node '{op.node_id}' does not exist.",
                            ids=[op.node_id],
                        )
                    ],
                )
            # Never cascade deletion of edges, entries, or exits; leftover references fail validation
            spec_copy.nodes = [n for n in spec_copy.nodes if n.id != op.node_id]

        elif op.op == "edit_node":
            if not op.node_id:
                return PatchResult(
                    ok=False,
                    status="blocked",
                    issues=[
                        ValidationIssue(
                            code="P_MISSING_FIELD",
                            severity="error",
                            message="Operation 'edit_node' requires 'node_id'.",
                            ids=["edit_node"],
                        )
                    ],
                )
            if op.changes is None:
                return PatchResult(
                    ok=False,
                    status="blocked",
                    issues=[
                        ValidationIssue(
                            code="P_MISSING_FIELD",
                            severity="error",
                            message="Operation 'edit_node' requires 'changes'.",
                            ids=["edit_node"],
                        )
                    ],
                )
            matched_nodes = [n for n in spec_copy.nodes if n.id == op.node_id]
            if not matched_nodes:
                return PatchResult(
                    ok=False,
                    status="blocked",
                    issues=[
                        ValidationIssue(
                            code="P_UNKNOWN_NODE",
                            severity="error",
                            message=f"Node '{op.node_id}' does not exist.",
                            ids=[op.node_id],
                        )
                    ],
                )
            node_to_edit = matched_nodes[0]
            # Node ID can never be edited
            for attr in (
                "name",
                "type",
                "role",
                "inputs",
                "outputs",
                "tech_options",
                "needs_model",
                "ai_role",
                "tools",
            ):
                val = getattr(op.changes, attr)
                if val is not None:
                    setattr(node_to_edit, attr, val)

        elif op.op == "add_edge":
            if op.edge is None:
                return PatchResult(
                    ok=False,
                    status="blocked",
                    issues=[
                        ValidationIssue(
                            code="P_MISSING_FIELD",
                            severity="error",
                            message="Operation 'add_edge' requires 'edge'.",
                            ids=["add_edge"],
                        )
                    ],
                )
            if any(
                e.from_node == op.edge.from_node and e.to == op.edge.to for e in spec_copy.edges
            ):
                return PatchResult(
                    ok=False,
                    status="blocked",
                    issues=[
                        ValidationIssue(
                            code="P_DUPLICATE_ID",
                            severity="error",
                            message=f"Edge from '{op.edge.from_node}' to '{op.edge.to}' already exists.",
                            ids=[op.edge.from_node, op.edge.to],
                        )
                    ],
                )
            spec_copy.edges.append(
                EdgeSpec.model_construct(
                    from_node=op.edge.from_node,
                    to=op.edge.to,
                    flows=op.edge.flows,
                    condition=op.edge.condition,
                )
            )

        elif op.op == "remove_edge":
            if not op.from_id or not op.to_id:
                return PatchResult(
                    ok=False,
                    status="blocked",
                    issues=[
                        ValidationIssue(
                            code="P_MISSING_FIELD",
                            severity="error",
                            message="Operation 'remove_edge' requires 'from_id' and 'to_id'.",
                            ids=["remove_edge"],
                        )
                    ],
                )
            if not any(e.from_node == op.from_id and e.to == op.to_id for e in spec_copy.edges):
                return PatchResult(
                    ok=False,
                    status="blocked",
                    issues=[
                        ValidationIssue(
                            code="P_UNKNOWN_EDGE",
                            severity="error",
                            message=f"Edge from '{op.from_id}' to '{op.to_id}' does not exist.",
                            ids=[op.from_id, op.to_id],
                        )
                    ],
                )
            spec_copy.edges = [
                e for e in spec_copy.edges if not (e.from_node == op.from_id and e.to == op.to_id)
            ]

        elif op.op == "add_constraint":
            if op.constraint is None:
                return PatchResult(
                    ok=False,
                    status="blocked",
                    issues=[
                        ValidationIssue(
                            code="P_MISSING_FIELD",
                            severity="error",
                            message="Operation 'add_constraint' requires 'constraint'.",
                            ids=["add_constraint"],
                        )
                    ],
                )
            if any(c.id == op.constraint.id for c in spec_copy.constraints):
                return PatchResult(
                    ok=False,
                    status="blocked",
                    issues=[
                        ValidationIssue(
                            code="P_DUPLICATE_ID",
                            severity="error",
                            message=f"Constraint '{op.constraint.id}' already exists.",
                            ids=[op.constraint.id],
                        )
                    ],
                )
            spec_copy.constraints.append(
                ConstraintSpec.model_construct(
                    id=op.constraint.id,
                    text=op.constraint.text,
                    kind=op.constraint.kind,
                    node_id=op.constraint.node_id,
                    a=op.constraint.a,
                    b=op.constraint.b,
                    covers=list(op.constraint.covers),
                )
            )

        elif op.op == "remove_constraint":
            if not op.constraint_id:
                return PatchResult(
                    ok=False,
                    status="blocked",
                    issues=[
                        ValidationIssue(
                            code="P_MISSING_FIELD",
                            severity="error",
                            message="Operation 'remove_constraint' requires 'constraint_id'.",
                            ids=["remove_constraint"],
                        )
                    ],
                )
            if not any(c.id == op.constraint_id for c in spec_copy.constraints):
                return PatchResult(
                    ok=False,
                    status="blocked",
                    issues=[
                        ValidationIssue(
                            code="P_UNKNOWN_CONSTRAINT",
                            severity="error",
                            message=f"Constraint '{op.constraint_id}' does not exist.",
                            ids=[op.constraint_id],
                        )
                    ],
                )
            removed_constraint_ids.add(op.constraint_id)
            spec_copy.constraints = [c for c in spec_copy.constraints if c.id != op.constraint_id]

        elif op.op == "edit_constraint":
            if not op.constraint_id:
                return PatchResult(
                    ok=False,
                    status="blocked",
                    issues=[
                        ValidationIssue(
                            code="P_MISSING_FIELD",
                            severity="error",
                            message="Operation 'edit_constraint' requires 'constraint_id'.",
                            ids=["edit_constraint"],
                        )
                    ],
                )
            if op.changes is None:
                return PatchResult(
                    ok=False,
                    status="blocked",
                    issues=[
                        ValidationIssue(
                            code="P_MISSING_FIELD",
                            severity="error",
                            message="Operation 'edit_constraint' requires 'changes'.",
                            ids=["edit_constraint"],
                        )
                    ],
                )
            matched_cs = [c for c in spec_copy.constraints if c.id == op.constraint_id]
            if not matched_cs:
                return PatchResult(
                    ok=False,
                    status="blocked",
                    issues=[
                        ValidationIssue(
                            code="P_UNKNOWN_CONSTRAINT",
                            severity="error",
                            message=f"Constraint '{op.constraint_id}' does not exist.",
                            ids=[op.constraint_id],
                        )
                    ],
                )
            c_to_edit = matched_cs[0]
            # Constraint kind and ID can never be edited
            for attr in ("text", "node_id", "a", "b", "covers"):
                val = getattr(op.changes, attr)
                if val is not None:
                    setattr(c_to_edit, attr, val)

        elif op.op == "set_entry_exit":
            if op.entry_ids is None and op.exit_ids is None:
                return PatchResult(
                    ok=False,
                    status="blocked",
                    issues=[
                        ValidationIssue(
                            code="P_MISSING_FIELD",
                            severity="error",
                            message="Operation 'set_entry_exit' requires 'entry_ids' or 'exit_ids'.",
                            ids=["set_entry_exit"],
                        )
                    ],
                )
            if op.entry_ids is not None:
                spec_copy.entry_ids = list(op.entry_ids)
            if op.exit_ids is not None:
                spec_copy.exit_ids = list(op.exit_ids)

    # Validate full schema on resulting spec (node id patterns, field length ceilings)
    try:
        validated_spec = ArchitectureSpec.model_validate(spec_copy.model_dump(by_alias=True))
    except ValidationError as exc:
        schema_issue = _format_pydantic_error(exc)
        return PatchResult(
            ok=False,
            status="blocked",
            spec=spec_copy,
            diff=compute_diff(spec, spec_copy),
            issues=[schema_issue],
        )

    diff = compute_diff(spec, validated_spec)

    # Brief constraints evaluation excluding explicitly dropped requirements
    active_brief_constraints = {
        k: v for k, v in brief_constraints.items() if k not in dropped_brief_ids
    }

    val_result = validate(
        spec=validated_spec,
        brief_constraints=active_brief_constraints,
        limits=limits,
    )

    if val_result.ok:
        return PatchResult(
            ok=True,
            status="proposed",
            spec=validated_spec,
            diff=diff,
            issues=val_result.warnings,
        )

    # Check for needs_confirmation status
    all_uncovered = all(err.code == "E_BRIEF_CONSTRAINT_UNCOVERED" for err in val_result.errors)
    uncovered_ids = [bid for err in val_result.errors for bid in err.ids]

    def _was_covered_only_by_removed(bid: str) -> bool:
        covering_in_old = [c.id for c in spec.constraints if bid in c.covers]
        if not covering_in_old:
            return False
        return all(cid in removed_constraint_ids for cid in covering_in_old)

    if (
        all_uncovered
        and uncovered_ids
        and all(_was_covered_only_by_removed(bid) for bid in uncovered_ids)
    ):
        return PatchResult(
            ok=False,
            status="needs_confirmation",
            spec=validated_spec,
            diff=diff,
            issues=val_result.errors + val_result.warnings,
            uncovered_brief_ids=sorted(set(uncovered_ids)),
        )

    return PatchResult(
        ok=False,
        status="blocked",
        spec=validated_spec,
        diff=diff,
        issues=val_result.errors + val_result.warnings,
    )
