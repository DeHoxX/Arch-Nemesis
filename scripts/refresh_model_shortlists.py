"""Standalone CLI script to refresh pre-probed model shortlists in SQLite (Stage 1, D-422).

This script is run out-of-band by the operator or a periodic cron job.
It makes ZERO requests during normal user API click paths.

For each pipeline tag:
1. Queries Hugging Face for non-gated model candidates.
2. Probes details (info, raw config, safetensors headers) while pacing calls (min 2.1s).
3. Excludes gated models, null parameters, or failed probes.
4. Updates model_shortlists table in SQLite.
5. Prints progress, summary table, and elapsed time.
"""

import argparse
import asyncio
from datetime import UTC, datetime, timedelta
import os
from pathlib import Path
import sys
import time
from typing import Any, Callable
from uuid import uuid4

# Ensure apps/api/src is in sys.path
SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
API_SRC = REPO_ROOT / "apps" / "api" / "src"
if str(API_SRC) not in sys.path:
    sys.path.insert(0, str(API_SRC))

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from archnemesis.db.engine import create_engine_and_session
from archnemesis.db.tables import ModelShortlistTable
from archnemesis.errors import AppError
from archnemesis.modules.modelfit.catalog.hf_client import HFPacer, HubClient
from archnemesis.modules.modelfit.catalog.service import CatalogService
from archnemesis.modules.models import repo
from archnemesis.modules.models.selection import classify_size_band
from archnemesis.modules.models.tags import CLOSED_PIPELINE_TAGS
from archnemesis.settings import get_settings


