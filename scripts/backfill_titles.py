"""Operational CLI script to backfill concise AI titles for architecture designs.

Defaults to --dry-run. Pass --apply to execute generation and update records.
Never logs or prints brief text, generated titles, or secrets.
"""

import argparse
import asyncio
import sys
from pathlib import Path

# Ensure apps/api/src is in sys.path when invoked from repository root
api_src = Path(__file__).resolve().parent.parent / "apps" / "api" / "src"
if str(api_src) not in sys.path:
    sys.path.insert(0, str(api_src))

from archnemesis.modules.designs.backfill import run_backfill


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill concise AI titles for past designs.")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Execute title generation and persist to database (default is dry-run)",
    )
    parser.add_argument(
        "--pause-seconds",
        type=float,
        default=4.0,
        help="Pause interval between LLM calls in seconds (default: 4.0)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limit number of designs to process",
    )
    args = parser.parse_args()

    asyncio.run(
        run_backfill(
            apply=args.apply,
            pause_seconds=args.pause_seconds,
            limit=args.limit,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
