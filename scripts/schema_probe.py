"""Schema probe script to verify ArchitectureSpec, IntakeLLMOutput, and Phase 7 Refinement schemas with Gemini.

Step 0 verification:
Runs probes in sequence or selectively via command line arguments:
python scripts/schema_probe.py [probe_name ...]

Available probes:
- spec: ArchitectureSpec (baseline generation schema)
- intake: IntakeLLMOutput (baseline intake dialogue schema)
- refine_A: RefinementLLMOutput variant A (nested change models)
- suggest_A: SuggestionsLLMOutput variant A (nested change models)
- refine_B: RefinementLLMOutput variant B (single flat changes model)
- refine_C: RefinementLLMOutput variant C (all fields unpacked into Op)
- refine_D: RefinementLLMOutput variant D (minimal Op: op + IDs only)
- refine_E: RefinementLLMOutput variant E (like B, but op is str)
- refine_D1: D + string fields (node_name, node_type, node_role, edge_flows, edge_condition, constraint_text, constraint_kind)
- refine_D2: D + needs_model (bool | None)
- refine_D3: D + list fields (inputs, outputs, tech_options, tools, covers as list[str] | None)
- refine_D4: D + ai_role (Literal["none", "model", "agent"] | None)
- refine_D5: D + constraint endpoints (constraint_a, constraint_b, constraint_node_id as str | None)
- refine_F: C without any max_length, pattern, min_length, max_length, max_items
- refine_G: B without any field constraints or array limits
- refine_H: D5 without any field constraints or array limits
- refine_I: Op with payload_json (stringified json payload) and zero constraints
- suggest_F: Suggestions probe using F-style Op without limits

Prints strictly:
<probe_name>: OK (or <probe_name>: <ErrorClass>: <message truncated to 200 chars>)

Catches all exceptions per probe, including raw google.genai errors.
Never prints API keys, model names, prompts, replies, or counts.
"""

import asyncio
import sys
from collections.abc import Callable, Coroutine
from pathlib import Path
from typing import Annotated, Any, Literal

# Add apps/api/src to sys.path so archnemesis package is importable
api_src = Path(__file__).resolve().parent.parent / "apps" / "api" / "src"
if str(api_src) not in sys.path:
    sys.path.insert(0, str(api_src))

from pydantic import BaseModel, ConfigDict, Field

from archnemesis.llm.base import LLMClient, LLMTask
from archnemesis.llm.gemini import GeminiClient
from archnemesis.modules.intake.schemas import IntakeLLMOutput
from archnemesis.modules.models.schemas import ModelTagOutput
from archnemesis.modules.validation.models import (
    ArchitectureSpec,
    ConstraintSpec,
    EdgeSpec,
    NodeSpec,
)
from archnemesis.settings import get_settings

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

# =========================================================================
# Variant A: Original nested models (node_changes, edge_changes, constraint_changes)
# =========================================================================


