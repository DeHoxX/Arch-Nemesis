"""Unit tests for the hardware repository and service."""

import json
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from archnemesis.db.tables import Base
from archnemesis.modules.modelfit.hardware.schemas import CustomHardwareInput
from archnemesis.modules.modelfit.hardware.service import HardwareService


@pytest.fixture
async def mem_db_session() -> AsyncIterator[AsyncSession]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sm = async_sessionmaker(engine, expire_on_commit=False)
    async with sm() as session:
        yield session
    await engine.dispose()


@pytest.mark.asyncio
async def test_seed_and_list_profiles(mem_db_session: AsyncSession) -> None:
    svc = HardwareService()

    presets_path = (
        Path(__file__).parents[3]
        / "src"
        / "archnemesis"
        / "modules"
        / "modelfit"
        / "hardware"
        / "seeds"
        / "hardware_presets.json"
    )
    expected_presets = json.loads(presets_path.read_text(encoding="utf-8"))
    expected_count = len(expected_presets)

    count = await svc.seed_default_presets(mem_db_session)
    assert count == expected_count

    profiles = await svc.list_profiles(mem_db_session)
    assert len(profiles) == expected_count
    names = [p.name for p in profiles]
    assert "NVIDIA GeForce RTX 4090" in names

    # Assert seeding twice does not duplicate records (idempotency)
    second_count = await svc.seed_default_presets(mem_db_session)
    assert second_count == expected_count
    profiles_after = await svc.list_profiles(mem_db_session)
    assert len(profiles_after) == expected_count


def test_custom_hardware_input_conversion() -> None:
    custom = CustomHardwareInput(name="My Workstation", memory_gib=16.0, reserved_memory_gib=1.0)
    profile = custom.to_hardware_profile_input()

    assert profile.name == "My Workstation"
    assert profile.memory_bytes == 16 * 1024 * 1024 * 1024
    assert profile.reserved_memory_bytes == 1 * 1024 * 1024 * 1024
    assert profile.is_preset is False
