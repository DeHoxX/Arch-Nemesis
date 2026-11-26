"""Tests for candidate partitioning, size bands, and gate probe selection (Stage 6A, D-401)."""

import random
from typing import Any

import pytest

from archnemesis.modules.models.schemas import ModelProbeDetail, ProbeResult, SizeBand
from archnemesis.modules.models.selection import (
    classify_size_band,
    partition_candidates,
    select_model_suggestions,
)


def test_classify_size_band_threshold_edges() -> None:
    # Small (< 3B)
    assert classify_size_band(2_999_999_999) == SizeBand.SMALL
    # Medium boundary (3B..14B)
    assert classify_size_band(3_000_000_000) == SizeBand.MEDIUM
    assert classify_size_band(14_000_000_000) == SizeBand.MEDIUM
    # Large (> 14B)
    assert classify_size_band(14_000_000_001) == SizeBand.LARGE
    # Missing / None -> UNKNOWN
    assert classify_size_band(None) == SizeBand.UNKNOWN


def test_partition_candidates_filters_gated_and_incomplete_models() -> None:
    raw_models: list[dict[str, Any]] = [
        {
            "id": "open/model-1",
            "author": "open",
            "model_name": "model-1",
            "gated": False,
            "downloads": 100,
        },
        {
            "id": "gated/model-2",
            "author": "gated",
            "model_name": "model-2",
            "gated": True,
            "downloads": 500,
        },
        {
            "id": "manual/model-3",
            "author": "manual",
            "model_name": "model-3",
            "gated": "manual",
            "downloads": 600,
        },
        {
            "id": "missing/author",
            "author": "",
            "model_name": "model-4",
            "gated": False,
            "downloads": 300,
        },
        {
            "id": "missing/name",
            "author": "missing",
            "model_name": "",
            "gated": False,
            "downloads": 400,
        },
        {
            "id": "",
            "author": "missing",
            "model_name": "missing-id",
            "gated": False,
            "downloads": 200,
        },
    ]

    candidates = partition_candidates(raw_models, tag="text-generation")
    assert len(candidates) == 1
    assert candidates[0].id == "open/model-1"
    # total_params is None and size_band is UNKNOWN until probed
    assert candidates[0].total_params is None
    assert candidates[0].size_band == SizeBand.UNKNOWN


def test_partition_candidates_deterministic_on_shuffled_input() -> None:
    raw_models: list[dict[str, Any]] = [
        {"id": "a/m1", "author": "a", "model_name": "m1", "gated": False, "downloads": 100},
        {"id": "b/m2", "author": "b", "model_name": "m2", "gated": False, "downloads": 200},
        {"id": "c/m3", "author": "c", "model_name": "m3", "gated": False, "downloads": 300},
        {"id": "d/m4", "author": "d", "model_name": "m4", "gated": False, "downloads": 50},
    ]

    expected = partition_candidates(raw_models, tag="text-generation")
    assert [c.id for c in expected] == ["c/m3", "b/m2", "a/m1", "d/m4"]

    for seed in (42, 123, 999):
        shuffled: list[dict[str, Any]] = list(raw_models)
        random.Random(seed).shuffle(shuffled)
        result = partition_candidates(shuffled, tag="text-generation")
        assert [c.id for c in result] == [c.id for c in expected]


def test_partition_candidates_hostile_strings_rendered_as_plain_strings() -> None:
    hostile_author = "<script>alert(1)</script>"
    hostile_name = 'DROP TABLE users; -- "quotes"'
    raw_models: list[dict[str, Any]] = [
        {
            "id": "hostile/test",
            "author": hostile_author,
            "model_name": hostile_name,
            "gated": False,
            "downloads": 10,
        }
    ]

    candidates = partition_candidates(raw_models, tag="text-generation")
    assert len(candidates) == 1
    assert candidates[0].author == hostile_author
    assert candidates[0].model_name == hostile_name


