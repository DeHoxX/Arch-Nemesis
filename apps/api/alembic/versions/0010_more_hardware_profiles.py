"""Seed 26 vendor-verified hardware profiles into hardware_profiles.

Revision ID: 0010_more_hardware_profiles
Revises: 0009_model_shortlists
Create Date: 2026-11-26 00:00:00.000000

"""

import uuid
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import TypedDict

import sqlalchemy as sa
from sqlalchemy.sql import table

from alembic import op

revision: str = "0010_more_hardware_profiles"
down_revision: str | None = "0009_model_shortlists"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

GIB = 1024 * 1024 * 1024

URL_RTX_30 = "https://www.nvidia.com/en-ph/geforce/graphics-cards/30-series/modules/"
URL_RTX_40_50 = "https://www.nvidia.com/en-us/geforce/graphics-cards/compare"
URL_A10 = "https://www.nvidia.com/a10"
URL_H200 = "https://www.nvidia.com/en-au/data-center/h200/"
URL_V100 = "https://images.nvidia.com/content/technologies/volta/pdf/tesla-volta-v100-datasheet.pdf"
URL_MI300X = "https://amd.com/en/products/accelerators/instinct/mi300.html"
URL_ARC_A770 = "https://www.intel.com/content/www/us/en/products/sku/229151/specifications.html"
URL_L40S = "https://www.pny.com/File Library/Company/Support/Product Brochures/NVIDIA Data Center GPUs/l40s-datasheet.pdf"
URL_L4 = "https://www.pny.com/File Library/Company/Support/linecards/data-center-gpus/nvidia-data-center-gpu-linecard.pdf"
URL_APPLE = "https://www.apple.com/uk/mac/compare/"


class HardwareProfileSeed(TypedDict):
    name: str
    kind: str
    memory_gb: int
    reserved_gib: int
    source_url: str
    notes: str


