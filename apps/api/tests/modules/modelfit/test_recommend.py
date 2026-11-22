"""Unit tests for recommendation scoring and ranking."""

import pytest

from archnemesis.modules.modelfit.catalog.service import CatalogService
from archnemesis.modules.modelfit.estimator.schemas import (
    HardwareKind,
    HardwareProfileInput,
)
from archnemesis.modules.modelfit.recommend.schemas import RequirementSpec
from archnemesis.modules.modelfit.recommend.service import RecommendService


@pytest.mark.asyncio
async def test_recommend_missing_fields_returns_clarification() -> None:
    svc = RecommendService(catalog_service=CatalogService())
    spec = RequirementSpec(task=None, hardware=None)
    res = await svc.recommend(spec, session=None)  # type: ignore[arg-type]

    from archnemesis.modules.modelfit.recommend.schemas import ClarificationNeeded

    assert isinstance(res, ClarificationNeeded)
    assert "task" in res.missing_fields
    assert "hardware" in res.missing_fields


def test_scoring_headroom_sweet_spot() -> None:
    svc = RecommendService(catalog_service=CatalogService())

    class DummyDetail:
        downloads = 100_000
        license = "apache-2.0"
        last_modified = None

    class DummyEstimate:
        # 20% headroom on 100GB -> in 15%-30% sweet spot -> headroom_score 1.0
        headroom_bytes = 20 * (1024**3)

    hw = HardwareProfileInput(
        name="Test Device",
        memory_bytes=100 * (1024**3),
        kind=HardwareKind.GPU,
        reserved_memory_bytes=0,
    )
    spec = RequirementSpec(task="general", license_preference="permissive")

    breakdown = svc._calculate_score(
        detail=DummyDetail(),
        estimate=DummyEstimate(),
        hardware=hw,
        spec=spec,
    )
    assert breakdown.headroom_score == 1.0
    assert breakdown.license_score == 1.0
    assert breakdown.total_score > 0.7
