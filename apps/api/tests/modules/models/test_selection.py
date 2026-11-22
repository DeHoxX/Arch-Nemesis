"""Tests for candidate partitioning, size bands, and gate probe selection (Stage 6A, D-401)."""

import random
from typing import Any

import pytest

from archnemesis.modules.models.schemas import ProbeResult, SizeBand
from archnemesis.modules.models.selection import partition_candidates, select_model_suggestions


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
    assert candidates[0].gated is False if hasattr(candidates[0], "gated") else True


def test_partition_candidates_threshold_edges() -> None:
    raw_models: list[dict[str, Any]] = [
        # Exactly below small_max (3B - 1)
        {
            "id": "edge/small",
            "author": "edge",
            "model_name": "small",
            "total_params": 2_999_999_999,
            "gated": False,
            "downloads": 10,
        },
        # Exactly at small_max (3B) -> medium
        {
            "id": "edge/medium-low",
            "author": "edge",
            "model_name": "medium-low",
            "total_params": 3_000_000_000,
            "gated": False,
            "downloads": 20,
        },
        # Exactly at medium_max (10B) -> medium
        {
            "id": "edge/medium-high",
            "author": "edge",
            "model_name": "medium-high",
            "total_params": 10_000_000_000,
            "gated": False,
            "downloads": 30,
        },
        # Exactly above medium_max (10B + 1) -> large
        {
            "id": "edge/large",
            "author": "edge",
            "model_name": "large",
            "total_params": 10_000_000_001,
            "gated": False,
            "downloads": 40,
        },
        # None params -> unknown
        {
            "id": "edge/none",
            "author": "edge",
            "model_name": "none",
            "total_params": None,
            "gated": False,
            "downloads": 50,
        },
    ]

    candidates = partition_candidates(raw_models, tag="text-generation")
    by_id = {c.id: c for c in candidates}

    assert by_id["edge/small"].size_band == SizeBand.SMALL
    assert by_id["edge/medium-low"].size_band == SizeBand.MEDIUM
    assert by_id["edge/medium-high"].size_band == SizeBand.MEDIUM
    assert by_id["edge/large"].size_band == SizeBand.LARGE
    assert by_id["edge/none"].size_band == SizeBand.UNKNOWN


def test_partition_candidates_empty_band_filled_from_remaining_by_downloads() -> None:
    # Only 3 models available, ALL are SMALL (no medium, no large)
    raw_models: list[dict[str, Any]] = [
        {
            "id": "m/small-1",
            "author": "m",
            "model_name": "small-1",
            "total_params": 1_000_000_000,
            "gated": False,
            "downloads": 300,
        },
        {
            "id": "m/small-2",
            "author": "m",
            "model_name": "small-2",
            "total_params": 1_000_000_000,
            "gated": False,
            "downloads": 200,
        },
        {
            "id": "m/small-3",
            "author": "m",
            "model_name": "small-3",
            "total_params": 1_000_000_000,
            "gated": False,
            "downloads": 100,
        },
    ]

    candidates = partition_candidates(raw_models, tag="text-generation")
    assert len(candidates) == 3
    # Top small is lead, then the remaining smalls fill the list in download order
    assert [c.id for c in candidates] == ["m/small-1", "m/small-2", "m/small-3"]


