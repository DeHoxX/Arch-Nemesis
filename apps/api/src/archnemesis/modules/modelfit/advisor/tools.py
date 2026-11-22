"""Tool declarations and execution dispatcher for the ModelFit Advisor."""

import contextlib
import json
import re
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from archnemesis.modules.modelfit.catalog.service import CatalogService
from archnemesis.modules.modelfit.estimator.schemas import (
    EstimationConfig,
    HardwareKind,
    HardwareProfileInput,
    QuantizationFormat,
)
from archnemesis.modules.modelfit.hardware.schemas import EstimateRequest
from archnemesis.modules.modelfit.hardware.service import HardwareService
from archnemesis.modules.modelfit.recommend.schemas import RequirementSpec
from archnemesis.modules.modelfit.recommend.service import RecommendService


def _load_hardware_presets() -> list[dict[str, Any]]:
    preset_path = (
        Path(__file__).resolve().parent.parent / "hardware" / "seeds" / "hardware_presets.json"
    )
    if preset_path.exists():
        with open(preset_path, encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, list):
                return data
    return []


def _sanitize_hardware_name(name: str, max_length: int = 64) -> str:
    cleaned = re.sub(r"[\x00-\x1f\x7f]", "", name)
    cleaned = re.sub(r"[`*_<>\[\]]", "", cleaned)
    cleaned = " ".join(cleaned.split())
    if len(cleaned) > max_length:
        cleaned = cleaned[:max_length].rstrip()
    return cleaned or "Custom Hardware"


def _clean_hardware_query(query: str) -> str:
    ram_phrase = re.compile(r"(?i)\b\d+\s*(?:gib|gb|g)\s*(?:of\s+)?(?:system\s+)?(?:ram|memory)\b")
    return ram_phrase.sub("", query).strip()


def _extract_vram_gb(text: str) -> float | None:
    cleaned = _clean_hardware_query(text)
    m = re.search(r"(\d+(?:\.\d+)?)\s*(?:gib|gb|g)\b", cleaned, re.IGNORECASE)
    if m:
        try:
            return float(m.group(1))
        except ValueError:
            return None
    return None


def _match_hardware_profile(
    query: str,
    profiles: list[Any],
) -> tuple[HardwareProfileInput | None, list[str]]:
    assumptions: list[str] = []
    q_norm = " ".join(query.lower().split())
    explicit_gb = _extract_vram_gb(query)

    matches: list[tuple[Any, str, str, int, int]] = []
    for p in profiles:
        p_name = p.name if hasattr(p, "name") else p.get("name", "")
        p_kind = p.kind if hasattr(p, "kind") else p.get("kind", "")
        p_bytes = p.memory_bytes if hasattr(p, "memory_bytes") else p.get("memory_bytes", 0)
        p_res = (
            p.reserved_memory_bytes
            if hasattr(p, "reserved_memory_bytes")
            else p.get("reserved_memory_bytes", 0)
        )

        p_norm = " ".join(p_name.lower().split())
        p_stripped = p_norm.replace("nvidia", "").replace("geforce", "").strip()
        q_stripped = q_norm.replace("nvidia", "").replace("geforce", "").strip()

        if q_norm == p_norm or q_stripped == p_stripped:
            matches.append((p, p_name, p_kind, p_bytes, p_res))
            continue

        pattern = rf"\b{re.escape(q_stripped)}\b"
        if re.search(pattern, p_stripped):
            extra = re.sub(pattern, "", p_stripped).strip()
            if not any(v in extra.split() for v in ("ti", "super", "d", "xt", "xtx")):
                matches.append((p, p_name, p_kind, p_bytes, p_res))

    if len(matches) == 1:
        _, m_name, m_kind, m_bytes, m_res = matches[0]
        preset_gb = round(m_bytes / (1024**3))

        if explicit_gb and explicit_gb > 0 and explicit_gb != preset_gb:
            total_bytes = int(explicit_gb * (1024**3))
            safe_name = _sanitize_hardware_name(query)
            hw = HardwareProfileInput(
                name=f"{safe_name} (User-provided)",
                memory_bytes=total_bytes,
                kind=HardwareKind.GPU,
                reserved_memory_bytes=int(total_bytes * 0.05),
                is_preset=False,
            )
            assumptions.append(
                f"GPU VRAM capacity ({explicit_gb}GB) for '{safe_name}' is user-provided "
                f"(differs from standard preset {m_name} with {preset_gb}GB); 5% reserve assumed."
            )
            return hw, assumptions

        kind_val = HardwareKind.GPU
        with contextlib.suppress(ValueError):
            kind_val = HardwareKind(m_kind)
        hw = HardwareProfileInput(
            name=m_name,
            memory_bytes=m_bytes,
            kind=kind_val,
            reserved_memory_bytes=m_res,
            is_preset=True,
        )
        return hw, []

    if explicit_gb and explicit_gb > 0:
        total_bytes = int(explicit_gb * (1024**3))
        safe_name = _sanitize_hardware_name(query)
        hw = HardwareProfileInput(
            name=f"{safe_name} (User-provided)",
            memory_bytes=total_bytes,
            kind=HardwareKind.GPU,
            reserved_memory_bytes=int(total_bytes * 0.05),
            is_preset=False,
        )
        assumptions.append(
            f"GPU VRAM capacity ({explicit_gb}GB) for '{safe_name}' is user-provided "
            "with standard 5% reservation."
        )
        return hw, assumptions

    return None, []


