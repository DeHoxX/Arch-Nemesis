"""Domain service orchestrating Hugging Face metadata caching, normalization, and stale fallback."""

import json
from datetime import UTC, datetime, timedelta
from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from archnemesis.errors import AppError
from archnemesis.modules.modelfit.catalog.classifier import classify_model_support
from archnemesis.modules.modelfit.catalog.hf_client import HubClient
from archnemesis.modules.modelfit.catalog.normalizer import normalize_hf_config
from archnemesis.modules.modelfit.catalog.repo import CatalogRepository
from archnemesis.modules.modelfit.catalog.schemas import (
    ModelDetailResponse,
    ModelListResponse,
    ModelSummary,
    SupportStatus,
)
from archnemesis.modules.modelfit.estimator.schemas import NormalizedModel

logger = structlog.get_logger(__name__)

DEFAULT_TTL_SECONDS = 86400 * 7  # 7 days


class CatalogService:
    """Service orchestrating model catalog queries, normalization, and stale-while-revalidate."""

    def __init__(
        self,
        repository: CatalogRepository | None = None,
        hub_client: HubClient | None = None,
        ttl_seconds: int = DEFAULT_TTL_SECONDS,
    ) -> None:
        self.repository = repository or CatalogRepository()
        self.hub_client = hub_client or HubClient()
        self.ttl_seconds = ttl_seconds

    async def list_models(
        self,
        session: AsyncSession,
        search: str | None = None,
        sort: str = "downloads",
        limit: int = 20,
        cursor: str | None = None,
        pipeline_tag: str | None = None,
    ) -> ModelListResponse:
        """Lists models from Hugging Face Hub, falling back to local cache if Hub is unreachable."""
        limit = min(max(1, limit), 50)
        try:
            raw_models, next_cursor = await self.hub_client.list_models(
                search=search,
                sort=sort,
                limit=limit,
                cursor=cursor,
                pipeline_tag=pipeline_tag,
            )

            repo_ids = [m.get("id") or m.get("modelId", "") for m in raw_models]
            repo_ids = [r for r in repo_ids if r]
            cached_map = await self.repository.get_by_repo_ids(session, repo_ids)

            summaries: list[ModelSummary] = []
            for m in raw_models:
                repo_id = m.get("id") or m.get("modelId", "")
                if not repo_id:
                    continue
                parts = repo_id.split("/", 1)
                author = parts[0] if len(parts) > 1 else "unknown"
                model_name = parts[1] if len(parts) > 1 else parts[0]

                tags = m.get("tags", [])
                license_str = None
                if isinstance(tags, list):
                    for tag in tags:
                        if isinstance(tag, str) and tag.startswith("license:"):
                            license_str = tag.replace("license:", "")
                            break

                cached_row = cached_map.get(repo_id)
                if cached_row is not None:
                    status_val = (
                        SupportStatus(cached_row.support_status)
                        if cached_row.support_status
                        else (
                            SupportStatus.SUPPORTED_LLM
                            if cached_row.is_supported
                            else SupportStatus.UNSUPPORTED_ARCHITECTURE
                        )
                    )
                    reason_code = cached_row.support_reason_code
                    reason_message = cached_row.support_reason_message
                    arch_name = cached_row.architecture_name
                    tot_params = None
                    if cached_row.normalized_payload:
                        try:
                            payload_dict = (
                                json.loads(cached_row.normalized_payload)
                                if isinstance(cached_row.normalized_payload, str)
                                else cached_row.normalized_payload
                            )
                            tot_params = payload_dict.get("total_params")
                        except (json.JSONDecodeError, ValueError):
                            tot_params = None
                    is_sup = cached_row.is_supported
                else:
                    status_val = SupportStatus.NOT_CHECKED
                    reason_code = None
                    reason_message = None
                    arch_name = None
                    tot_params = None
                    is_sup = True

                summaries.append(
                    ModelSummary(
                        id=repo_id,
                        author=author,
                        model_name=model_name,
                        pipeline_tag=m.get("pipeline_tag"),
                        likes=m.get("likes", 0),
                        downloads=m.get("downloads", 0),
                        is_supported=is_sup,
                        support_status=status_val,
                        support_reason_code=reason_code,
                        support_reason_message=reason_message,
                        architecture_name=arch_name,
                        total_params=tot_params,
                        gated=m.get("gated", False) if isinstance(m.get("gated"), bool) else False,
                        license=license_str,
                    )
                )

            return ModelListResponse(
                items=summaries,
                next_cursor=next_cursor,
                has_more=next_cursor is not None,
            )
        except AppError as exc:
            if exc.code == "UPSTREAM_UNAVAILABLE":
                logger.warning("hub_unreachable_serving_cached_list")
                cached_items = await self.repository.list_cached(
                    session=session,
                    search=search,
                    sort=sort,
                    limit=limit,
                    pipeline_tag=pipeline_tag,
                )
                if not cached_items:
                    raise
                summaries = []
                for c in cached_items:
                    status_val = (
                        SupportStatus(c.support_status)
                        if c.support_status
                        else (
                            SupportStatus.SUPPORTED_LLM
                            if c.is_supported
                            else SupportStatus.UNSUPPORTED_ARCHITECTURE
                        )
                    )
                    tot_params = None
                    if c.normalized_payload:
                        try:
                            p_dict = (
                                json.loads(c.normalized_payload)
                                if isinstance(c.normalized_payload, str)
                                else c.normalized_payload
                            )
                            tot_params = p_dict.get("total_params")
                        except (json.JSONDecodeError, ValueError):
                            tot_params = None
                    summaries.append(
                        ModelSummary(
                            id=c.hf_model_id,
                            author=c.author,
                            model_name=c.model_name,
                            pipeline_tag=c.pipeline_tag,
                            likes=c.likes,
                            downloads=c.downloads,
                            is_supported=c.is_supported,
                            support_status=status_val,
                            support_reason_code=c.support_reason_code,
                            support_reason_message=c.support_reason_message,
                            architecture_name=c.architecture_name,
                            total_params=tot_params,
                            gated=c.gated,
                            license=c.license,
                        )
                    )
                return ModelListResponse(
                    items=summaries,
                    next_cursor=None,
                    has_more=False,
                )
            raise

    async def get_model_detail(
        self,
        session: AsyncSession,
        repo_id: str,
    ) -> ModelDetailResponse:
        """Retrieves normalized model details from cache or Hugging Face Hub."""
        now = datetime.now(UTC)
        cached = await self.repository.get_by_repo_id(session, repo_id)

        # Check if cached and fresh
        if cached:
            try:
                expires_dt = datetime.fromisoformat(cached.expires_at)
                if expires_dt > now:
                    payload_dict = (
                        json.loads(cached.normalized_payload)
                        if isinstance(cached.normalized_payload, str)
                        else cached.normalized_payload
                    )
                    normalized = NormalizedModel.model_validate(payload_dict)
                    status_val = (
                        SupportStatus(cached.support_status)
                        if cached.support_status
                        else (
                            SupportStatus.SUPPORTED_LLM
                            if cached.is_supported
                            else SupportStatus.UNSUPPORTED_ARCHITECTURE
                        )
                    )
                    return ModelDetailResponse(
                        id=cached.hf_model_id,
                        author=cached.author,
                        model_name=cached.model_name,
                        pipeline_tag=cached.pipeline_tag,
                        likes=cached.likes,
                        downloads=cached.downloads,
                        is_supported=cached.is_supported,
                        support_status=status_val,
                        support_reason_code=cached.support_reason_code,
                        support_reason_message=cached.support_reason_message,
                        gated=cached.gated,
                        license=cached.license,
                        param_provenance=cached.param_provenance,
                        normalized_model=normalized,
                    )
            except (json.JSONDecodeError, ValueError):
                pass

        # Cache miss or expired: fetch from Hugging Face
        try:
            info = await self.hub_client.fetch_model_info(repo_id)
            etag_to_send = cached.etag if cached else None
            config_dict, etag, last_modified, not_modified = await self.hub_client.fetch_raw_config(
                repo_id, etag=etag_to_send
            )

            # If 304 Not Modified, refresh expiry and return cached data
            if not_modified and cached:
                cached.expires_at = (now + timedelta(seconds=self.ttl_seconds)).isoformat()
                await session.flush()
                payload_dict = (
                    json.loads(cached.normalized_payload)
                    if isinstance(cached.normalized_payload, str)
                    else cached.normalized_payload
                )
                normalized = NormalizedModel.model_validate(payload_dict)
                status_val = (
                    SupportStatus(cached.support_status)
                    if cached.support_status
                    else (
                        SupportStatus.SUPPORTED_LLM
                        if cached.is_supported
                        else SupportStatus.UNSUPPORTED_ARCHITECTURE
                    )
                )
                return ModelDetailResponse(
                    id=cached.hf_model_id,
                    author=cached.author,
                    model_name=cached.model_name,
                    pipeline_tag=cached.pipeline_tag,
                    likes=cached.likes,
                    downloads=cached.downloads,
                    is_supported=cached.is_supported,
                    support_status=status_val,
                    support_reason_code=cached.support_reason_code,
                    support_reason_message=cached.support_reason_message,
                    gated=cached.gated,
                    license=cached.license,
                    param_provenance=cached.param_provenance,
                    normalized_model=normalized,
                )

            # Inspect safetensors header range without downloading weights
            safetensors_params = await self.hub_client.inspect_safetensors_header(repo_id)

            # Classify support status deterministically
            support_status, support_reason_code, support_reason_message = classify_model_support(
                pipeline_tag=info.get("pipeline_tag"),
                raw_config=config_dict,
                config_missing=(config_dict is None),
            )

            # Normalize model configuration
            normalized_model, param_provenance = normalize_hf_config(
                repo_id=repo_id,
                raw_config=config_dict,
                safetensors_params=safetensors_params,
            )

            # Extract license
            tags = info.get("tags", [])
            license_val = None
            if isinstance(tags, list):
                for t in tags:
                    if isinstance(t, str) and t.startswith("license:"):
                        license_val = t.replace("license:", "")
                        break

            parts = repo_id.split("/", 1)
            author = parts[0] if len(parts) > 1 else "unknown"
            model_name = parts[1] if len(parts) > 1 else parts[0]

            # Upsert into cache
            cache_payload: dict[str, Any] = {
                "hf_model_id": repo_id,
                "author": author,
                "model_name": model_name,
                "pipeline_tag": info.get("pipeline_tag"),
                "likes": info.get("likes", 0),
                "downloads": info.get("downloads", 0),
                "etag": etag,
                "last_modified": last_modified,
                "expires_at": (now + timedelta(seconds=self.ttl_seconds)).isoformat(),
                "raw_config": config_dict or {},
                "normalized_payload": normalized_model.model_dump(),
                "architecture_name": normalized_model.architecture_name,
                "is_supported": (support_status == SupportStatus.SUPPORTED_LLM),
                "support_status": support_status.value,
                "support_reason_code": support_reason_code,
                "support_reason_message": support_reason_message,
                "gated": bool(info.get("gated", False)),
                "license": license_val,
                "param_provenance": param_provenance,
            }

            await self.repository.upsert(session, cache_payload)
            await session.commit()

            return ModelDetailResponse(
                id=repo_id,
                author=author,
                model_name=model_name,
                pipeline_tag=info.get("pipeline_tag"),
                likes=info.get("likes", 0),
                downloads=info.get("downloads", 0),
                is_supported=(support_status == SupportStatus.SUPPORTED_LLM),
                support_status=support_status,
                support_reason_code=support_reason_code,
                support_reason_message=support_reason_message,
                gated=bool(info.get("gated", False)),
                license=license_val,
                param_provenance=param_provenance,
                normalized_model=normalized_model,
            )

        except AppError as exc:
            # If Hub unavailable but stale cache exists, serve stale with warning
            if exc.code == "UPSTREAM_UNAVAILABLE" and cached is not None:
                logger.warning("hub_unreachable_serving_stale_model_detail", repo_id=repo_id)
                payload_dict = (
                    json.loads(cached.normalized_payload)
                    if isinstance(cached.normalized_payload, str)
                    else cached.normalized_payload
                )
                normalized = NormalizedModel.model_validate(payload_dict)
                status_val = (
                    SupportStatus(cached.support_status)
                    if cached.support_status
                    else (
                        SupportStatus.SUPPORTED_LLM
                        if cached.is_supported
                        else SupportStatus.UNSUPPORTED_ARCHITECTURE
                    )
                )
                return ModelDetailResponse(
                    id=cached.hf_model_id,
                    author=cached.author,
                    model_name=cached.model_name,
                    pipeline_tag=cached.pipeline_tag,
                    likes=cached.likes,
                    downloads=cached.downloads,
                    is_supported=cached.is_supported,
                    support_status=status_val,
                    support_reason_code=cached.support_reason_code,
                    support_reason_message=cached.support_reason_message,
                    gated=cached.gated,
                    license=cached.license,
                    param_provenance=cached.param_provenance,
                    normalized_model=normalized,
                    warning="Hugging Face Hub is unreachable. Showing cached model data.",
                )
            raise