class NodeChangesA(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str | None = Field(default=None, max_length=60)
    type: str | None = Field(default=None, max_length=40)
    role: str | None = Field(default=None, max_length=300)
    inputs: list[Annotated[str, Field(max_length=120)]] | None = None
    outputs: list[Annotated[str, Field(max_length=120)]] | None = None
    tech_options: list[str] | None = None
    needs_model: bool | None = None
    ai_role: Literal["none", "model", "agent"] | None = None
    tools: list[Annotated[str, Field(max_length=60)]] | None = None


class EdgeChangesA(BaseModel):
    model_config = ConfigDict(extra="ignore")

    flows: str | None = Field(default=None, max_length=200)
    condition: str | None = Field(default=None, max_length=100)


class ConstraintChangesA(BaseModel):
    model_config = ConfigDict(extra="ignore")

    text: str | None = None
    node_id: str | None = None
    a: str | None = None
    b: str | None = None
    covers: list[str] | None = None


class OpA(BaseModel):
    model_config = ConfigDict(extra="ignore")

    op: OpKind
    node: NodeSpec | None = None
    node_id: str | None = None
    node_changes: NodeChangesA | None = None
    edge: EdgeSpec | None = None
    from_id: str | None = None
    to_id: str | None = None
    edge_changes: EdgeChangesA | None = None
    constraint: ConstraintSpec | None = None
    constraint_id: str | None = None
    constraint_changes: ConstraintChangesA | None = None
    entry_ids: list[str] | None = None
    exit_ids: list[str] | None = None


class PatchA(BaseModel):
    model_config = ConfigDict(extra="ignore")

    ops: list[OpA] = Field(default_factory=list, min_length=1, max_length=20)


class RefinementLLMOutputA(BaseModel):
    model_config = ConfigDict(extra="ignore")

    reply: str = Field(max_length=500)
    patch: PatchA | None = None


class SuggestionItemA(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str = Field(max_length=60)
    reason: str = Field(max_length=140)
    patch: PatchA


class SuggestionsLLMOutputA(BaseModel):
    model_config = ConfigDict(extra="ignore")

    suggestions: list[SuggestionItemA] = Field(default_factory=list, max_length=5)


# =========================================================================
# Variant B: Flat `changes` model replacing separate change models
# =========================================================================


class ChangesB(BaseModel):
    model_config = ConfigDict(extra="ignore")

    # Node fields
    name: str | None = Field(default=None, max_length=60)
    type: str | None = Field(default=None, max_length=40)
    role: str | None = Field(default=None, max_length=300)
    inputs: list[Annotated[str, Field(max_length=120)]] | None = None
    outputs: list[Annotated[str, Field(max_length=120)]] | None = None
    tech_options: list[str] | None = None
    needs_model: bool | None = None
    ai_role: Literal["none", "model", "agent"] | None = None
    tools: list[Annotated[str, Field(max_length=60)]] | None = None
    # Edge fields
    flows: str | None = Field(default=None, max_length=200)
    condition: str | None = Field(default=None, max_length=100)
    # Constraint fields
    text: str | None = None
    node_id: str | None = None
    a: str | None = None
    b: str | None = None
    covers: list[str] | None = None


class OpB(BaseModel):
    model_config = ConfigDict(extra="ignore")

    op: OpKind
    node: NodeSpec | None = None
    node_id: str | None = None
    edge: EdgeSpec | None = None
    from_id: str | None = None
    to_id: str | None = None
    constraint: ConstraintSpec | None = None
    constraint_id: str | None = None
    changes: ChangesB | None = None
    entry_ids: list[str] | None = None
    exit_ids: list[str] | None = None


class PatchB(BaseModel):
    model_config = ConfigDict(extra="ignore")

    ops: list[OpB] = Field(default_factory=list, min_length=1, max_length=20)


class RefinementLLMOutputB(BaseModel):
    model_config = ConfigDict(extra="ignore")

    reply: str = Field(max_length=500)
    patch: PatchB | None = None


# =========================================================================
# Variant C: Fully flat Op with primitive fields (no nested models at all)
# =========================================================================


class OpC(BaseModel):
    model_config = ConfigDict(extra="ignore")

    op: OpKind
    # Identifiers
    node_id: str | None = None
    from_id: str | None = None
    to_id: str | None = None
    constraint_id: str | None = None
    # Node properties
    node_name: str | None = Field(default=None, max_length=60)
    node_type: str | None = Field(default=None, max_length=40)
    node_role: str | None = Field(default=None, max_length=300)
    node_inputs: list[Annotated[str, Field(max_length=120)]] | None = None
    node_outputs: list[Annotated[str, Field(max_length=120)]] | None = None
    node_tech_options: list[str] | None = None
    node_needs_model: bool | None = None
    node_ai_role: Literal["none", "model", "agent"] | None = None
    node_tools: list[Annotated[str, Field(max_length=60)]] | None = None
    # Edge properties
    edge_flows: str | None = Field(default=None, max_length=200)
    edge_condition: str | None = Field(default=None, max_length=100)
    # Constraint properties
    constraint_text: str | None = None
    constraint_kind: str | None = None
    constraint_node_id: str | None = None
    constraint_a: str | None = None
    constraint_b: str | None = None
    constraint_covers: list[str] | None = None
    # Entry/Exit
    entry_ids: list[str] | None = None
    exit_ids: list[str] | None = None


class PatchC(BaseModel):
    model_config = ConfigDict(extra="ignore")

    ops: list[OpC] = Field(default_factory=list, min_length=1, max_length=20)


class RefinementLLMOutputC(BaseModel):
    model_config = ConfigDict(extra="ignore")

    reply: str = Field(max_length=500)
    patch: PatchC | None = None


# =========================================================================
# Variant D: Minimal Op (only op + IDs, no properties/payloads)
# =========================================================================


class OpD(BaseModel):
    model_config = ConfigDict(extra="ignore")

    op: OpKind
    node_id: str | None = None
    from_id: str | None = None
    to_id: str | None = None
    constraint_id: str | None = None
    entry_ids: list[str] | None = None
    exit_ids: list[str] | None = None


class PatchD(BaseModel):
    model_config = ConfigDict(extra="ignore")

    ops: list[OpD] = Field(default_factory=list, min_length=1, max_length=20)


class RefinementLLMOutputD(BaseModel):
    model_config = ConfigDict(extra="ignore")

    reply: str = Field(max_length=500)
    patch: PatchD | None = None


# =========================================================================
# Variant E: Like B, but Op.op is plain str instead of Literal
# =========================================================================


class OpE(BaseModel):
    model_config = ConfigDict(extra="ignore")

    op: str = Field(description="Operation kind")
    node: NodeSpec | None = None
    node_id: str | None = None
    edge: EdgeSpec | None = None
    from_id: str | None = None
    to_id: str | None = None
    constraint: ConstraintSpec | None = None
    constraint_id: str | None = None
    changes: ChangesB | None = None
    entry_ids: list[str] | None = None
    exit_ids: list[str] | None = None


class PatchE(BaseModel):
    model_config = ConfigDict(extra="ignore")

    ops: list[OpE] = Field(default_factory=list, min_length=1, max_length=20)


class RefinementLLMOutputE(BaseModel):
    model_config = ConfigDict(extra="ignore")

    reply: str = Field(max_length=500)
    patch: PatchE | None = None


# =========================================================================
# Bisection Variants (Based on D)
# =========================================================================


# D1: D + string fields
class OpD1(BaseModel):
    model_config = ConfigDict(extra="ignore")

    op: OpKind
    node_id: str | None = None
    from_id: str | None = None
    to_id: str | None = None
    constraint_id: str | None = None
    entry_ids: list[str] | None = None
    exit_ids: list[str] | None = None

    # String fields added
    node_name: str | None = None
    node_type: str | None = None
    node_role: str | None = None
    edge_flows: str | None = None
    edge_condition: str | None = None
    constraint_text: str | None = None
    constraint_kind: str | None = None


class PatchD1(BaseModel):
    model_config = ConfigDict(extra="ignore")

    ops: list[OpD1] = Field(default_factory=list, min_length=1, max_length=20)


class RefinementLLMOutputD1(BaseModel):
    model_config = ConfigDict(extra="ignore")

    reply: str = Field(max_length=500)
    patch: PatchD1 | None = None


# D2: D + needs_model (bool | None)
class OpD2(BaseModel):
    model_config = ConfigDict(extra="ignore")

    op: OpKind
    node_id: str | None = None
    from_id: str | None = None
    to_id: str | None = None
    constraint_id: str | None = None
    entry_ids: list[str] | None = None
    exit_ids: list[str] | None = None

    # Bool field added
    needs_model: bool | None = None


class PatchD2(BaseModel):
    model_config = ConfigDict(extra="ignore")

    ops: list[OpD2] = Field(default_factory=list, min_length=1, max_length=20)


class RefinementLLMOutputD2(BaseModel):
    model_config = ConfigDict(extra="ignore")

    reply: str = Field(max_length=500)
    patch: PatchD2 | None = None


# D3: D + list fields (list[str] | None)
class OpD3(BaseModel):
    model_config = ConfigDict(extra="ignore")

    op: OpKind
    node_id: str | None = None
    from_id: str | None = None
    to_id: str | None = None
    constraint_id: str | None = None
    entry_ids: list[str] | None = None
    exit_ids: list[str] | None = None

    # List fields added
    inputs: list[str] | None = None
    outputs: list[str] | None = None
    tech_options: list[str] | None = None
    tools: list[str] | None = None
    covers: list[str] | None = None


class PatchD3(BaseModel):
    model_config = ConfigDict(extra="ignore")

    ops: list[OpD3] = Field(default_factory=list, min_length=1, max_length=20)


class RefinementLLMOutputD3(BaseModel):
    model_config = ConfigDict(extra="ignore")

    reply: str = Field(max_length=500)
    patch: PatchD3 | None = None


# D4: D + ai_role (Literal["none", "model", "agent"] | None)
class OpD4(BaseModel):
    model_config = ConfigDict(extra="ignore")

    op: OpKind
    node_id: str | None = None
    from_id: str | None = None
    to_id: str | None = None
    constraint_id: str | None = None
    entry_ids: list[str] | None = None
    exit_ids: list[str] | None = None

    # Literal enum added
    ai_role: Literal["none", "model", "agent"] | None = None


class PatchD4(BaseModel):
    model_config = ConfigDict(extra="ignore")

    ops: list[OpD4] = Field(default_factory=list, min_length=1, max_length=20)


class RefinementLLMOutputD4(BaseModel):
    model_config = ConfigDict(extra="ignore")

    reply: str = Field(max_length=500)
    patch: PatchD4 | None = None


# D5: D + constraint endpoints (str | None)
class OpD5(BaseModel):
    model_config = ConfigDict(extra="ignore")

    op: OpKind
    node_id: str | None = None
    from_id: str | None = None
    to_id: str | None = None
    constraint_id: str | None = None
    entry_ids: list[str] | None = None
    exit_ids: list[str] | None = None

    # Constraint endpoint fields added
    constraint_a: str | None = None
    constraint_b: str | None = None
    constraint_node_id: str | None = None


class PatchD5(BaseModel):
    model_config = ConfigDict(extra="ignore")

    ops: list[OpD5] = Field(default_factory=list, min_length=1, max_length=20)


class RefinementLLMOutputD5(BaseModel):
    model_config = ConfigDict(extra="ignore")

    reply: str = Field(max_length=500)
    patch: PatchD5 | None = None


# (Note: D6 is skipped because the fields present in D do not carry max_length/pattern in C)


# =========================================================================
# Variant F: Fully flat Op with primitive fields, NO field or list constraints
# =========================================================================


class OpF(BaseModel):
    model_config = ConfigDict(extra="ignore")

    op: OpKind
    node_id: str | None = None
    from_id: str | None = None
    to_id: str | None = None
    constraint_id: str | None = None

    node_name: str | None = None
    node_type: str | None = None
    node_role: str | None = None
    node_inputs: list[str] | None = None
    node_outputs: list[str] | None = None
    node_tech_options: list[str] | None = None
    node_needs_model: bool | None = None
    node_ai_role: Literal["none", "model", "agent"] | None = None
    node_tools: list[str] | None = None

    edge_flows: str | None = None
    edge_condition: str | None = None

    constraint_text: str | None = None
    constraint_kind: str | None = None
    constraint_node_id: str | None = None
    constraint_a: str | None = None
    constraint_b: str | None = None
    constraint_covers: list[str] | None = None

    entry_ids: list[str] | None = None
    exit_ids: list[str] | None = None


class PatchF(BaseModel):
    model_config = ConfigDict(extra="ignore")

    ops: list[OpF] = Field(default_factory=list)


class RefinementLLMOutputF(BaseModel):
    model_config = ConfigDict(extra="ignore")

    reply: str
    patch: PatchF | None = None


class SuggestionItemF(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str
    reason: str
    patch: PatchF


class SuggestionsLLMOutputF(BaseModel):
    model_config = ConfigDict(extra="ignore")

    suggestions: list[SuggestionItemF] = Field(default_factory=list)


# =========================================================================
# Variant G: Variant B (single flat changes model), NO field or list constraints
# =========================================================================


class NodeSpecUnconstrained(BaseModel):
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


class EdgeSpecUnconstrained(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    from_node: str = Field(alias="from")
    to: str
    flows: str
    condition: str | None = None


class ConstraintSpecUnconstrained(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    text: str
    kind: str
    node_id: str | None = None
    a: str | None = None
    b: str | None = None
    covers: list[str] = Field(default_factory=list)


class ChangesG(BaseModel):
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


class OpG(BaseModel):
    model_config = ConfigDict(extra="ignore")

    op: OpKind
    node: NodeSpecUnconstrained | None = None
    node_id: str | None = None
    edge: EdgeSpecUnconstrained | None = None
    from_id: str | None = None
    to_id: str | None = None
    constraint: ConstraintSpecUnconstrained | None = None
    constraint_id: str | None = None
    changes: ChangesG | None = None
    entry_ids: list[str] | None = None
    exit_ids: list[str] | None = None


class PatchG(BaseModel):
    model_config = ConfigDict(extra="ignore")

    ops: list[OpG] = Field(default_factory=list)


class RefinementLLMOutputG(BaseModel):
    model_config = ConfigDict(extra="ignore")

    reply: str
    patch: PatchG | None = None


# =========================================================================
# Variant H: refine_D5 (D + constraint endpoints), NO field or list constraints
# =========================================================================


class OpH(BaseModel):
    model_config = ConfigDict(extra="ignore")

    op: OpKind
    node_id: str | None = None
    from_id: str | None = None
    to_id: str | None = None
    constraint_id: str | None = None
    entry_ids: list[str] | None = None
    exit_ids: list[str] | None = None

    constraint_a: str | None = None
    constraint_b: str | None = None
    constraint_node_id: str | None = None


class PatchH(BaseModel):
    model_config = ConfigDict(extra="ignore")

    ops: list[OpH] = Field(default_factory=list)


class RefinementLLMOutputH(BaseModel):
    model_config = ConfigDict(extra="ignore")

    reply: str
    patch: PatchH | None = None


# =========================================================================
# Variant I: Minimal Op + payload_json string (fallback idea, no constraints)
# =========================================================================


class OpI(BaseModel):
    model_config = ConfigDict(extra="ignore")

    op: OpKind
    node_id: str | None = None
    from_id: str | None = None
    to_id: str | None = None
    constraint_id: str | None = None
    entry_ids: list[str] | None = None
    exit_ids: list[str] | None = None
    payload_json: str | None = None


class PatchI(BaseModel):
    model_config = ConfigDict(extra="ignore")

    ops: list[OpI] = Field(default_factory=list)


class RefinementLLMOutputI(BaseModel):
    model_config = ConfigDict(extra="ignore")

    reply: str
    patch: PatchI | None = None


async def _probe_spec_layer(client: LLMClient) -> None:
    raw = await client.generate_json(
        task=LLMTask.ARCHITECT,
        system=(
            "You are an expert software architect. Output a valid ArchitectureSpec "
            "where every node has a short plain-language layer field (max 40 chars)."
        ),
        user=(
            "Design a minimal 3-node web service: an entry client, an api router, and an exit storage. "
            "Give each node a distinct scenario layer."
        ),
        schema=ArchitectureSpec,
    )
    parsed = ArchitectureSpec.model_validate(raw)
    if not any(n.layer for n in parsed.nodes):
        raise ValueError("Spec parsed, but no node returned a non-empty layer")


# =========================================================================
# Main execution loop
# =========================================================================


async def main() -> int:
    settings = get_settings()

    requested_probes = sys.argv[1:] if len(sys.argv) > 1 else None

    probe_names = [
        "spec",
        "spec_layer",
        "intake",
        "refine_A",
        "suggest_A",
        "refine_B",
        "refine_C",
        "refine_D",
        "refine_E",
        "refine_D1",
        "refine_D2",
        "refine_D3",
        "refine_D4",
        "refine_D5",
        "refine_F",
        "refine_G",
        "refine_H",
        "refine_I",
        "suggest_F",
        "models_tag",
    ]

    selected_probes = [p for p in probe_names if requested_probes is None or p in requested_probes]

    if not settings.gemini_api_key:
        for p in selected_probes:
            print(f"{p}: ValueError: GEMINI_API_KEY is not configured")
        return 1

    api_key = settings.gemini_api_key.get_secret_value()
    if not api_key:
        for p in selected_probes:
            print(f"{p}: ValueError: GEMINI_API_KEY is empty")
        return 1

    model_architect = settings.llm_model_architect
    model_intake = settings.llm_model_intake or model_architect

    if not model_architect:
        for p in selected_probes:
            print(f"{p}: ValueError: LLM_MODEL_ARCHITECT is not configured")
        return 1

    model_map = {
        LLMTask.INTAKE: model_intake,
        LLMTask.ARCHITECT: model_architect,
        LLMTask.WRITER: settings.llm_model_writer or model_architect,
        LLMTask.MODELS: settings.llm_model_models or model_architect,
    }

    client: LLMClient = GeminiClient(
        api_key=api_key,
        model_names=model_map,
        timeout_seconds=settings.llm_timeout_seconds,
    )

    exit_code = 0

    probes_dict: dict[str, Callable[[], Coroutine[Any, Any, None]]] = {
        "spec": lambda: client.generate_json(
            task=LLMTask.ARCHITECT,
            system="You are an expert software architect. Output a valid ArchitectureSpec.",
            user="Design a minimal 3-node web service: an entry client, an api router, and an exit storage.",
            schema=ArchitectureSpec,
        ),
        "spec_layer": lambda: _probe_spec_layer(client),
        "intake": lambda: client.generate_json(
            task=LLMTask.INTAKE,
            system="You are an intake analyst. Output an IntakeLLMOutput JSON object.",
            user="The user needs a customer support chatbot that answers questions from documents.",
            schema=IntakeLLMOutput,
        ),
        "refine_A": lambda: client.generate_json(
            task=LLMTask.ARCHITECT,
            system="You are an expert software architect specializing in architecture graph refinement. Output a RefinementLLMOutput JSON object.",
            user="Add an authentication guardrail service node between the ingress gateway and the agent.",
            schema=RefinementLLMOutputA,
        ),
        "suggest_A": lambda: client.generate_json(
            task=LLMTask.ARCHITECT,
            system="You are an expert software architect suggesting architectural improvements. Output a SuggestionsLLMOutput JSON object.",
            user="Suggest up to 2 concrete improvements for a web service architecture.",
            schema=SuggestionsLLMOutputA,
        ),
        "refine_B": lambda: client.generate_json(
            task=LLMTask.ARCHITECT,
            system="You are an expert software architect specializing in architecture graph refinement. Output a RefinementLLMOutput JSON object.",
            user="Add an authentication guardrail service node between the ingress gateway and the agent.",
            schema=RefinementLLMOutputB,
        ),
        "refine_C": lambda: client.generate_json(
            task=LLMTask.ARCHITECT,
            system="You are an expert software architect specializing in architecture graph refinement. Output a RefinementLLMOutput JSON object.",
            user="Add an authentication guardrail service node between the ingress gateway and the agent.",
            schema=RefinementLLMOutputC,
        ),
        "refine_D": lambda: client.generate_json(
            task=LLMTask.ARCHITECT,
            system="You are an expert software architect specializing in architecture graph refinement. Output a RefinementLLMOutput JSON object.",
            user="Add an authentication guardrail service node between the ingress gateway and the agent.",
            schema=RefinementLLMOutputD,
        ),
        "refine_E": lambda: client.generate_json(
            task=LLMTask.ARCHITECT,
            system="You are an expert software architect specializing in architecture graph refinement. Output a RefinementLLMOutput JSON object.",
            user="Add an authentication guardrail service node between the ingress gateway and the agent.",
            schema=RefinementLLMOutputE,
        ),
        "refine_D1": lambda: client.generate_json(
            task=LLMTask.ARCHITECT,
            system="You are an expert software architect specializing in architecture graph refinement. Output a RefinementLLMOutput JSON object.",
            user="Add an authentication guardrail service node between the ingress gateway and the agent.",
            schema=RefinementLLMOutputD1,
        ),
        "refine_D2": lambda: client.generate_json(
            task=LLMTask.ARCHITECT,
            system="You are an expert software architect specializing in architecture graph refinement. Output a RefinementLLMOutput JSON object.",
            user="Add an authentication guardrail service node between the ingress gateway and the agent.",
            schema=RefinementLLMOutputD2,
        ),
        "refine_D3": lambda: client.generate_json(
            task=LLMTask.ARCHITECT,
            system="You are an expert software architect specializing in architecture graph refinement. Output a RefinementLLMOutput JSON object.",
            user="Add an authentication guardrail service node between the ingress gateway and the agent.",
            schema=RefinementLLMOutputD3,
        ),
        "refine_D4": lambda: client.generate_json(
            task=LLMTask.ARCHITECT,
            system="You are an expert software architect specializing in architecture graph refinement. Output a RefinementLLMOutput JSON object.",
            user="Add an authentication guardrail service node between the ingress gateway and the agent.",
            schema=RefinementLLMOutputD4,
        ),
        "refine_D5": lambda: client.generate_json(
            task=LLMTask.ARCHITECT,
            system="You are an expert software architect specializing in architecture graph refinement. Output a RefinementLLMOutput JSON object.",
            user="Add an authentication guardrail service node between the ingress gateway and the agent.",
            schema=RefinementLLMOutputD5,
        ),
        "refine_F": lambda: client.generate_json(
            task=LLMTask.ARCHITECT,
            system="You are an expert software architect specializing in architecture graph refinement. Output a RefinementLLMOutput JSON object.",
            user="Add an authentication guardrail service node between the ingress gateway and the agent.",
            schema=RefinementLLMOutputF,
        ),
        "refine_G": lambda: client.generate_json(
            task=LLMTask.ARCHITECT,
            system="You are an expert software architect specializing in architecture graph refinement. Output a RefinementLLMOutput JSON object.",
            user="Add an authentication guardrail service node between the ingress gateway and the agent.",
            schema=RefinementLLMOutputG,
        ),
        "refine_H": lambda: client.generate_json(
            task=LLMTask.ARCHITECT,
            system="You are an expert software architect specializing in architecture graph refinement. Output a RefinementLLMOutput JSON object.",
            user="Add an authentication guardrail service node between the ingress gateway and the agent.",
            schema=RefinementLLMOutputH,
        ),
        "refine_I": lambda: client.generate_json(
            task=LLMTask.ARCHITECT,
            system="You are an expert software architect specializing in architecture graph refinement. Output a RefinementLLMOutput JSON object.",
            user="Add an authentication guardrail service node between the ingress gateway and the agent.",
            schema=RefinementLLMOutputI,
        ),
        "suggest_F": lambda: client.generate_json(
            task=LLMTask.ARCHITECT,
            system="You are an expert software architect suggesting architectural improvements. Output a SuggestionsLLMOutput JSON object.",
            user="Suggest up to 2 concrete improvements for a web service architecture.",
            schema=SuggestionsLLMOutputF,
        ),
        "models_tag": lambda: client.generate_json(
            task=LLMTask.MODELS,
            system="You are an AI system architect. Output a ModelTagOutput JSON object.",
            user="Classify the following component: OCR invoice processor.",
            schema=ModelTagOutput,
        ),
    }

    for name in selected_probes:
        coro_func = probes_dict.get(name)
        if not coro_func:
            print(f"{name}: Unknown probe name")
            continue
        try:
            await coro_func()
            print(f"{name}: OK")
        except BaseException as exc:  # noqa: BLE001
            msg = str(exc)[:200]
            print(f"{name}: {exc.__class__.__name__}: {msg}")
            exit_code = 1

    return exit_code


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
