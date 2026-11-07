"""Concise architecture design title generation, validation, and heuristic fallback."""

import asyncio
import re
from typing import Any

from pydantic import BaseModel, ConfigDict

from archnemesis.llm.base import LLMClient, LLMError, LLMTask, LLMTimeout
from archnemesis.prompts import load_prompt
from archnemesis.shared.brief import RequirementBrief

# Forbidden words per Rule 4
FORBIDDEN_WORDS = frozenset(
    [
        "cost",
        "costs",
        "price",
        "pricing",
        "budget",
        "timeline",
        "effort",
        "roi",
        "savings",
    ]
)

# Common fluff prefixes to strip in deterministic heuristic
FLUFF_PREFIXES = (
    "a system designed to",
    "a system that",
    "a system to",
    "an automated",
    "automated",
    "implement an automated",
    "implement a",
    "implement",
    "development of a",
    "development of an",
    "development of",
    "build an automated",
    "build a system that",
    "build a",
    "build an",
    "build",
    "create an automated",
    "create a system that",
    "create a",
    "create an",
    "create",
    "a platform designed to",
    "a platform for",
    "a platform that",
    "a tool designed to",
    "a tool for",
    "a tool that",
    "design and implement",
    "design of a",
    "design of an",
    "design a",
    "provide a system to",
    "provide a",
)

TITLE_TIMEOUT_SECONDS = 3.0


class TitleLLMOutput(BaseModel):
    """Output schema for title generation LLM response."""

    model_config = ConfigDict(extra="ignore")

    title: str


def fallback_title(summary: str, domain_hint: str | None = None) -> str:
    """Generate a deterministic Title Case title (3 to 5 words, max 40 chars) from brief fields.

    Strips fluff prefixes and extracts key words. Never returns empty ("Untitled Design" as fallback).
    """
    clean_summary = (summary or "").strip()
    lower_summary = clean_summary.lower()

    # Strip recognized fluff prefixes
    stripped = clean_summary
    for prefix in FLUFF_PREFIXES:
        if lower_summary.startswith(prefix):
            stripped = clean_summary[len(prefix) :].strip()
            stripped = re.sub(r"^[:,\-\s]+", "", stripped).strip()
            break

    candidate = stripped if stripped else clean_summary

    # Remove non-alphanumeric chars except space and hyphen
    candidate = re.sub(r"[^\w\s\-]", " ", candidate)
    words = [w for w in candidate.split() if w]

    # Filter out common stop words if at the very beginning of the extracted words
    stop_words = {"to", "for", "the", "a", "an", "and", "in", "of", "on", "with"}
    while words and words[0].lower() in stop_words:
        words.pop(0)

    # If too few words and domain_hint is present, prepend domain words
    if len(words) < 3 and domain_hint:
        hint_words = [w for w in re.sub(r"[^\w\s\-]", " ", domain_hint).split() if w]
        words = hint_words + words

    selected_words = words[:5]
    if not selected_words:
        return "Untitled Design"

    title = " ".join(selected_words).title()

    # Truncate to max 40 characters without splitting words mid-word if possible
    if len(title) > 40:
        words_clamped = title.split()
        while words_clamped and len(" ".join(words_clamped)) > 40:
            words_clamped.pop()
        title = " ".join(words_clamped)

    if not title.strip():
        title = "Untitled Design"

    return title.strip()


def validate_title(raw_text: str) -> tuple[bool, str, str | None]:
    """Validate and sanitize candidate title output.

    Rules:
    - Strip quotes, markdown, and 'Title:' prefix
    - 3 to 5 words
    - Max 40 characters
    - Plain text: reject <, >, digits
    - Reject Rule-4 forbidden words: cost, costs, price, pricing, budget, timeline, effort, roi, savings

    Returns (is_valid, cleaned_title, issue_code).
    """
    if not raw_text or not isinstance(raw_text, str):
        return False, "", "EMPTY_TITLE"

    text = raw_text.strip()

    # Strip markdown code blocks / bold / italics if present
    text = re.sub(r"^```[a-z]*\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    text = text.strip()

    # Strip surrounding quotes
    text = text.strip("\"'`“”’‘")

    # Strip 'Title:' prefix (case-insensitive)
    text = re.sub(r"^title\s*:\s*", "", text, flags=re.IGNORECASE).strip()
    text = text.strip("\"'`“”’‘").strip()

    if not text:
        return False, "", "EMPTY_TITLE"

    # Reject HTML (< or >)
    if "<" in text or ">" in text:
        return False, "", "CONTAINS_HTML"

    # Reject digits
    if any(char.isdigit() for char in text):
        return False, "", "CONTAINS_DIGITS"

    # Check forbidden Rule-4 words
    tokens = [t.lower() for t in re.findall(r"\b\w+\b", text)]
    for token in tokens:
        if token in FORBIDDEN_WORDS:
            return False, "", f"FORBIDDEN_WORD_{token.upper()}"

    # Word count check: 3 to 5 words
    words = text.split()
    if len(words) < 3 or len(words) > 5:
        return False, "", f"INVALID_WORD_COUNT_{len(words)}"

    # Max length: 40 chars
    if len(text) > 40:
        return False, "", f"EXCEEDS_MAX_CHARS_{len(text)}"

    # Title case formatting for final output
    cleaned_title = text.title()
    return True, cleaned_title, None


async def generate_title_for_design(
    design_id: str,
    brief: RequirementBrief,
    llm: LLMClient,
) -> tuple[str, str, str | None]:
    """Generate a concise title for a design post-save.

    Executes exactly one attempt with a 3.0s timeout and no retries.
    Returns (title, source, issue_code) where source is 'llm' or 'heuristic'.
    Never raises an exception; falls back to deterministic heuristic on any failure.
    """
    fallback = fallback_title(brief.summary, brief.domain_hint)

    try:
        system_prompt = load_prompt("title_v1.md")
    except (OSError, FileNotFoundError):
        return fallback, "heuristic", "PROMPT_LOAD_FAILED"

    domain_part = f"Domain: {brief.domain_hint}\n" if brief.domain_hint else ""
    user_prompt = (
        f"<untrusted_user_text>\n{domain_part}Summary: {brief.summary}\n</untrusted_user_text>"
    )

    try:
        raw_output: dict[str, Any] = await asyncio.wait_for(
            llm.generate_json(
                task=LLMTask.WRITER,
                system=system_prompt,
                user=user_prompt,
                schema=TitleLLMOutput,
            ),
            timeout=TITLE_TIMEOUT_SECONDS,
        )
        candidate = str(raw_output.get("title", ""))
        is_valid, cleaned_title, issue_code = validate_title(candidate)
        if is_valid:
            return cleaned_title, "llm", None
        return fallback, "heuristic", issue_code
    except (TimeoutError, LLMTimeout):
        return fallback, "heuristic", "TIMEOUT"
    except (LLMError, Exception):  # noqa: BLE001 - Title failure must never fail design creation
        return fallback, "heuristic", "LLM_ERROR"