async def refresh_tag(
    session: AsyncSession,
    catalog_service: CatalogService,
    tag: str,
    max_probes: int,
    settings: Any,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Probe candidates and persist shortlist for a single pipeline tag."""
    print(f"\n--- Refreshing Tag: {tag} ---")
    
    # 1. Fetch candidates from hub
    raw_models = []
    for attempt in range(3):
        try:
            raw_models, _ = await catalog_service.hub_client.list_models(
                pipeline_tag=tag, limit=30
            )
            break
        except Exception as exc:
            is_net_err = False
            if isinstance(exc, AppError) and exc.code == "UPSTREAM_UNAVAILABLE":
                is_net_err = True
            elif isinstance(exc, (httpx.RequestError, OSError, ConnectionError)):
                is_net_err = True

            if is_net_err and attempt < 2:
                print(f"  [RETRY] Tag '{tag}' list_models network error ({exc}), retrying in 5s (attempt {attempt + 1}/2)...")
                await asyncio.sleep(5)
                continue
            print(f"  [ERROR] Failed to list models for tag '{tag}': {exc}")
            return {
                "tag": tag,
                "probed": 0,
                "valid": 0,
                "skipped_derived": 0,
                "gated": 0,
                "errors": 1,
                "accepted": 0,
                "high_count": 0,
                "medium_count": 0,
                "small_count": 0,
                "error": str(exc),
            }

    # Filter out gated items from listing
    open_candidates = [
        m for m in raw_models
        if isinstance(m, dict) and m.get("gated") is False and (m.get("id") or m.get("modelId"))
    ]
    # Sort by downloads desc, likes desc
    open_candidates.sort(
        key=lambda m: (
            -int(m.get("downloads", 0) if isinstance(m.get("downloads"), (int, float)) else 0),
            -int(m.get("likes", 0) if isinstance(m.get("likes"), (int, float)) else 0),
            m.get("id") or m.get("modelId", ""),
        )
    )

    print(f"  Found {len(open_candidates)} non-gated candidates. Probing up to {max_probes}...")

    valid_items: list[dict[str, Any]] = []
    probed_count = 0
    skipped_derived_count = 0
    gated_count = 0
    errors_count = 0

    for cand in open_candidates[:max_probes]:
        repo_id = cand.get("id") or cand.get("modelId", "")
        probed_count += 1
        detail = None
        for attempt in range(3):
            try:
                detail = await catalog_service.get_model_detail(session, repo_id)
                break
            except Exception as exc:
                is_net_err = False
                if isinstance(exc, AppError) and exc.code == "UPSTREAM_UNAVAILABLE":
                    is_net_err = True
                elif isinstance(exc, (httpx.RequestError, OSError, ConnectionError)):
                    is_net_err = True

                if is_net_err and attempt < 2:
                    print(f"    [RETRY] {repo_id}: network error ({exc}), retrying in 5s (attempt {attempt + 1}/2)...")
                    await asyncio.sleep(5)
                    continue
                else:
                    errors_count += 1
                    print(f"    [ERROR] {repo_id}: probe failed: {exc}")
                    break

        if detail is None:
            continue

        if detail.gated:
            gated_count += 1
            print(f"    [SKIP] {repo_id}: gated repository")
            continue

        if detail.param_provenance == "derived":
            skipped_derived_count += 1
            print(f"    [SKIP] {repo_id}: derived parameter provenance")
            continue

        normalized = detail.normalized_model
        if not normalized or normalized.total_params is None or normalized.total_params <= 0:
            print(f"    [SKIP] {repo_id}: missing or null total_params")
            continue

        total_params = normalized.total_params
        band = classify_size_band(
            total_params=total_params,
            small_max_params=settings.model_size_small_max_params,
            medium_max_params=settings.model_size_medium_max_params,
        )

        parts = repo_id.split("/", 1)
        author = parts[0] if len(parts) > 1 else "unknown"
        model_name = parts[1] if len(parts) > 1 else parts[0]

        downloads = int(cand.get("downloads", 0) if isinstance(cand.get("downloads"), (int, float)) else 0)
        likes = int(cand.get("likes", 0) if isinstance(cand.get("likes"), (int, float)) else 0)

        valid_items.append({
            "repo_id": repo_id,
            "author": author,
            "model_name": model_name,
            "task_tag": tag,
            "total_params": total_params,
            "size_band": band.value,
            "downloads": downloads,
            "likes": likes,
        })
        print(f"    [OK] {repo_id}: {band.value.upper()} ({total_params:,} params)")

    # Rank accepted models: 30B+ prioritized, then by downloads
    valid_items.sort(
        key=lambda x: (
            -(1 if x["total_params"] >= settings.model_size_high_responsibility_min_params else 0),
            -x["downloads"],
            -x["likes"],
            x["repo_id"],
        )
    )

    now_iso = datetime.now(UTC).isoformat()
    expires_iso = (datetime.now(UTC) + timedelta(days=7)).isoformat()

    table_rows: list[ModelShortlistTable] = []
    for rank, item in enumerate(valid_items, start=1):
        table_rows.append(
            ModelShortlistTable(
                id=str(uuid4()),
                task_tag=tag,
                repo_id=item["repo_id"],
                author=item["author"],
                model_name=item["model_name"],
                total_params=item["total_params"],
                size_band=item["size_band"],
                downloads=item["downloads"],
                likes=item["likes"],
                rank_order=rank,
                refreshed_at=now_iso,
                expires_at=expires_iso,
            )
        )

    save_error: str | None = None
    if not dry_run and table_rows:
        try:
            await repo.save_model_shortlist(session, tag, table_rows)
            print(f"  Persisted {len(table_rows)} models into shortlist for tag '{tag}'.")
        except Exception as exc:
            err_msg = f"{type(exc).__name__}: {str(exc)[:200]}"
            errors_count += 1
            save_error = err_msg
            print(f"  [ERROR] Save failed for tag '{tag}': {err_msg}")

    high_count = sum(
        1 for x in valid_items if x["total_params"] >= settings.model_size_high_responsibility_min_params
    )
    medium_count = sum(
        1 for x in valid_items if x["size_band"] == "medium"
    )
    small_count = sum(
        1 for x in valid_items if x["size_band"] == "small"
    )

    print(
        f"  Summary for tag '{tag}': valid={len(valid_items)}, "
        f"skipped_derived={skipped_derived_count}, gated={gated_count}, errors={errors_count}"
    )

    return {
        "tag": tag,
        "probed": probed_count,
        "valid": len(valid_items),
        "skipped_derived": skipped_derived_count,
        "gated": gated_count,
        "errors": errors_count,
        "accepted": len(valid_items),
        "high_count": high_count,
        "medium_count": medium_count,
        "small_count": small_count,
        "error": save_error,
    }


async def main() -> int:
    parser = argparse.ArgumentParser(
        description="Refresh model shortlists in SQLite with strict rate-limiting pacing."
    )
    parser.add_argument(
        "--tag",
        type=str,
        default=None,
        help="Optional specific pipeline tag to refresh (default: all closed pipeline tags)",
    )
    parser.add_argument(
        "--max-probes",
        type=int,
        default=10,
        help="Maximum model candidates to probe per pipeline tag (default: 10)",
    )
    parser.add_argument(
        "--pace-seconds",
        type=float,
        default=2.1,
        help="Minimum pacing interval in seconds between Hugging Face calls (default: 2.1)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Probe models without updating the database",
    )
    args = parser.parse_args()

    settings = get_settings()
    tags_to_process = [args.tag] if args.tag else CLOSED_PIPELINE_TAGS

    pacer = HFPacer(min_interval_seconds=args.pace_seconds)

    async def pace_hook(request: httpx.Request) -> None:
        await pacer.wait()

    http_client = httpx.AsyncClient(
        event_hooks={"request": [pace_hook]},
        follow_redirects=True,
    )
    hub_client = HubClient(client=http_client)
    catalog_service = CatalogService(hub_client=hub_client)

    engine, session_factory = create_engine_and_session()
    start_time = time.time()
    results: list[dict[str, Any]] = []

    print("=================================================================")
    print("      ARCH-NEMESIS MODEL SHORTLIST REFRESH (STAGE 1, D-422)      ")
    print("=================================================================")
    print(f"Tags to process   : {len(tags_to_process)}")
    print(f"Max probes per tag: {args.max_probes}")
    print(f"Pacing interval   : {args.pace_seconds}s per Hugging Face request")
    print(f"Dry run mode      : {args.dry_run}")
    print("=================================================================")

    try:
        async with session_factory() as session:
            for tag in tags_to_process:
                try:
                    res = await refresh_tag(
                        session=session,
                        catalog_service=catalog_service,
                        tag=tag,
                        max_probes=args.max_probes,
                        settings=settings,
                        dry_run=args.dry_run,
                    )
                except Exception as exc:
                    err_msg = f"{type(exc).__name__}: {str(exc)[:200]}"
                    print(f"  [ERROR] Unexpected failure for tag '{tag}': {err_msg}")
                    res = {
                        "tag": tag,
                        "probed": 0,
                        "valid": 0,
                        "skipped_derived": 0,
                        "gated": 0,
                        "errors": 1,
                        "accepted": 0,
                        "high_count": 0,
                        "medium_count": 0,
                        "small_count": 0,
                        "error": err_msg,
                    }
                results.append(res)
    finally:
        await http_client.aclose()
        await engine.dispose()

    elapsed = time.time() - start_time

    # Summary Table
    print("\n" + "=" * 92)
    print(
        f"{'Tag':<26} | {'Probed':<6} | {'Valid':<5} | {'Derived':<7} | {'Gated':<5} | {'Errors':<6} | {'30B+':<4} | {'Med':<4} | {'Small':<5}"
    )
    print("-" * 92)
    total_probed = 0
    total_valid = 0
    total_derived = 0
    total_gated = 0
    total_errors = 0
    for r in results:
        total_probed += r["probed"]
        total_valid += r["valid"]
        total_derived += r["skipped_derived"]
        total_gated += r["gated"]
        total_errors += r["errors"]
        print(
            f"{r['tag']:<26} | {r['probed']:<6} | {r['valid']:<5} | {r['skipped_derived']:<7} | "
            f"{r['gated']:<5} | {r['errors']:<6} | {r['high_count']:<4} | {r['medium_count']:<4} | {r['small_count']:<5}"
        )
    print("=" * 92)
    print(f"Total tags processed : {len(results)}")
    print(f"Total models probed  : {total_probed}")
    print(f"Total valid (kept)   : {total_valid}")
    print(f"Total skipped derived: {total_derived}")
    print(f"Total gated skipped  : {total_gated}")
    print(f"Total errors         : {total_errors}")
    print(f"Total HF HTTP calls  : {pacer.call_count}")
    print(f"Elapsed time         : {elapsed:.2f}s ({elapsed / 60:.2f} minutes)")
    print("=================================================================\n")

    failed_tags = [
        r for r in results if r.get("error") is not None or int(r.get("errors", 0)) > 0
    ]
    if failed_tags:
        print("FAILED TAGS SUMMARY:")
        for r in failed_tags:
            detail = r.get("error") or f"{r.get('errors', 0)} probe error(s)"
            print(f"  - {r['tag']}: {detail}")
        print("=================================================================\n")
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