NEW_HARDWARE_PROFILES: list[HardwareProfileSeed] = [
    # Consumer (14) — assumed reserve: 1 GiB
    {
        "name": "NVIDIA GeForce RTX 3070",
        "kind": "gpu",
        "memory_gb": 8,
        "reserved_gib": 1,
        "source_url": URL_RTX_30,
        "notes": "8 GB memory size from source URL. Reserved memory (1 GiB) is an assumption, not a vendor spec.",
    },
    {
        "name": "NVIDIA GeForce RTX 3080 10GB",
        "kind": "gpu",
        "memory_gb": 10,
        "reserved_gib": 1,
        "source_url": URL_RTX_30,
        "notes": "10 GB memory size from source URL. Reserved memory (1 GiB) is an assumption, not a vendor spec.",
    },
    {
        "name": "NVIDIA GeForce RTX 3080 12GB",
        "kind": "gpu",
        "memory_gb": 12,
        "reserved_gib": 1,
        "source_url": URL_RTX_30,
        "notes": "12 GB memory size from source URL. Reserved memory (1 GiB) is an assumption, not a vendor spec.",
    },
    {
        "name": "NVIDIA GeForce RTX 3090",
        "kind": "gpu",
        "memory_gb": 24,
        "reserved_gib": 1,
        "source_url": URL_RTX_30,
        "notes": "24 GB memory size from source URL. Reserved memory (1 GiB) is an assumption, not a vendor spec.",
    },
    {
        "name": "NVIDIA GeForce RTX 4060",
        "kind": "gpu",
        "memory_gb": 8,
        "reserved_gib": 1,
        "source_url": URL_RTX_40_50,
        "notes": "8 GB memory size from source URL. Reserved memory (1 GiB) is an assumption, not a vendor spec.",
    },
    {
        "name": "NVIDIA GeForce RTX 4060 Ti 8GB",
        "kind": "gpu",
        "memory_gb": 8,
        "reserved_gib": 1,
        "source_url": URL_RTX_40_50,
        "notes": "8 GB memory size from source URL. Reserved memory (1 GiB) is an assumption, not a vendor spec.",
    },
    {
        "name": "NVIDIA GeForce RTX 4060 Ti 16GB",
        "kind": "gpu",
        "memory_gb": 16,
        "reserved_gib": 1,
        "source_url": URL_RTX_40_50,
        "notes": "16 GB memory size from source URL. Reserved memory (1 GiB) is an assumption, not a vendor spec.",
    },
    {
        "name": "NVIDIA GeForce RTX 4070",
        "kind": "gpu",
        "memory_gb": 12,
        "reserved_gib": 1,
        "source_url": URL_RTX_40_50,
        "notes": "12 GB memory size from source URL. Reserved memory (1 GiB) is an assumption, not a vendor spec.",
    },
    {
        "name": "NVIDIA GeForce RTX 4070 Ti Super",
        "kind": "gpu",
        "memory_gb": 16,
        "reserved_gib": 1,
        "source_url": URL_RTX_40_50,
        "notes": "16 GB memory size from source URL. Reserved memory (1 GiB) is an assumption, not a vendor spec.",
    },
    {
        "name": "NVIDIA GeForce RTX 4080",
        "kind": "gpu",
        "memory_gb": 16,
        "reserved_gib": 1,
        "source_url": URL_RTX_40_50,
        "notes": "16 GB memory size from source URL. Reserved memory (1 GiB) is an assumption, not a vendor spec.",
    },
    {
        "name": "NVIDIA GeForce RTX 5070",
        "kind": "gpu",
        "memory_gb": 12,
        "reserved_gib": 1,
        "source_url": URL_RTX_40_50,
        "notes": "12 GB memory size from source URL. Reserved memory (1 GiB) is an assumption, not a vendor spec.",
    },
    {
        "name": "NVIDIA GeForce RTX 5080",
        "kind": "gpu",
        "memory_gb": 16,
        "reserved_gib": 1,
        "source_url": URL_RTX_40_50,
        "notes": "16 GB memory size from source URL. Reserved memory (1 GiB) is an assumption, not a vendor spec.",
    },
    {
        "name": "NVIDIA GeForce RTX 5090",
        "kind": "gpu",
        "memory_gb": 32,
        "reserved_gib": 1,
        "source_url": URL_RTX_40_50,
        "notes": "32 GB memory size from source URL. Reserved memory (1 GiB) is an assumption, not a vendor spec.",
    },
    {
        "name": "Intel Arc A770 16GB",
        "kind": "gpu",
        "memory_gb": 16,
        "reserved_gib": 1,
        "source_url": URL_ARC_A770,
        "notes": "16 GB memory size from source URL. Reserved memory (1 GiB) is an assumption, not a vendor spec.",
    },
    # Datacenter (7) — assumed reserve: 0 GiB
    {
        "name": "NVIDIA A10",
        "kind": "gpu",
        "memory_gb": 24,
        "reserved_gib": 0,
        "source_url": URL_A10,
        "notes": "24 GB memory size from source URL. Reserved memory (0 GiB) is an assumption, not a vendor spec.",
    },
    {
        "name": "NVIDIA L4",
        "kind": "gpu",
        "memory_gb": 24,
        "reserved_gib": 0,
        "source_url": URL_L4,
        "notes": "24 GB memory size from source URL (partner linecard). Reserved memory (0 GiB) is an assumption, not a vendor spec.",
    },
    {
        "name": "NVIDIA L40S",
        "kind": "gpu",
        "memory_gb": 48,
        "reserved_gib": 0,
        "source_url": URL_L40S,
        "notes": "48 GB memory size from source URL (partner copy of the NVIDIA datasheet). Reserved memory (0 GiB) is an assumption, not a vendor spec.",
    },
    {
        "name": "NVIDIA V100 16GB",
        "kind": "gpu",
        "memory_gb": 16,
        "reserved_gib": 0,
        "source_url": URL_V100,
        "notes": "16 GB memory size from source URL. Reserved memory (0 GiB) is an assumption, not a vendor spec.",
    },
    {
        "name": "NVIDIA V100 32GB",
        "kind": "gpu",
        "memory_gb": 32,
        "reserved_gib": 0,
        "source_url": URL_V100,
        "notes": "32 GB memory size from source URL. Reserved memory (0 GiB) is an assumption, not a vendor spec.",
    },
    {
        "name": "NVIDIA H200",
        "kind": "gpu",
        "memory_gb": 141,
        "reserved_gib": 0,
        "source_url": URL_H200,
        "notes": "141 GB memory size from source URL. Reserved memory (0 GiB) is an assumption, not a vendor spec.",
    },
    {
        "name": "AMD Instinct MI300X",
        "kind": "gpu",
        "memory_gb": 192,
        "reserved_gib": 0,
        "source_url": URL_MI300X,
        "notes": "192 GB memory size from source URL. Reserved memory (0 GiB) is an assumption, not a vendor spec.",
    },
    # Apple Unified (5) — assumed reserve: 3 GiB for 8GB, 4 GiB for 24GB and above
    {
        "name": "Apple Silicon 8GB Unified",
        "kind": "apple_unified",
        "memory_gb": 8,
        "reserved_gib": 3,
        "source_url": URL_APPLE,
        "notes": "8 GB memory size from source URL. Reserved memory (3 GiB) is an assumption, not a vendor spec.",
    },
    {
        "name": "Apple Silicon 24GB Unified",
        "kind": "apple_unified",
        "memory_gb": 24,
        "reserved_gib": 4,
        "source_url": URL_APPLE,
        "notes": "24 GB memory size from source URL. Reserved memory (4 GiB) is an assumption, not a vendor spec.",
    },
    {
        "name": "Apple Silicon 64GB Unified",
        "kind": "apple_unified",
        "memory_gb": 64,
        "reserved_gib": 4,
        "source_url": URL_APPLE,
        "notes": "64 GB memory size from source URL. Reserved memory (4 GiB) is an assumption, not a vendor spec.",
    },
    {
        "name": "Apple Silicon 96GB Unified",
        "kind": "apple_unified",
        "memory_gb": 96,
        "reserved_gib": 4,
        "source_url": URL_APPLE,
        "notes": "96 GB memory size from source URL. Reserved memory (4 GiB) is an assumption, not a vendor spec.",
    },
    {
        "name": "Apple Silicon 128GB Unified",
        "kind": "apple_unified",
        "memory_gb": 128,
        "reserved_gib": 4,
        "source_url": URL_APPLE,
        "notes": "128 GB memory size from source URL. Reserved memory (4 GiB) is an assumption, not a vendor spec.",
    },
]