@pytest.mark.asyncio
async def test_select_model_suggestions_picks_one_per_band_from_detail_probe() -> None:
    raw_models: list[dict[str, Any]] = [
        {"id": "m/s1", "author": "m", "model_name": "s1", "gated": False, "downloads": 500},
        {"id": "m/s2", "author": "m", "model_name": "s2", "gated": False, "downloads": 400},
        {"id": "m/m1", "author": "m", "model_name": "m1", "gated": False, "downloads": 300},
        {"id": "m/l1", "author": "m", "model_name": "l1", "gated": False, "downloads": 200},
    ]
    candidates = partition_candidates(raw_models, tag="text-generation")

    # Probe returns params from normalized_model
    params_map = {
        "m/s1": 1_000_000_000,
        "m/s2": 1_500_000_000,
        "m/m1": 7_000_000_000,
        "m/l1": 14_000_000_000,
    }

    async def fake_probe(repo_id: str) -> ModelProbeDetail:
        return ModelProbeDetail(status=ProbeResult.OPEN, total_params=params_map[repo_id])

    selected = await select_model_suggestions(
        candidates, probe_fn=fake_probe, max_probes=6, target_count=3
    )
    assert len(selected) == 3
    # Picked 1 small, 1 med, 1 large
    selected_bands = {s.size_band for s in selected}
    assert selected_bands == {SizeBand.SMALL, SizeBand.MEDIUM, SizeBand.LARGE}
    assert {s.id for s in selected} == {"m/s1", "m/m1", "m/l1"}


@pytest.mark.asyncio
async def test_select_model_suggestions_no_params_yields_unknown_and_fills() -> None:
    # Model name like "14B" but normalized_model.total_params is null
    raw_models: list[dict[str, Any]] = [
        {
            "id": "m/fake-14B",
            "author": "m",
            "model_name": "model-14B",
            "gated": False,
            "downloads": 1000,
        },
        {
            "id": "m/real-small",
            "author": "m",
            "model_name": "small",
            "gated": False,
            "downloads": 500,
        },
        {"id": "m/real-med", "author": "m", "model_name": "med", "gated": False, "downloads": 300},
    ]
    candidates = partition_candidates(raw_models, tag="text-generation")

    params_map = {
        "m/fake-14B": None,  # no params in detail
        "m/real-small": 1_000_000_000,
        "m/real-med": 7_000_000_000,
    }

    async def fake_probe(repo_id: str) -> ModelProbeDetail:
        return ModelProbeDetail(status=ProbeResult.OPEN, total_params=params_map[repo_id])

    selected = await select_model_suggestions(
        candidates, probe_fn=fake_probe, max_probes=6, target_count=3
    )
    assert len(selected) == 3
    by_id = {s.id: s for s in selected}
    # Name "14B" without params stays UNKNOWN, never LARGE
    assert by_id["m/fake-14B"].size_band == SizeBand.UNKNOWN
    assert by_id["m/fake-14B"].total_params is None
    assert by_id["m/real-small"].size_band == SizeBand.SMALL
    assert by_id["m/real-med"].size_band == SizeBand.MEDIUM


@pytest.mark.asyncio
async def test_select_model_suggestions_probes_and_skips_gated() -> None:
    raw_models: list[dict[str, Any]] = [
        {"id": "m/s1", "author": "m", "model_name": "s1", "gated": False, "downloads": 500},
        {"id": "m/s2", "author": "m", "model_name": "s2", "gated": False, "downloads": 400},
        {"id": "m/m1", "author": "m", "model_name": "m1", "gated": False, "downloads": 300},
        {"id": "m/l1", "author": "m", "model_name": "l1", "gated": False, "downloads": 200},
    ]
    candidates = partition_candidates(raw_models, tag="text-generation")

    async def fake_probe(repo_id: str) -> ModelProbeDetail:
        if repo_id == "m/s1":
            return ModelProbeDetail(status=ProbeResult.GATED, total_params=None)
        return ModelProbeDetail(status=ProbeResult.OPEN, total_params=1_000_000_000)

    selected = await select_model_suggestions(
        candidates, probe_fn=fake_probe, max_probes=6, target_count=3
    )
    assert len(selected) == 3
    selected_ids = [s.id for s in selected]
    assert "m/s1" not in selected_ids
    assert set(selected_ids) == {"m/s2", "m/m1", "m/l1"}


