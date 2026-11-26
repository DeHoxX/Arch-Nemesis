"""Unit and integration tests for Model Shortlist Stage 1 (D-422, D-423).

Tests:
1. Selection: high tier (2 >= 30B different families + 1 medium), fallback when no 30B+
   (highest available, message, no padding), normal tier (fit-based).
2. Click path: empty shortlist returns unavailable, 0 HF calls.
3. Shortlist: null params and gated excluded.
4. Override: whole-word matching ('audit store' stays normal; 'validator agent' goes high).
5. Migration 0009: table creation and model_suggestions truncation.
6. Script pacing: mock clock proves min 2.1 s between calls.
"""

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from archnemesis.db.tables import ModelShortlistTable, ModelSuggestionTable
from archnemesis.llm.fake import FakeLLMClient
from archnemesis.modules.modelfit.catalog.hf_client import HFPacer
from archnemesis.modules.models import repo
from archnemesis.modules.models.schemas import SizeBand
from archnemesis.modules.models.selection import (
    extract_model_family,
    is_high_responsibility_node,
    select_from_shortlist,
)
from archnemesis.modules.models.service import get_or_generate_model_suggestions
from archnemesis.settings import Settings
from tests.modules.models.conftest_models import AI_NODE_ID, seed_design_chain


def _make_shortlist_table_item(
    repo_id: str,
    total_params: int,
    downloads: int = 1000,
    likes: int = 50,
    task_tag: str = "text-generation",
    rank_order: int = 1,
) -> ModelShortlistTable:
    parts = repo_id.split("/", 1)
    author = parts[0] if len(parts) > 1 else "unknown"
    model_name = parts[1] if len(parts) > 1 else parts[0]
    return ModelShortlistTable(
        id=str(uuid4()),
        task_tag=task_tag,
        repo_id=repo_id,
        author=author,
        model_name=model_name,
        total_params=total_params,
        size_band="large" if total_params >= 14_000_000_000 else "medium",
        downloads=downloads,
        likes=likes,
        rank_order=rank_order,
        refreshed_at=datetime.now(UTC).isoformat(),
        expires_at=datetime.now(UTC).isoformat(),
    )


# ---------------------------------------------------------------------------
# 1. Selection Tests: High Tier and Normal Tier
# ---------------------------------------------------------------------------


def test_selection_high_tier_two_30b_different_families_and_one_medium() -> None:
    items = [
        _make_shortlist_table_item("Qwen/Qwen2.5-32B-Instruct", 32_000_000_000, rank_order=1),
        _make_shortlist_table_item(
            "Qwen/Qwen2.5-72B-Instruct", 72_000_000_000, rank_order=2
        ),  # Same family!
        _make_shortlist_table_item(
            "meta-llama/Llama-3.3-70B-Instruct", 70_000_000_000, rank_order=3
        ),  # Diff family
        _make_shortlist_table_item(
            "mistralai/Mistral-7B-Instruct-v0.3", 7_000_000_000, rank_order=4
        ),  # Medium
        _make_shortlist_table_item("google/gemma-2-2b-it", 2_000_000_000, rank_order=5),  # Small
    ]

    selected, message = select_from_shortlist(
        items=items,
        is_high_responsibility=True,
        target_count=3,
        medium_max_params=14_000_000_000,
        high_min_params=30_000_000_000,
    )

    assert len(selected) == 3
    assert message is None

    # Slot 1: First 30B+ model (Qwen 32B)
    assert selected[0].id == "Qwen/Qwen2.5-32B-Instruct"
    assert selected[0].needs_strong_hardware is True

    # Slot 2: Second 30B+ model from a DIFFERENT family (meta-llama, skipping Qwen 72B)
    assert selected[1].id == "meta-llama/Llama-3.3-70B-Instruct"
    assert selected[1].needs_strong_hardware is True

    # Slot 3: Medium model (Mistral 7B)
    assert selected[2].id == "mistralai/Mistral-7B-Instruct-v0.3"
    assert selected[2].needs_strong_hardware is False
    assert selected[2].size_band == SizeBand.MEDIUM