def _hardware_profiles_table() -> sa.Table:
    return table(
        "hardware_profiles",
        sa.Column("id", sa.String(length=36)),
        sa.Column("name", sa.String(length=100)),
        sa.Column("kind", sa.String(length=30)),
        sa.Column("memory_bytes", sa.BigInteger()),
        sa.Column("reserved_memory_bytes", sa.BigInteger()),
        sa.Column("source_url", sa.String(length=500)),
        sa.Column("is_verified", sa.Boolean()),
        sa.Column("notes", sa.Text()),
        sa.Column("created_at", sa.String(length=30)),
        sa.Column("updated_at", sa.String(length=30)),
    )


def upgrade() -> None:
    bind = op.get_bind()
    hardware_table = _hardware_profiles_table()

    existing_rows = bind.execute(sa.select(hardware_table.c.name)).fetchall()
    existing_names = {row[0] for row in existing_rows}

    now_iso = datetime.now(UTC).isoformat()
    rows_to_insert = []
    for item in NEW_HARDWARE_PROFILES:
        if item["name"] in existing_names:
            continue
        rows_to_insert.append(
            {
                "id": uuid.uuid4().hex,
                "name": item["name"],
                "kind": item["kind"],
                "memory_bytes": item["memory_gb"] * GIB,
                "reserved_memory_bytes": item["reserved_gib"] * GIB,
                "source_url": item["source_url"],
                # Reserved memory is an explicit assumption rather than a vendor spec.
                "is_verified": False,
                "notes": item["notes"],
                "created_at": now_iso,
                "updated_at": now_iso,
            }
        )

    if rows_to_insert:
        op.bulk_insert(hardware_table, rows_to_insert)


def downgrade() -> None:
    hardware_table = _hardware_profiles_table()
    names = [item["name"] for item in NEW_HARDWARE_PROFILES]
    op.execute(hardware_table.delete().where(hardware_table.c.name.in_(names)))