# Pydantic argument schemas for function calling
class SearchModelsArgs(BaseModel):
    query: str = Field(description="Search terms for finding models on Hugging Face Hub.")
    limit: int = Field(default=10, ge=1, le=50, description="Maximum number of models to return.")


class GetModelDetailsArgs(BaseModel):
    repo_id: str = Field(
        description="The full repository ID on Hugging Face (e.g. 'meta-llama/Meta-Llama-3-8B')."
    )


class EstimateMemoryArgs(BaseModel):
    repo_id: str = Field(description="Hugging Face repo ID of the model.")
    hardware_name: str = Field(
        description="Target GPU or device model (e.g. 'RTX 4090', 'RTX 3060 12GB', 'Apple M3 Max 36GB')."
    )
    quantization: str = Field(
        default="q4_k_m",
        description="Target quantization format (e.g. 'q4_k_m', 'fp16', 'int8', 'q8_0').",
    )
    context_length: int = Field(
        default=8192,
        ge=512,
        le=131072,
        description="Target context window in tokens.",
    )


class ListHardwareArgs(BaseModel):
    pass


class RecommendModelsArgs(BaseModel):
    task: str | None = Field(
        default=None,
        description="Task category: 'coding', 'general', 'reasoning', 'writing'.",
    )
    hardware_name: str | None = Field(default=None, description="Target GPU or hardware name.")
    memory_budget_gb: float | None = Field(
        default=None,
        description="Memory budget in Gigabytes if GPU name is unknown.",
    )
    max_context: int = Field(default=8192, description="Context length.")
    quantization: str = Field(default="q4_k_m", description="Quantization preference.")
    license_preference: str = Field(
        default="any",
        description="License preference: 'any', 'permissive', 'open_weights'.",
    )


TOOL_DECLARATIONS = [
    {
        "name": "search_models",
        "description": "Searches for AI models in the Hugging Face Hub by keyword.",
        "parameters": SearchModelsArgs.model_json_schema(),
    },
    {
        "name": "get_model_details",
        "description": (
            "Retrieves normalized metadata, parameters, and architecture support status "
            "for a specific model repo ID."
        ),
        "parameters": GetModelDetailsArgs.model_json_schema(),
    },
    {
        "name": "estimate_memory",
        "description": (
            "Calculates exact deterministic memory breakdown (weights, KV cache, activations, "
            "headroom) and fit verdict for a model on specific hardware."
        ),
        "parameters": EstimateMemoryArgs.model_json_schema(),
    },
    {
        "name": "list_hardware",
        "description": (
            "Lists verified preset GPUs and hardware profiles with their exact VRAM capacities."
        ),
        "parameters": ListHardwareArgs.model_json_schema(),
    },
    {
        "name": "recommend_models",
        "description": (
            "Runs the deterministic recommendation engine to rank the best fitting models "
            "for a task and hardware specification."
        ),
        "parameters": RecommendModelsArgs.model_json_schema(),
    },
]