@pytest.mark.asyncio
async def test_select_model_suggestions_probe_unknown_never_counted_as_open() -> None:
    raw_models: list[dict[str, Any]] = [
        {"id": "m/1", "author": "m", "model_name": "1", "gated": False, "downloads": 100},
        {"id": "m/2", "author": "m", "model_name": "2", "gated": False, "downloads": 90},
    ]
    candidates = partition_candidates(raw_models, tag="text-generation")

    async def fake_probe(repo_id: str) -> ModelProbeDetail:
        return ModelProbeDetail(status=ProbeResult.UNKNOWN, total_params=None)

    selected = await select_model_suggestions(
        candidates, probe_fn=fake_probe, max_probes=6, target_count=3
    )
    assert len(selected) == 0


@pytest.mark.asyncio
async def test_select_model_suggestions_respects_probe_cap() -> None:
    raw_models: list[dict[str, Any]] = [
        {
            "id": f"m/{i}",
            "author": "m",
            "model_name": f"{i}",
            "gated": False,
            "downloads": 100 - i,
        }
        for i in range(10)
    ]
    candidates = partition_candidates(raw_models, tag="text-generation")
    probes_called = 0
    probed_repo_ids: list[str] = []

    # Probes up to max_probes (4) to gather open models before band selection
    async def fake_probe(repo_id: str) -> ModelProbeDetail:
        nonlocal probes_called
        probes_called += 1
        probed_repo_ids.append(repo_id)
        if repo_id in ("m/0", "m/1"):
            return ModelProbeDetail(status=ProbeResult.OPEN, total_params=1_000_000_000)
        return ModelProbeDetail(status=ProbeResult.GATED, total_params=None)

    max_probes = 4
    selected = await select_model_suggestions(
        candidates, probe_fn=fake_probe, max_probes=max_probes, target_count=2
    )
    # Non-empty guard on returned items
    assert len(selected) > 0, "Selected items must not be empty"
    assert len(selected) == 2
    # Verify exact probe call count and probed candidates
    assert probes_called == max_probes
    assert probed_repo_ids == ["m/0", "m/1", "m/2", "m/3"]

    # Now test hitting max_probes when all probed are GATED
    probes_called_cap = 0

    async def fake_probe_all_gated(repo_id: str) -> ModelProbeDetail:
        nonlocal probes_called_cap
        probes_called_cap += 1
        return ModelProbeDetail(status=ProbeResult.GATED, total_params=None)

    selected_gated = await select_model_suggestions(
        candidates, probe_fn=fake_probe_all_gated, max_probes=max_probes, target_count=3
    )
    assert len(selected_gated) == 0
    assert probes_called_cap == max_probes, (
        f"Expected exactly {max_probes} probe calls, got {probes_called_cap}"
    )


@pytest.mark.asyncio
async def test_select_model_suggestions_fill_rule_when_missing_bands() -> None:
    # All 3 available models are SMALL (no medium, no large)
    raw_models: list[dict[str, Any]] = [
        {"id": "m/s1", "author": "m", "model_name": "s1", "gated": False, "downloads": 300},
        {"id": "m/s2", "author": "m", "model_name": "s2", "gated": False, "downloads": 200},
        {"id": "m/s3", "author": "m", "model_name": "s3", "gated": False, "downloads": 100},
    ]
    candidates = partition_candidates(raw_models, tag="text-generation")

    async def fake_probe(repo_id: str) -> ModelProbeDetail:
        return ModelProbeDetail(status=ProbeResult.OPEN, total_params=500_000_000)

    selected = await select_model_suggestions(
        candidates, probe_fn=fake_probe, max_probes=6, target_count=3
    )
    assert len(selected) == 3
    # 1 small lead + 2 small fills in download order
    assert [s.id for s in selected] == ["m/s1", "m/s2", "m/s3"]
    assert all(s.size_band == SizeBand.SMALL for s in selected)
