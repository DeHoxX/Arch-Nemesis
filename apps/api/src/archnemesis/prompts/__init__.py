"""Prompt loading utilities."""

from pathlib import Path

_PROMPTS_DIR = Path(__file__).resolve().parent


def load_prompt(filename: str) -> str:
    """Load a prompt markdown file from the prompts directory."""
    path = _PROMPTS_DIR / filename
    if not path.is_file():
        raise FileNotFoundError(f"Prompt file not found: {path}")
    return path.read_text(encoding="utf-8")


def load_patterns() -> str:
    """Load and concatenate all architecture patterns."""
    patterns_dir = _PROMPTS_DIR / "patterns"
    if not patterns_dir.is_dir():
        return ""
    sections: list[str] = []
    for file in sorted(patterns_dir.glob("*.md")):
        sections.append(file.read_text(encoding="utf-8"))
    return "\n\n---\n\n".join(sections)