def test_partition_candidates_deterministic_on_shuffled_input() -> None:
    raw_models: list[dict[str, Any]] = [
        {
            "id": "a/small",
            "author": "a",
            "model_name": "small",
            "total_params": 1_000_000_000,
            "gated": False,
            "downloads": 100,
        },
        {
            "id": "b/medium",
            "author": "b",
            "model_name": "medium",
            "total_params": 7_000_000_000,
            "gated": False,
            "downloads": 200,
        },
        {
            "id": "c/large",
            "author": "c",
            "model_name": "large",
            "total_params": 14_000_000_000,
            "gated": False,
            "downloads": 300,
        },
        {
            "id": "d/fill",
            "author": "d",
            "model_name": "fill",
            "total_params": 500_000_000,
            "gated": False,
            "downloads": 50,
        },
    ]

    expected = partition_candidates(raw_models, tag="text-generation")

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
async def test_select_model_suggestions_probes_and_skips_gated() -> None:
    raw_models: list[dict[str, Any]] = [
        {
            "id": "m/s1",
            "author": "m",
            "model_name": "s1",
            "total_params": 1_000_000_000,
            "gated": False,
            "downloads": 500,
        },
        {
            "id": "m/s2",
            "author": "m",
            "model_name": "s2",
            "total_params": 1_000_000_000,
            "gated": False,
            "downloads": 400,
        },
        {
            "id": "m/m1",
            "author": "m",
            "model_name": "m1",
            "total_params": 7_000_000_000,
            "gated": False,
            "downloads": 300,
        },
        {
            "id": "m/l1",
            "author": "m",
            "model_name": "l1",
            "total_params": 14_000_000_000,
            "gated": False,
            "downloads": 200,
        },
    ]
    candidates = partition_candidates(raw_models, tag="text-generation")

    # s1 is GATED at probe time (e.g. 403), others are OPEN
    async def fake_probe(repo_id: str) -> ProbeResult:
        if repo_id == "m/s1":
            return ProbeResult.GATED
        return ProbeResult.OPEN

    selected = await select_model_suggestions(
        candidates, probe_fn=fake_probe, max_probes=6, target_count=3
    )
    assert len(selected) == 3
    # m/s1 was dropped because it probed GATED; m/m1, m/l1, and then fill m/s2 were accepted
    selected_ids = [s.id for s in selected]
    assert "m/s1" not in selected_ids
    assert set(selected_ids) == {"m/m1", "m/l1", "m/s2"}


@pytest.mark.asyncio
async def test_select_model_suggestions_probe_unknown_never_counted_as_open() -> None:
    raw_models: list[dict[str, Any]] = [
        {
            "id": "m/1",
            "author": "m",
            "model_name": "1",
            "total_params": 1_000_000_000,
            "gated": False,
            "downloads": 100,
        },
        {
            "id": "m/2",
            "author": "m",
            "model_name": "2",
            "total_params": 1_000_000_000,
            "gated": False,
            "downloads": 90,
        },
    ]
    candidates = partition_candidates(raw_models, tag="text-generation")

    # Both probe as UNKNOWN (e.g. 500 server error)
    async def fake_probe(repo_id: str) -> ProbeResult:
        return ProbeResult.UNKNOWN

    selected = await select_model_suggestions(
        candidates, probe_fn=fake_probe, max_probes=6, target_count=3
    )
    assert len(selected) == 0


@pytest.mark.asyncio
async def test_select_model_suggestions_respects_probe_cap() -> None:
    # 10 candidates, all probe as GATED except the 10th
    raw_models: list[dict[str, Any]] = [
        {
            "id": f"m/{i}",
            "author": "m",
            "model_name": f"{i}",
            "total_params": 1_000_000_000,
            "gated": False,
            "downloads": 100 - i,
        }
        for i in range(10)
    ]
    candidates = partition_candidates(raw_models, tag="text-generation")

    probes_called = 0

    async def fake_probe(repo_id: str) -> ProbeResult:
        nonlocal probes_called
        probes_called += 1
        return ProbeResult.GATED

    # Cap at 4 probes
    selected = await select_model_suggestions(
        candidates, probe_fn=fake_probe, max_probes=4, target_count=3
    )
    assert probes_called == 4
    assert len(selected) == 0


@pytest.mark.asyncio
async def test_select_model_suggestions_fewer_than_3_returns_fewer_never_invents() -> None:
    raw_models: list[dict[str, Any]] = [
        {
            "id": "m/only-one",
            "author": "m",
            "model_name": "only-one",
            "total_params": 1_000_000_000,
            "gated": False,
            "downloads": 100,
        }
    ]
    candidates = partition_candidates(raw_models, tag="text-generation")

    async def fake_probe(repo_id: str) -> ProbeResult:
        return ProbeResult.OPEN

    selected = await select_model_suggestions(
        candidates, probe_fn=fake_probe, max_probes=6, target_count=3
    )
    assert len(selected) == 1
    assert selected[0].id == "m/only-one"
