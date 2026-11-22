"""Database repository for cached Hugging Face model metadata."""

import json
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from archnemesis.db.tables import ModelCacheTable


class CatalogRepository:
    """Async database access for cached Hugging Face model metadata."""

    async def get_by_repo_id(self, session: AsyncSession, repo_id: str) -> ModelCacheTable | None:
        """Finds a cached model record by unique HF repository ID."""
        stmt = select(ModelCacheTable).where(ModelCacheTable.hf_model_id == repo_id)
        result = await session.execute(stmt)
        return result.scalars().first()

    async def get_by_repo_ids(
        self, session: AsyncSession, repo_ids: list[str]
    ) -> dict[str, ModelCacheTable]:
        """Finds cached models by HF repo IDs, returning a dict of repo_id to ModelCacheTable."""
        if not repo_ids:
            return {}
        stmt = select(ModelCacheTable).where(ModelCacheTable.hf_model_id.in_(repo_ids))
        result = await session.execute(stmt)
        return {c.hf_model_id: c for c in result.scalars().all()}

    async def upsert(
        self,
        session: AsyncSession,
        data: dict[str, Any],
    ) -> ModelCacheTable:
        """Inserts or updates a cached model record."""
        repo_id = data["hf_model_id"]
        cached = await self.get_by_repo_id(session, repo_id)
        now_iso = datetime.now(UTC).isoformat()

        raw_cfg = data.get("raw_config")
        raw_config_str: str = (
            str(raw_cfg) if isinstance(raw_cfg, str) else json.dumps(raw_cfg or {})
        )
        norm_p = data.get("normalized_payload")
        normalized_str: str = str(norm_p) if isinstance(norm_p, str) else json.dumps(norm_p or {})
        expires_at_val = data["expires_at"]
        expires_at_str = (
            expires_at_val.isoformat()
            if isinstance(expires_at_val, datetime)
            else str(expires_at_val)
        )

        if cached is None:
            cached = ModelCacheTable(
                id=uuid.uuid4().hex,
                hf_model_id=repo_id,
                author=data.get("author", "unknown"),
                model_name=data.get("model_name", repo_id),
                pipeline_tag=data.get("pipeline_tag"),
                likes=data.get("likes", 0),
                downloads=data.get("downloads", 0),
                etag=data.get("etag"),
                last_modified=data.get("last_modified"),
                fetched_at=now_iso,
                expires_at=expires_at_str,
                raw_config=raw_config_str,
                normalized_payload=normalized_str,
                architecture_name=data.get("architecture_name"),
                is_supported=data.get("is_supported", True),
                support_status=data.get("support_status", "supported_llm"),
                support_reason_code=data.get("support_reason_code"),
                support_reason_message=data.get("support_reason_message"),
                gated=data.get("gated", False),
                license=data.get("license"),
                param_provenance=data.get("param_provenance", "derived"),
                created_at=now_iso,
                updated_at=now_iso,
            )
            session.add(cached)
        else:
            cached.author = data.get("author", cached.author)
            cached.model_name = data.get("model_name", cached.model_name)
            cached.pipeline_tag = data.get("pipeline_tag", cached.pipeline_tag)
            cached.likes = data.get("likes", cached.likes)
            cached.downloads = data.get("downloads", cached.downloads)
            cached.etag = data.get("etag", cached.etag)
            cached.last_modified = data.get("last_modified", cached.last_modified)
            cached.fetched_at = now_iso
            cached.expires_at = expires_at_str
            cached.raw_config = raw_config_str
            cached.normalized_payload = normalized_str
            cached.architecture_name = data.get("architecture_name", cached.architecture_name)
            cached.is_supported = data.get("is_supported", cached.is_supported)
            cached.support_status = data.get("support_status", cached.support_status)
            cached.support_reason_code = data.get("support_reason_code", cached.support_reason_code)
            cached.support_reason_message = data.get(
                "support_reason_message", cached.support_reason_message
            )
            cached.gated = data.get("gated", cached.gated)
            cached.license = data.get("license", cached.license)
            cached.param_provenance = data.get("param_provenance", cached.param_provenance)
            cached.updated_at = now_iso

        await session.flush()
        return cached

    async def list_cached(
        self,
        session: AsyncSession,
        search: str | None = None,
        sort: str = "downloads",
        limit: int = 50,
        offset: int = 0,
        pipeline_tag: str | None = None,
    ) -> list[ModelCacheTable]:
        """Lists cached models with optional filtering and sorting."""
        stmt = select(ModelCacheTable)
        if pipeline_tag:
            stmt = stmt.where(ModelCacheTable.pipeline_tag == pipeline_tag)
        if search:
            pattern = f"%{search.lower()}%"
            stmt = stmt.where(
                (ModelCacheTable.hf_model_id.ilike(pattern))
                | (ModelCacheTable.author.ilike(pattern))
                | (ModelCacheTable.model_name.ilike(pattern))
            )

        if sort == "likes":
            stmt = stmt.order_by(desc(ModelCacheTable.likes))
        elif sort == "recent":
            stmt = stmt.order_by(desc(ModelCacheTable.fetched_at))
        else:
            stmt = stmt.order_by(desc(ModelCacheTable.downloads))

        stmt = stmt.limit(limit).offset(offset)
        result = await session.execute(stmt)
        return list(result.scalars().all())
