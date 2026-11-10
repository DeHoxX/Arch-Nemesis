"""Operational CLI script to backfill concise deterministic titles for architecture designs.

Defaults to --dry-run. Pass --apply with an explicit --backup-path <file> to execute.
Never calls Gemini; uses pure deterministic fallback_title from brief fields.
Never logs or prints brief summary or brief text.
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
    parser = argparse.ArgumentParser(description="Backfill concise deterministic titles for past designs.")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Execute title generation and persist to database (default is dry-run)",
    )
    parser.add_argument(
        "--backup-path",
        type=Path,
        default=None,
        help="Path to database backup copy (mandatory for --apply)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limit number of designs to process",
    )
    args = parser.parse_args()

    if args.apply and not args.backup_path:
        print("Error: --backup-path is required when --apply is set.", file=sys.stderr)
        return 1

    try:
        asyncio.run(
            run_backfill(
                apply=args.apply,
                backup_path=args.backup_path,
                limit=args.limit,
            )
        )
        return 0
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
