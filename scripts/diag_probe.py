"""Diagnostic script to inspect Hugging Face API and safetensors metadata shapes.

Run from apps/api:
    uv run python ../../scripts/diag_probe.py

Checks 4 target repositories:
- Qwen/Qwen3-14B
- openai/gpt-oss-20b
- Qwen/Qwen3-0.6B
- stabilityai/stable-diffusion-xl-base-1.0

Measures:
1. Model-info HTTP status & whether top-level 'safetensors' dict has 'total'
2. Whether 'model.safetensors.index.json' exists (status code only)
3. Whether 'model.safetensors' single-file range request succeeds or fails
"""

import asyncio
from pathlib import Path
import sys

# Ensure apps/api/src is in sys.path
SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
API_SRC = REPO_ROOT / "apps" / "api" / "src"
if str(API_SRC) not in sys.path:
    sys.path.insert(0, str(API_SRC))

from archnemesis.errors import AppError  # noqa: E402
from archnemesis.modules.modelfit.catalog.hf_client import (  # noqa: E402
    HF_API_BASE,
    HF_HUB_BASE,
    HFPacer,
    HubClient,
)

TARGET_REPOS = [
    "Qwen/Qwen3-14B",
    "openai/gpt-oss-20b",
    "Qwen/Qwen3-0.6B",
    "stabilityai/stable-diffusion-xl-base-1.0",
]


async def probe_repo(repo_id: str, hub_client: HubClient, pacer: HFPacer) -> dict[str, str | int | None]:
    info_status: int | None = None
    safetensors_total: int | None = None
    index_status: int | None = None
    single_safetensors_status: int | None = None
    failing_step: str = "None (succeeded)"

    # Step 1: Model info (/api/models/{repo_id})
    await pacer.wait()
    info_url = f"{HF_API_BASE}/models/{repo_id}"
    try:
        resp = await hub_client._request("GET", info_url)
        info_status = resp.status_code
        try:
            data = resp.json()
            if isinstance(data, dict):
                st_dict = data.get("safetensors")
                if isinstance(st_dict, dict) and "total" in st_dict:
                    safetensors_total = int(st_dict["total"])
        except Exception:
            pass
    except AppError as exc:
        info_status = exc.status_code
        failing_step = f"model-info ({exc.status_code}: {exc.code})"

    # Step 2: model.safetensors.index.json (for sharded models)
    await pacer.wait()
    index_url = f"{HF_HUB_BASE}/{repo_id}/resolve/main/model.safetensors.index.json"
    try:
        resp = await hub_client._request(
            "GET",
            index_url,
            headers={"Range": "bytes=0-1024"},
            allowed_status_codes=(200, 206),
        )
        index_status = resp.status_code
    except AppError as exc:
        index_status = exc.status_code

    # Step 3: model.safetensors (single-file range request bytes 0-7)
    await pacer.wait()
    single_url = f"{HF_HUB_BASE}/{repo_id}/resolve/main/model.safetensors"
    try:
        resp = await hub_client._request(
            "GET",
            single_url,
            headers={"Range": "bytes=0-7"},
            allowed_status_codes=(200, 206),
        )
        single_safetensors_status = resp.status_code
    except AppError as exc:
        single_safetensors_status = exc.status_code
        if failing_step == "None (succeeded)":
            failing_step = f"model.safetensors range probe ({exc.status_code}: {exc.code})"

    return {
        "repo_id": repo_id,
        "info_status": info_status,
        "safetensors_total": safetensors_total,
        "index_status": index_status,
        "single_safetensors_status": single_safetensors_status,
        "failing_step": failing_step,
    }


async def main() -> None:
    print("=" * 70)
    print("HF METADATA & SAFETENSORS PROBE DIAGNOSTIC")
    print(f"Pacing: 2.1s per network call across {len(TARGET_REPOS)} repos")
    print("=" * 70)

    hub_client = HubClient()
    pacer = HFPacer(min_interval_seconds=2.1)

    results = []
    for repo_id in TARGET_REPOS:
        print(f"\nProbing {repo_id}...")
        res = await probe_repo(repo_id, hub_client, pacer)
        print(f"  - Model-info status:             {res['info_status']}")
        print(f"  - safetensors.total in info:     {res['safetensors_total']}")
        print(f"  - model.safetensors.index.json:  {res['index_status']}")
        print(f"  - model.safetensors (single):    {res['single_safetensors_status']}")
        print(f"  - Failing step in current code:  {res['failing_step']}")
        results.append(res)

    print("\n" + "=" * 70)
    print("SUMMARY TABLE")
    print(f"{'Repo ID':<42} | {'Info':<5} | {'ST Total':<12} | {'Index':<5} | {'Failing Step'}")
    print("-" * 70)
    for r in results:
        st_disp = str(r["safetensors_total"]) if r["safetensors_total"] is not None else "None"
        print(
            f"{str(r['repo_id']):<42} | {str(r['info_status']):<5} | {st_disp:<12} | {str(r['index_status']):<5} | {r['failing_step']}"
        )
    print("=" * 70)
    print(f"Total calls: {pacer.call_count}")


if __name__ == "__main__":
    asyncio.run(main())