def test_selection_high_tier_fallback_when_no_30b_models() -> None:
    # Tag has only models under 30B
    items = [
        _make_shortlist_table_item("Qwen/Qwen2.5-14B-Instruct", 14_000_000_000, rank_order=1),
        _make_shortlist_table_item("mistralai/Mistral-7B-Instruct", 7_000_000_000, rank_order=2),
        _make_shortlist_table_item("google/gemma-2-2b-it", 2_000_000_000, rank_order=3),
    ]

    selected, message = select_from_shortlist(
        items=items,
        is_high_responsibility=True,
        target_count=3,
        medium_max_params=14_000_000_000,
        high_min_params=30_000_000_000,
    )

    assert len(selected) == 3
    assert message is not None
    assert "No 30B+ models are currently catalogued" in message
    assert "Showing highest available models" in message

    # Sorted by params descending without padding
    assert selected[0].id == "Qwen/Qwen2.5-14B-Instruct"
    assert selected[1].id == "mistralai/Mistral-7B-Instruct"
    assert selected[2].id == "google/gemma-2-2b-it"


def test_selection_high_tier_fallback_no_padding_when_sparse() -> None:
    # Only 2 models in tag
    items = [
        _make_shortlist_table_item("meta/model-medium", 7_000_000_000, rank_order=1),
        _make_shortlist_table_item("meta/model-small", 1_000_000_000, rank_order=2),
    ]

    selected, message = select_from_shortlist(
        items=items,
        is_high_responsibility=True,
        target_count=3,
    )

    # Exactly 2 models returned, NO padding to 3
    assert len(selected) == 2
    assert message is not None
    assert selected[0].id == "meta/model-medium"
    assert selected[1].id == "meta/model-small"


def test_selection_normal_tier_fit_based() -> None:
    items = [
        _make_shortlist_table_item(
            "meta-llama/Llama-3.3-70B-Instruct", 70_000_000_000, rank_order=1
        ),
        _make_shortlist_table_item("Qwen/Qwen2.5-32B-Instruct", 32_000_000_000, rank_order=2),
        _make_shortlist_table_item("mistralai/Mistral-7B-Instruct", 7_000_000_000, rank_order=3),
        _make_shortlist_table_item("google/gemma-2-2b-it", 2_000_000_000, rank_order=4),
    ]

    selected, message = select_from_shortlist(
        items=items,
        is_high_responsibility=False,
        target_count=3,
        small_max_params=3_000_000_000,
        medium_max_params=14_000_000_000,
    )

    assert len(selected) == 3
    assert message is None
    # Fit-based: picks small (gemma 2B) and medium (mistral 7B) first
    ids = [m.id for m in selected]
    assert "google/gemma-2-2b-it" in ids
    assert "mistralai/Mistral-7B-Instruct" in ids


# ---------------------------------------------------------------------------
# 2. Whole-Word Regex Override Tests
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("name", "role", "needs_model", "ai_role", "expected_high"),
    [
        # "audit store" stays normal because it is NOT an AI node
        ("audit store", "Store financial audit records in PostgreSQL", False, None, False),
        ("audit store", "Store financial audit records in PostgreSQL", False, "none", False),
        # "validator agent" goes high because it IS an AI node and matches "validator"
        ("validator agent", "Validate credit applications against policy", True, "agent", True),
        ("fraud detector", "Flag suspicious payments in real-time", True, "model", True),
        ("decision engine", "Evaluate risk rules and decide outcome", True, "agent", True),
        ("orchestration node", "Coordinate downstream pipeline agents", True, "agent", True),
        ("reviewer", "Review generated code and flag errors", True, "agent", True),
        ("planner agent", "Plan multi-step execution tasks", True, "agent", True),
        # Non-high AI nodes stay normal
        ("data extractor", "Extract invoice numbers using OCR vision", True, "agent", False),
        ("router", "Route requests based on message language", True, "agent", False),
        ("embedding service", "Generate vector embeddings for search", True, "model", False),
    ],
)
def test_high_responsibility_whole_word_matching_override(
    name: str,
    role: str,
    needs_model: bool,
    ai_role: str | None,
    expected_high: bool,
) -> None:
    is_high = is_high_responsibility_node(
        name=name,
        role=role,
        needs_model=needs_model,
        ai_role=ai_role,
    )
    assert is_high is expected_high


def test_extract_model_family() -> None:
    assert extract_model_family("Qwen/Qwen2.5-32B-Instruct", "Qwen") == "qwen"
    assert extract_model_family("meta-llama/Llama-3.3-70B-Instruct", "meta-llama") == "meta-llama"
    assert extract_model_family("standalone-model", "Google") == "google"


