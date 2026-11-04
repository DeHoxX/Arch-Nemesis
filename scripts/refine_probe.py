"""On-demand probe script for verifying live Gemini refinement and suggestions.

This script is NOT part of check.ps1 or automated test suites.
It must be run manually against an active backend instance (e.g. http://127.0.0.1:8000).

NOTE: Each run of this probe consumes 2 refinement turns of that design and
writes rows to chat_messages and patches in the database.
It never calls accept, so the design's current_version and spec in the DB stay unchanged.
"""

import argparse
import contextlib
import sys
from typing import Any

import httpx

FIXED_CHAT_MESSAGE = "Add a human approval step before the final result"


def run_probe(design_id: str, base_url: str) -> int:
    """Execute live refinement chat and suggestions probes against running backend."""
    base = base_url.rstrip("/")
    client = httpx.Client(base_url=base, timeout=90.0)

    # 1. Chat probe
    chat_url = f"/api/designs/{design_id}/chat"
    try:
        chat_resp = client.post(chat_url, json={"message": FIXED_CHAT_MESSAGE})
        chat_status = chat_resp.status_code
        if chat_status == 200:
            chat_data: dict[str, Any] = chat_resp.json()
            patch = chat_data.get("patch")
            if patch is not None:
                patch_status = patch.get("status", "None")
                ops_count = patch.get("ops_count", 0)
                issue_codes = [i.get("code") for i in patch.get("issues", [])]
            else:
                patch_status = "None"
                ops_count = 0
                issue_codes = []

            print("=== Refinement Probe: Chat ===")
            print(f"HTTP Status: {chat_status}")
            print("Error Code: None")
            print(f"Patch Status: {patch_status}")
            print(f"Ops Count: {ops_count}")
            print(f"Issue Codes: {issue_codes}")
        else:
            err_code = "UNKNOWN"
            with contextlib.suppress(ValueError):
                err_payload = chat_resp.json()
                if isinstance(err_payload, dict) and isinstance(err_payload.get("error"), dict):
                    extracted = err_payload["error"].get("code")
                    if isinstance(extracted, str):
                        err_code = extracted

            print("=== Refinement Probe: Chat ===")
            print(f"HTTP Status: {chat_status}")
            print(f"Error Code: {err_code}")
            print("Patch Status: None")
            print("Ops Count: 0")
            print("Issue Codes: []")
    except httpx.RequestError as exc:
        print("=== Refinement Probe: Chat ===")
        print(f"HTTP Status: Connection Error ({type(exc).__name__})")
        print("Error Code: CONNECTION_ERROR")
        print("Patch Status: None")
        print("Ops Count: 0")
        print("Issue Codes: []")
        return 1

    # 2. Suggestions probe
    sug_url = f"/api/designs/{design_id}/suggestions"
    try:
        sug_resp = client.post(sug_url)
        sug_status = sug_resp.status_code
        if sug_status == 200:
            sug_data: dict[str, Any] = sug_resp.json()
            suggestions = sug_data.get("suggestions", [])
            discarded_count = sug_data.get("discarded_count", 0)
            discarded_issue_codes = sug_data.get("discarded_issue_codes", [])

            print("\n=== Refinement Probe: Suggestions ===")
            print(f"HTTP Status: {sug_status}")
            print("Error Code: None")
            print(f"Suggestions Kept: {len(suggestions)}")
            print(f"Discarded Count: {discarded_count}")
            for idx, item in enumerate(suggestions, start=1):
                item_status = item.get("status", "unknown")
                print(f"  - Suggestion {idx} Status: {item_status}")
            for idx, codes in enumerate(discarded_issue_codes, start=1):
                print(f"  - Discarded Suggestion {idx} Status: blocked, Issue Codes: {codes}")
        else:
            err_code = "UNKNOWN"
            with contextlib.suppress(ValueError):
                err_payload = sug_resp.json()
                if isinstance(err_payload, dict) and isinstance(err_payload.get("error"), dict):
                    extracted = err_payload["error"].get("code")
                    if isinstance(extracted, str):
                        err_code = extracted

            print("\n=== Refinement Probe: Suggestions ===")
            print(f"HTTP Status: {sug_status}")
            print(f"Error Code: {err_code}")
            print("Suggestions Kept: 0")
            print("Discarded Count: 0")
    except httpx.RequestError as exc:
        print("\n=== Refinement Probe: Suggestions ===")
        print(f"HTTP Status: Connection Error ({type(exc).__name__})")
        print("Error Code: CONNECTION_ERROR")
        print("Suggestions Kept: 0")
        print("Discarded Count: 0")
        return 1

    return 0


def main() -> int:
    """Parse arguments and execute refinement probe."""
    parser = argparse.ArgumentParser(description="Live Gemini refinement probe")
    parser.add_argument("design_id", help="Existing design ID in local DB")
    parser.add_argument(
        "--base-url",
        default="http://127.0.0.1:8000",
        help="Backend base URL (default: http://127.0.0.1:8000)",
    )
    args = parser.parse_args()

    return run_probe(design_id=args.design_id, base_url=args.base_url)


if __name__ == "__main__":
    sys.exit(main())