async def execute_tool(
    name: str,
    args: dict[str, Any],
    session: AsyncSession,
) -> dict[str, Any]:
    """Dispatches tool execution to the underlying typed domain service."""
    try:
        catalog_service = CatalogService()
        hardware_service = HardwareService()
        recommend_service = RecommendService(catalog_service)

        if name == "search_models":
            validated_search = SearchModelsArgs.model_validate(args)
            res = await catalog_service.list_models(
                session=session,
                search=validated_search.query,
                limit=validated_search.limit,
            )
            return {
                "items": [
                    {
                        "id": m.id,
                        "author": m.author,
                        "model_name": m.model_name,
                        "pipeline_tag": m.pipeline_tag,
                        "downloads": m.downloads,
                        "likes": m.likes,
                        "is_supported": m.is_supported,
                        "license": m.license,
                    }
                    for m in res.items
                ]
            }

        elif name == "get_model_details":
            validated_detail = GetModelDetailsArgs.model_validate(args)
            detail = await catalog_service.get_model_detail(session, validated_detail.repo_id)
            total_p = detail.normalized_model.total_params if detail.normalized_model else None
            return {
                "id": detail.id,
                "model_name": detail.model_name,
                "author": detail.author,
                "pipeline_tag": detail.pipeline_tag,
                "is_supported": detail.is_supported,
                "support_status": detail.support_status.value,
                "support_reason_code": detail.support_reason_code,
                "support_reason_message": detail.support_reason_message,
                "total_params": total_p,
                "license": detail.license,
            }

        elif name == "list_hardware":
            hw_list = await hardware_service.list_profiles(session)
            return {
                "profiles": [
                    {
                        "name": h.name,
                        "kind": h.kind,
                        "memory_gb": round(h.memory_bytes / (1024**3), 2),
                        "memory_bytes": h.memory_bytes,
                    }
                    for h in hw_list
                ]
            }

        elif name == "estimate_memory":
            validated_est = EstimateMemoryArgs.model_validate(args)
            est_hw_list: list[Any] = await hardware_service.list_profiles(session)
            if not est_hw_list:
                est_hw_list = _load_hardware_presets()

            hw_input, assumptions = _match_hardware_profile(
                validated_est.hardware_name, list(est_hw_list)
            )
            if not hw_input:
                return {
                    "status": "error",
                    "error_type": "clarification_required",
                    "retryable": False,
                    "action_required": "ask_user_clarification",
                    "missing_fields": ["hardware"],
                    "message": (
                        f"Could not unambiguously match hardware '{validated_est.hardware_name}' "
                        "to a known profile. Please specify an exact GPU model "
                        "(e.g. 'RTX 4090') or explicit VRAM/Unified Memory in GB."
                    ),
                }

            quant_fmt = QuantizationFormat.Q4_K_M
            with contextlib.suppress(ValueError):
                quant_fmt = QuantizationFormat(validated_est.quantization)

            cfg = EstimationConfig(
                quantization=quant_fmt,
                context_length=validated_est.context_length,
                batch_size=1,
            )
            req = EstimateRequest(
                repo_id=validated_est.repo_id,
                hardware=hw_input,
                config=cfg,
            )
            est_res = await hardware_service.estimate_for_request(session, req, catalog_service)
            res_dict = dict(est_res.model_dump())

            # Add precalculated exact GiB strings for LLM citation
            gib_factor = 1024**3
            res_dict["formatted_gib"] = {
                "total_required_memory": f"{round(est_res.total_bytes / gib_factor, 1)} GiB",
                "weights_memory": f"{round(est_res.weights_bytes / gib_factor, 1)} GiB",
                "kv_cache_memory": f"{round(est_res.kv_cache_bytes / gib_factor, 1)} GiB",
                "activation_memory": f"{round(est_res.activation_bytes / gib_factor, 1)} GiB",
                "headroom_memory": f"{round(est_res.headroom_bytes / gib_factor, 1)} GiB",
                "usable_hardware_memory": f"{round((hw_input.memory_bytes - hw_input.reserved_memory_bytes) / gib_factor, 1)} GiB",
            }
            res_dict["assumptions"] = list(est_res.assumptions) + assumptions
            return res_dict

        elif name == "recommend_models":
            validated_rec = RecommendModelsArgs.model_validate(args)
            hw_input = None

            if validated_rec.hardware_name:
                est_hw_list = await hardware_service.list_profiles(session)
                if not est_hw_list:
                    est_hw_list = _load_hardware_presets()
                hw_input, _rec_assumptions = _match_hardware_profile(
                    validated_rec.hardware_name, list(est_hw_list)
                )
            elif validated_rec.memory_budget_gb:
                budget_b = int(validated_rec.memory_budget_gb * (1024**3))
                hw_input = HardwareProfileInput(
                    name=f"{validated_rec.memory_budget_gb}GB Budget",
                    memory_bytes=budget_b,
                    kind=HardwareKind.GPU,
                    reserved_memory_bytes=int(budget_b * 0.05),
                    is_preset=False,
                )

            quant_fmt = QuantizationFormat.Q4_K_M
            with contextlib.suppress(ValueError):
                quant_fmt = QuantizationFormat(validated_rec.quantization)

            spec = RequirementSpec(
                task=validated_rec.task,  # type: ignore[arg-type]
                hardware=hw_input,
                max_context=validated_rec.max_context,
                quantization_preference=quant_fmt,
                license_preference=validated_rec.license_preference,  # type: ignore[arg-type]
            )

            rec_res = await recommend_service.recommend(spec, session)
            return rec_res.model_dump()

        else:
            return {"status": "error", "message": f"Unknown tool: '{name}'"}

    except (ValueError, KeyError, TypeError) as exc:
        return {
            "status": "error",
            "message": f"Tool execution failed: {exc}",
        }