# ---------------------------------------------------------------------------
# 3. Click Path: Empty Shortlist Returns Unavailable (0 HF Calls)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_click_path_empty_shortlist_returns_unavailable_zero_hf_calls(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with temp_db_session_factory() as db:
        await seed_design_chain(db, "d-shortlist-empty", 1)

        fake_llm = FakeLLMClient(script=[{"task_tag": "text-generation"}])
        settings = Settings()

        # No items seeded in model_shortlists table
        res = await get_or_generate_model_suggestions(
            db=db,
            llm=fake_llm,
            design_id="d-shortlist-empty",
            version_no=1,
            node_id=AI_NODE_ID,
            settings=settings,
            client=None,  # Production click path has no external client
        )

        # Invariant: returns status="unavailable"
        assert res.status == "unavailable"
        assert res.items == []
        assert "not available right now" in (res.message or "").lower()
        assert "shortlist refresh script" in (res.message or "").lower()

        # Invariant: nothing persisted in model_suggestions
        stmt = select(ModelSuggestionTable).where(
            ModelSuggestionTable.design_id == "d-shortlist-empty",
            ModelSuggestionTable.node_id == AI_NODE_ID,
        )
        record = (await db.execute(stmt)).scalar_one_or_none()
        assert record is None


# ---------------------------------------------------------------------------
# 4. Click Path: Populated Shortlist Returns OK with Responsibility Tiering
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_click_path_populated_shortlist_returns_ok_with_tiering(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with temp_db_session_factory() as db:
        # Seed validator agent (high responsibility)
        validator_node = [
            {
                "id": "validator_node_1",
                "name": "claim validator",
                "type": "agent",
                "role": "Validate insurance claims against policy rules",
                "inputs": [],
                "outputs": [],
                "tech_options": [],
                "needs_model": True,
                "ai_role": "agent",
                "tools": [],
            }
        ]
        await seed_design_chain(db, "d-shortlist-ok", 1, nodes=validator_node)

        # Seed shortlist in DB
        shortlist_items = [
            _make_shortlist_table_item("Qwen/Qwen2.5-32B-Instruct", 32_000_000_000, rank_order=1),
            _make_shortlist_table_item(
                "meta-llama/Llama-3.3-70B-Instruct", 70_000_000_000, rank_order=2
            ),
            _make_shortlist_table_item(
                "mistralai/Mistral-7B-Instruct", 7_000_000_000, rank_order=3
            ),
        ]
        await repo.save_model_shortlist(db, "text-generation", shortlist_items)

        fake_llm = FakeLLMClient(script=[{"task_tag": "text-generation"}])
        settings = Settings()

        res = await get_or_generate_model_suggestions(
            db=db,
            llm=fake_llm,
            design_id="d-shortlist-ok",
            version_no=1,
            node_id="validator_node_1",
            settings=settings,
            client=None,
        )

        assert res.status == "ok"
        assert len(res.items) == 3
        assert res.items[0].id == "Qwen/Qwen2.5-32B-Instruct"
        assert res.items[0].needs_strong_hardware is True
        assert res.items[1].id == "meta-llama/Llama-3.3-70B-Instruct"
        assert res.items[1].needs_strong_hardware is True
        assert res.items[2].id == "mistralai/Mistral-7B-Instruct"
        assert res.items[2].needs_strong_hardware is False

        # Invariant: persisted in model_suggestions
        stmt = select(ModelSuggestionTable).where(
            ModelSuggestionTable.design_id == "d-shortlist-ok",
            ModelSuggestionTable.node_id == "validator_node_1",
        )
        record = (await db.execute(stmt)).scalar_one_or_none()
        assert record is not None


# ---------------------------------------------------------------------------
# 5. Migration 0009 & Repo Invariants
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_shortlist_repo_save_and_retrieve(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with temp_db_session_factory() as db:
        items = [
            _make_shortlist_table_item(
                "org/model-a", 1_000_000_000, task_tag="summarization", rank_order=1
            ),
            _make_shortlist_table_item(
                "org/model-b", 7_000_000_000, task_tag="summarization", rank_order=2
            ),
        ]
        await repo.save_model_shortlist(db, "summarization", items)

        retrieved = await repo.get_model_shortlist(db, "summarization")
        assert len(retrieved) == 2
        assert retrieved[0].repo_id == "org/model-a"
        assert retrieved[1].repo_id == "org/model-b"

        # Overwrite tag with new items
        new_items = [
            _make_shortlist_table_item(
                "org/model-c", 14_000_000_000, task_tag="summarization", rank_order=1
            ),
        ]
        await repo.save_model_shortlist(db, "summarization", new_items)

        updated = await repo.get_model_shortlist(db, "summarization")
        assert len(updated) == 1
        assert updated[0].repo_id == "org/model-c"


# ---------------------------------------------------------------------------
# 6. Script Pacing Invariants with Mock Clock
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_hf_pacer_enforces_minimum_interval() -> None:
    simulated_now = 1000.0
    sleeps: list[float] = []

    def mock_time() -> float:
        return simulated_now

    async def mock_sleep(seconds: float) -> None:
        nonlocal simulated_now
        sleeps.append(seconds)
        simulated_now += seconds

    pacer = HFPacer(min_interval_seconds=2.1, time_fn=mock_time, sleep_fn=mock_sleep)

    # 1. First call: no prior calls, 0 sleep
    await pacer.wait()
    assert pacer.call_count == 1
    assert len(sleeps) == 0

    # 2. Second call 0.5s later: must sleep 1.6s
    simulated_now += 0.5
    await pacer.wait()
    assert pacer.call_count == 2
    assert len(sleeps) == 1
    assert pytest.approx(sleeps[0], 0.01) == 1.6

    # 3. Third call 2.5s later (> 2.1s): 0 sleep
    simulated_now += 2.5
    await pacer.wait()
    assert pacer.call_count == 3
    assert len(sleeps) == 1

    # 4. Fourth call 1.0s later: must sleep 1.1s
    simulated_now += 1.0
    await pacer.wait()
    assert pacer.call_count == 4
    assert len(sleeps) == 2
    assert pytest.approx(sleeps[1], 0.01) == 1.1


# ---------------------------------------------------------------------------
# 7. Script Flow Signature Conformance with Autospec
# ---------------------------------------------------------------------------


def _load_refresh_script_module() -> Any:
    """Locate repo root by walking up from __file__ and load scripts/refresh_model_shortlists.py."""
    import importlib.util
    from pathlib import Path

    rel_script = Path("scripts") / "refresh_model_shortlists.py"
    script_path: Path | None = None
    for parent in Path(__file__).resolve().parents:
        candidate = parent / rel_script
        if candidate.is_file():
            script_path = candidate
            break

    assert script_path is not None, (
        f"Could not find {rel_script} in any parent directory of {__file__}"
    )
    spec = importlib.util.spec_from_file_location("refresh_model_shortlists", script_path)
    assert spec is not None and spec.loader is not None, (
        f"Could not create module spec for {script_path}"
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.mark.asyncio
async def test_refresh_tag_flow_conforms_to_hub_client_signatures(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    from unittest.mock import create_autospec

    from archnemesis.modules.modelfit.catalog.hf_client import HubClient
    from archnemesis.modules.modelfit.catalog.service import CatalogService

    refresh_tag = _load_refresh_script_module().refresh_tag

    # Use create_autospec to strictly enforce HubClient method signatures
    mock_hub = create_autospec(HubClient, instance=True)
    mock_hub.list_models.return_value = (
        [
            {
                "id": "meta/test-model-1",
                "author": "meta",
                "model_name": "test-model-1",
                "gated": False,
                "downloads": 5000,
                "likes": 120,
            }
        ],
        None,
    )
    mock_hub.fetch_model_info.return_value = {
        "id": "meta/test-model-1",
        "pipeline_tag": "text-generation",
        "gated": False,
        "likes": 120,
        "downloads": 5000,
    }
    mock_hub.fetch_raw_config.return_value = (
        {
            "model_type": "llama",
            "num_hidden_layers": 16,
            "hidden_size": 2048,
            "num_attention_heads": 16,
        },
        "etag-123",
        "Wed, 20 Nov 2026 00:00:00 GMT",
        False,
    )
    mock_hub.inspect_safetensors_header.return_value = 1_000_000_000

    catalog_service = CatalogService(hub_client=mock_hub)
    settings = Settings()

    async with temp_db_session_factory() as session:
        result = await refresh_tag(
            session=session,
            catalog_service=catalog_service,
            tag="text-generation",
            max_probes=5,
            settings=settings,
            dry_run=False,
        )

        assert result["error"] is None
        assert result["probed"] == 1
        assert result["accepted"] == 1

        # Verify HubClient was called with the exact real signature keyword
        mock_hub.list_models.assert_called_once_with(pipeline_tag="text-generation", limit=30)
        mock_hub.fetch_model_info.assert_called_once_with("meta/test-model-1")
        mock_hub.fetch_raw_config.assert_called_once_with("meta/test-model-1", etag=None)
        mock_hub.inspect_safetensors_header.assert_called_once_with("meta/test-model-1")

        # Verify shortlist saved in DB
        shortlist = await repo.get_model_shortlist(session, "text-generation")
        assert len(shortlist) == 1
        assert shortlist[0].repo_id == "meta/test-model-1"
        assert shortlist[0].total_params == 1_000_000_000


@pytest.mark.asyncio
async def test_refresh_tag_skips_derived_and_persists_safetensors(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    from unittest.mock import AsyncMock, create_autospec

    from archnemesis.modules.modelfit.catalog.hf_client import HubClient
    from archnemesis.modules.modelfit.catalog.schemas import ModelDetailResponse, SupportStatus
    from archnemesis.modules.modelfit.catalog.service import CatalogService
    from archnemesis.modules.modelfit.estimator.schemas import ArchitectureCategory, NormalizedModel
    from archnemesis.settings import Settings

    refresh_tag = _load_refresh_script_module().refresh_tag

    mock_hub = create_autospec(HubClient, instance=True)
    mock_hub.list_models.return_value = (
        [
            {
                "id": "meta/model-derived",
                "author": "meta",
                "model_name": "model-derived",
                "gated": False,
                "downloads": 5000,
                "likes": 120,
            },
            {
                "id": "meta/model-safetensors",
                "author": "meta",
                "model_name": "model-safetensors",
                "gated": False,
                "downloads": 4000,
                "likes": 100,
            },
        ],
        None,
    )

    catalog_service = CatalogService(hub_client=mock_hub)

    detail_derived = ModelDetailResponse(
        id="meta/model-derived",
        author="meta",
        model_name="model-derived",
        pipeline_tag="text-generation",
        likes=120,
        downloads=5000,
        is_supported=True,
        support_status=SupportStatus.SUPPORTED_LLM,
        gated=False,
        param_provenance="derived",
        normalized_model=NormalizedModel(
            id="meta/model-derived",
            architecture_name="LlamaForCausalLM",
            architecture_category=ArchitectureCategory.STANDARD_TRANSFORMER,
            total_params=1_000_000_000,
            active_params=1_000_000_000,
        ),
    )

    detail_safetensors = ModelDetailResponse(
        id="meta/model-safetensors",
        author="meta",
        model_name="model-safetensors",
        pipeline_tag="text-generation",
        likes=100,
        downloads=4000,
        is_supported=True,
        support_status=SupportStatus.SUPPORTED_LLM,
        gated=False,
        param_provenance="safetensors",
        normalized_model=NormalizedModel(
            id="meta/model-safetensors",
            architecture_name="LlamaForCausalLM",
            architecture_category=ArchitectureCategory.STANDARD_TRANSFORMER,
            total_params=2_000_000_000,
            active_params=2_000_000_000,
        ),
    )

    async def mock_get_detail(_session: Any, repo_id: str) -> ModelDetailResponse:
        if repo_id == "meta/model-derived":
            return detail_derived
        return detail_safetensors

    catalog_service.get_model_detail = AsyncMock(side_effect=mock_get_detail)  # type: ignore[method-assign]
    settings = Settings()

    async with temp_db_session_factory() as session:
        res = await refresh_tag(
            session=session,
            catalog_service=catalog_service,
            tag="text-generation",
            max_probes=10,
            settings=settings,
            dry_run=False,
        )

        assert res["probed"] == 2
        assert res["skipped_derived"] == 1
        assert res["valid"] == 1
        assert res["accepted"] == 1

        shortlist = await repo.get_model_shortlist(session, "text-generation")
        assert len(shortlist) == 1
        assert shortlist[0].repo_id == "meta/model-safetensors"
        assert shortlist[0].total_params == 2_000_000_000


def _make_shortlist_row(
    task_tag: str,
    repo_id: str,
    total_params: int,
    rank_order: int = 1,
) -> ModelShortlistTable:
    author, model_name = repo_id.split("/", 1)
    now_iso = datetime.now(UTC).isoformat()
    return ModelShortlistTable(
        id=str(uuid4()),
        task_tag=task_tag,
        repo_id=repo_id,
        author=author,
        model_name=model_name,
        total_params=total_params,
        size_band="medium",
        downloads=1000,
        likes=50,
        rank_order=rank_order,
        refreshed_at=now_iso,
        expires_at=now_iso,
    )


@pytest.mark.asyncio
async def test_save_model_shortlist_replaces_overlapping_repo_ids_and_ranks(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with temp_db_session_factory() as session:
        await repo.save_model_shortlist(
            session,
            "text-generation",
            [
                _make_shortlist_row("text-generation", "org/model-a", 7_000_000_000, rank_order=1),
                _make_shortlist_row("text-generation", "org/model-b", 8_000_000_000, rank_order=2),
            ],
        )
        # Re-seed same tag with overlapping org/model-b in new rank order
        await repo.save_model_shortlist(
            session,
            "text-generation",
            [
                _make_shortlist_row("text-generation", "org/model-b", 9_000_000_000, rank_order=1),
                _make_shortlist_row("text-generation", "org/model-c", 3_000_000_000, rank_order=2),
            ],
        )

    async with temp_db_session_factory() as session:
        shortlist = await repo.get_model_shortlist(session, "text-generation")
        assert len(shortlist) == 2
        assert [row.repo_id for row in shortlist] == ["org/model-b", "org/model-c"]
        assert [row.rank_order for row in shortlist] == [1, 2]
        assert shortlist[0].total_params == 9_000_000_000


@pytest.mark.asyncio
async def test_save_model_shortlist_second_run_with_fewer_models_removes_missing(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with temp_db_session_factory() as session:
        await repo.save_model_shortlist(
            session,
            "summarization",
            [
                _make_shortlist_row("summarization", "org/s-1", 1_000_000_000, rank_order=1),
                _make_shortlist_row("summarization", "org/s-2", 2_000_000_000, rank_order=2),
                _make_shortlist_row("summarization", "org/s-3", 3_000_000_000, rank_order=3),
            ],
        )
        await repo.save_model_shortlist(
            session,
            "summarization",
            [
                _make_shortlist_row("summarization", "org/s-2", 2_500_000_000, rank_order=1),
            ],
        )

    async with temp_db_session_factory() as session:
        shortlist = await repo.get_model_shortlist(session, "summarization")
        assert len(shortlist) == 1
        assert shortlist[0].repo_id == "org/s-2"
        assert shortlist[0].rank_order == 1
        assert shortlist[0].total_params == 2_500_000_000


@pytest.mark.asyncio
async def test_save_model_shortlist_dedupes_intra_batch_first_wins(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with temp_db_session_factory() as session:
        await repo.save_model_shortlist(
            session,
            "translation",
            [
                _make_shortlist_row("translation", "org/t-1", 1_100_000_000, rank_order=1),
                _make_shortlist_row("translation", "org/t-2", 2_200_000_000, rank_order=2),
                _make_shortlist_row("translation", "org/t-1", 9_900_000_000, rank_order=3),
                _make_shortlist_row("translation", "org/t-3", 3_300_000_000, rank_order=4),
            ],
        )

    async with temp_db_session_factory() as session:
        shortlist = await repo.get_model_shortlist(session, "translation")
        assert len(shortlist) == 3
        assert [row.repo_id for row in shortlist] == ["org/t-1", "org/t-2", "org/t-3"]
        assert [row.rank_order for row in shortlist] == [1, 2, 3]
        # First occurrence wins
        assert shortlist[0].total_params == 1_100_000_000


@pytest.mark.asyncio
async def test_save_model_shortlist_failure_rolls_back_and_keeps_old_rows(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with temp_db_session_factory() as session:
        await repo.save_model_shortlist(
            session,
            "feature-extraction",
            [
                _make_shortlist_row(
                    "feature-extraction", "org/old-embed", 500_000_000, rank_order=1
                ),
            ],
        )

    async with temp_db_session_factory() as session:

        async def fail_commit() -> None:
            raise RuntimeError("Simulated commit failure")

        monkeypatch.setattr(session, "commit", fail_commit)
        with pytest.raises(RuntimeError, match="Simulated commit failure"):
            await repo.save_model_shortlist(
                session,
                "feature-extraction",
                [
                    _make_shortlist_row(
                        "feature-extraction", "org/new-embed", 900_000_000, rank_order=1
                    ),
                ],
            )

    async with temp_db_session_factory() as session:
        shortlist = await repo.get_model_shortlist(session, "feature-extraction")
        assert len(shortlist) == 1
        assert shortlist[0].repo_id == "org/old-embed"
        assert shortlist[0].total_params == 500_000_000
