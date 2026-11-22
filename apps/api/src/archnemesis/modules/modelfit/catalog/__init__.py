"""Catalog module: model discovery, metadata normalization, and caching."""

from archnemesis.modules.modelfit.catalog.repo import CatalogRepository
from archnemesis.modules.modelfit.catalog.schemas import (
    ModelDetailResponse,
    ModelListResponse,
    ModelSummary,
    SupportStatus,
)
from archnemesis.modules.modelfit.catalog.service import CatalogService

__all__ = [
    "CatalogRepository",
    "CatalogService",
    "ModelDetailResponse",
    "ModelListResponse",
    "ModelSummary",
    "SupportStatus",
]
