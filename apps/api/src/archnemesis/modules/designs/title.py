"""Concise architecture design title generation, validation, and heuristic fallback."""

import asyncio
import re
from typing import Any

from pydantic import BaseModel, ConfigDict

from archnemesis.llm.base import (
    LLMClient,
    LLMError,
    LLMRateLimited,
    LLMTask,
    LLMTimeout,
    LLMUnavailable,
)
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

# Common fluff prefixes to strip in deterministic heuristic (longest first)
_FLUFF_PREFIXES_RAW = (
    "a system designed to",
    "a system that",
    "a system to",
    "an automated",
    "automated",
    "implement an automated",
    "implementing an automated",
    "implement a",
    "implementing a",
    "implement an",
    "implementing an",
    "implement",
    "implementing",
    "development of a",
    "development of an",
    "development of",
    "developing an automated",
    "developing a",
    "developing an",
    "developing",
    "build an automated",
    "building an automated",
    "build a system that",
    "building a system that",
    "build a",
    "building a",
    "build an",
    "building an",
    "build",
    "building",
    "create an automated",
    "creating an automated",
    "create a system that",
    "creating a system that",
    "create a",
    "creating a",
    "create an",
    "creating an",
    "create",
    "creating",
    "design and implement",
    "designing and implementing",
    "design of a",
    "design of an",
    "design a",
    "designing a",
    "designing an",
    "designing",
    "a platform designed to",
    "a platform for",
    "a platform that",
    "a tool designed to",
    "a tool for",
    "a tool that",
    "provide a system to",
    "providing a system to",
    "provide a",
    "providing a",
    "provide",
    "providing",
)

# Sorted by length descending so longer phrases match before substrings
FLUFF_PREFIXES = tuple(sorted(_FLUFF_PREFIXES_RAW, key=len, reverse=True))

# Meta-sentence lead-in patterns (iteratively stripped up to 2 passes)
META_INTRO_PATTERNS = (
    re.compile(
        r"^(?:the\s+)?users?\s+(?:is|are)\s+looking\s+for(?:\s+(?:a|an|the))?\b[:,\-\s]*",
        re.IGNORECASE,
    ),
    re.compile(
        r"^(?:the\s+)?system\s+(?:requires|needs)(?:\s+(?:a|an|the))?(?:\s+component(?:\s+to)?)?\b[:,\-\s]*",
        re.IGNORECASE,
    ),
    re.compile(r"^(?:a\s+|the\s+)?business\s+needs(?:\s+(?:a|an|the))?\b[:,\-\s]*", re.IGNORECASE),
    re.compile(r"^we\s+need(?:\s+(?:a|an|the))?\b[:,\-\s]*", re.IGNORECASE),
    re.compile(
        r"^(?:a\s+|the\s+)?user\s+(?:wants|needs)(?:\s+(?:a|an|the))?\b[:,\-\s]*", re.IGNORECASE
    ),
)

# Natural clause boundary cut pattern
CLAUSE_CUT_PATTERN = re.compile(
    r"(?:[,;.]|\b(?:that|which|who|where|in\s+order\s+to|so\s+that)\b)",
    re.IGNORECASE,
)

# Non-word grammatical fragments that indicate a mid-word truncate or broken prefix
FRAGMENTS = frozenset({"ing", "tion", "ment", "ed", "es", "re", "ve", "ll"})

# Stopwords stripped when leading or trailing
LEADING_STOPWORDS = frozenset(
    {
        "to",
        "for",
        "the",
        "a",
        "an",
        "and",
        "or",
        "in",
        "of",
        "on",
        "with",
        "that",
        "is",
        "are",
        "as",
        "by",
        "from",
        "into",
    }
)
TRAILING_STOPWORDS = frozenset(
    {
        "that",
        "which",
        "who",
        "for",
        "a",
        "an",
        "the",
        "to",
        "and",
        "or",
        "of",
        "in",
        "on",
        "with",
        "is",
        "are",
        "as",
        "by",
        "from",
        "into",
        "at",
    }
)

TITLE_TIMEOUT_SECONDS = 3.0


class TitleLLMOutput(BaseModel):
    """Output schema for title generation LLM response."""

    model_config = ConfigDict(extra="ignore")

    title: str


def smart_title_word(word: str) -> str:
    """Apply Title Case: capitalize lowercase words/parts, preserve acronyms (AI, API, iOS, PII)."""
    if "-" in word:
        return "-".join(smart_title_word(part) for part in word.split("-"))
    if any(c.isupper() for c in word):
        return word
    return word.capitalize()


def apply_smart_title_case(text: str) -> str:
    """Format title words: capitalize entirely lowercase words, leave words with uppercase untouched."""
    return " ".join(smart_title_word(w) for w in text.split())


# Imperative verbs and fluff participles that must not lead a title
LEADING_ACTION_VERBS = frozenset(
    {
        "deploy",
        "deploying",
        "deploys",
        "deployed",
        "launch",
        "launching",
        "launches",
        "launched",
        "build",
        "building",
        "builds",
        "built",
        "create",
        "creating",
        "creates",
        "created",
        "develop",
        "developing",
        "develops",
        "developed",
        "implement",
        "implementing",
        "implements",
        "implemented",
        "setup",
        "establish",
        "establishing",
        "construct",
        "constructing",
        "automated",
    }
)

# Common prepositions that can introduce dangling cut-off tails
PREPOSITIONS = frozenset(
    {
        "for",
        "to",
        "with",
        "in",
        "on",
        "by",
        "from",
        "into",
        "at",
        "about",
        "via",
        "through",
        "across",
    }
)

# Pronouns and articles that indicate an incomplete prepositional phrase
PRONOUNS_AND_ARTICLES = frozenset(
    {
        "their",
        "our",
        "its",
        "the",
        "a",
        "an",
        "this",
        "these",
        "my",
        "your",
        "his",
        "her",
    }
)

# System head nouns that complete a system entity concept
SYSTEM_HEAD_NOUNS = frozenset(
    {
        "system",
        "systems",
        "tool",
        "tools",
        "platform",
        "platforms",
        "application",
        "applications",
        "app",
        "apps",
        "service",
        "services",
        "engine",
        "engines",
        "pipeline",
        "pipelines",
        "gateway",
        "gateways",
        "portal",
        "portals",
        "broker",
        "brokers",
        "hub",
        "hubs",
        "infrastructure",
        "component",
        "components",
        "module",
        "modules",
        "framework",
        "frameworks",
        "interface",
        "interfaces",
        "workflow",
        "workflows",
        "assistant",
        "assistants",
        "bot",
        "bots",
        "solution",
        "solutions",
        "network",
        "networks",
        "database",
        "databases",
        "store",
        "stores",
        "api",
        "apis",
        "model",
        "models",
        "agent",
        "agents",
        "client",
        "clients",
        "server",
        "servers",
        "dashboard",
        "dashboards",
    }
)

# Transitive or dangling participles that should not trail a head noun
TRAILING_PARTICIPLES = frozenset(
    {
        "designed",
        "developed",
        "built",
        "created",
        "implemented",
        "configured",
        "intended",
        "oriented",
        "managed",
        "powered",
    }
)

# Adjectives and incomplete modifiers that cannot end a prepositional tail
INCOMPLETE_TRAILING_WORDS = frozenset(
    {
        "cold",
        "hot",
        "warm",
        "cool",
        "new",
        "old",
        "fast",
        "slow",
        "internal",
        "external",
        "local",
        "remote",
        "high",
        "low",
        "single",
        "multi",
        "cross",
        "raw",
        "live",
        "dry",
        "safe",
        "secure",
        "free",
        "open",
        "closed",
    }
)


def _extract_words(text: str) -> list[str]:
    """Clean text into alphanumeric tokens, filtering forbidden words and stripping leading fragments/stopwords."""
    clean = re.sub(r"[^\w\s\-]", " ", text)
    raw_words = [w for w in clean.split() if w]
    words = [w for w in raw_words if w.lower() not in FORBIDDEN_WORDS]

    # Strip leading non-word fragments, single-letter non-words, and stopwords
    while words:
        w_low = words[0].lower()
        if w_low in FRAGMENTS:
            words.pop(0)
            continue
        if len(words[0]) == 1 and w_low not in {"i"}:
            words.pop(0)
            continue
        if w_low in LEADING_STOPWORDS:
            words.pop(0)
            continue
        break

    # Strip leading imperative action verbs if at least 2 content words remain
    while len(words) > 2 and words[0].lower() in LEADING_ACTION_VERBS:
        words.pop(0)
        while words and (
            words[0].lower() in LEADING_STOPWORDS
            or (len(words[0]) == 1 and words[0].lower() not in {"i"})
        ):
            words.pop(0)

    return words


def cut_at_clause_boundary(text: str) -> str:
    """Split at natural punctuation or clause markers if at least 2 content words precede the cut."""
    for m in CLAUSE_CUT_PATTERN.finditer(text):
        prefix_part = text[: m.start()].strip()
        words = _extract_words(prefix_part)
        if len(words) >= 2:
            return prefix_part
    return text


def fallback_title(summary: str, domain_hint: str | None = None) -> str:
    """Generate a deterministic Title Case title (2 to 5 words, max 40 chars) from brief fields.

    Strips meta-sentence lead-ins, fluff prefixes, fragments, and trailing stopwords.
    Trims dangling conjunction tails on truncated summaries.
    Never returns empty ("Untitled Design" as fallback).
    """
    clean_text = (summary or "").strip()
    if not clean_text:
        return "Untitled Design"

    # 1. Meta-sentence lead-in stripping (max 2 passes)
    for _ in range(2):
        matched = False
        for pattern in META_INTRO_PATTERNS:
            m = pattern.match(clean_text)
            if m:
                clean_text = clean_text[m.end() :].strip()
                matched = True
                break
        if not matched:
            break

    # 2. Word-boundary fluff prefix stripping (longest first)
    for prefix in FLUFF_PREFIXES:
        m = re.match(rf"^{re.escape(prefix)}(?=$|[\s:,\-])", clean_text, re.IGNORECASE)
        if m:
            clean_text = clean_text[m.end() :].strip()
            clean_text = re.sub(r"^[:,\-\s]+", "", clean_text).strip()
            break

    # 3. Natural clause boundary cut (if at least 2 content words precede the cut)
    clean_text = cut_at_clause_boundary(clean_text)

    # 4. Extract words, strip leading fragments/stopwords, filter Rule-4 forbidden words
    words = _extract_words(clean_text)

    # 5. Prepend domain_hint words only if fewer than 2 words remain
    if len(words) < 2 and domain_hint and isinstance(domain_hint, str):
        hint_clean = re.sub(r"[^\w\s\-]", " ", domain_hint)
        hint_raw = [w for w in hint_clean.split() if w]
        current_lowers = {w.lower() for w in words}
        hint_words = [
            w
            for w in hint_raw
            if w.lower() not in current_lowers
            and w.lower() not in FORBIDDEN_WORDS
            and w.lower() not in FRAGMENTS
            and w.lower() not in LEADING_STOPWORDS
            and w.lower() not in TRAILING_STOPWORDS
        ]
        words = hint_words + words

    # 6. Slicing up to 5 words and trailing stopword loop
    selected_words = list(words[:5])
    truncated = len(words) > len(selected_words)

    while selected_words and selected_words[-1].lower() in TRAILING_STOPWORDS:
        selected_words.pop()
        truncated = True

    # 7. Drop dangling 'and/or + 1 noun' only when truncation dropped words
    if (
        truncated
        and len(selected_words) >= 3
        and selected_words[-2].lower() in {"and", "or"}
        and len(selected_words[:-2]) >= 2
    ):
        selected_words = selected_words[:-2]
        while selected_words and selected_words[-1].lower() in TRAILING_STOPWORDS:
            selected_words.pop()

    # 8. Drop dangling preposition tails (<prep> <determiner> <1 word> or <prep> <1 word>)
    # e.g. "For Their Team", "For Cold", "For Managing"
    if (
        len(selected_words) >= 4
        and selected_words[-3].lower() in PREPOSITIONS
        and selected_words[-2].lower() in PRONOUNS_AND_ARTICLES
        and len(selected_words[:-3]) >= 2
    ):
        selected_words = selected_words[:-3]
        while selected_words and selected_words[-1].lower() in TRAILING_STOPWORDS:
            selected_words.pop()
        truncated = True

    if (
        len(selected_words) >= 3
        and selected_words[-2].lower() in PREPOSITIONS
        and (
            truncated
            or selected_words[-1].lower().endswith("ing")
            or selected_words[-1].lower() in INCOMPLETE_TRAILING_WORDS
        )
        and len(selected_words[:-2]) >= 2
    ):
        selected_words = selected_words[:-2]
        while selected_words and selected_words[-1].lower() in TRAILING_STOPWORDS:
            selected_words.pop()
        truncated = True

    # 9. Drop trailing participle clause tail following system head noun
    # e.g. "Support Platform Connecting Customers" -> "Support Platform"
    if (
        len(selected_words) >= 4
        and selected_words[-3].lower() in SYSTEM_HEAD_NOUNS
        and selected_words[-2].lower().endswith("ing")
        and len(selected_words[:-2]) >= 2
    ):
        selected_words = selected_words[:-2]
        while selected_words and selected_words[-1].lower() in TRAILING_STOPWORDS:
            selected_words.pop()
        truncated = True

    # 10. Drop trailing participle or adjective following head noun
    # e.g. "Legal Contract Analysis Tool Designed", "Web-Based Application Designed"
    if (
        len(selected_words) >= 3
        and (
            selected_words[-1].lower() in TRAILING_PARTICIPLES
            or (
                selected_words[-1].lower().endswith("ed")
                and selected_words[-2].lower() in SYSTEM_HEAD_NOUNS
            )
        )
        and len(selected_words[:-1]) >= 2
    ):
        selected_words = selected_words[:-1]
        while selected_words and selected_words[-1].lower() in TRAILING_STOPWORDS:
            selected_words.pop()
        truncated = True

    if not selected_words:
        return "Untitled Design"

    title = apply_smart_title_case(" ".join(selected_words))

    # 11. Truncate to max 40 characters without splitting words mid-word
    if len(title) > 40:
        words_clamped = title.split()
        while words_clamped and len(" ".join(words_clamped)) > 40:
            words_clamped.pop()
            truncated = True

        while words_clamped and words_clamped[-1].lower() in TRAILING_STOPWORDS:
            words_clamped.pop()

        if (
            truncated
            and len(words_clamped) >= 3
            and words_clamped[-2].lower() in {"and", "or"}
            and len(words_clamped[:-2]) >= 2
        ):
            words_clamped = words_clamped[:-2]
            while words_clamped and words_clamped[-1].lower() in TRAILING_STOPWORDS:
                words_clamped.pop()

        title = " ".join(words_clamped)

    final_words = title.split()
    if len(final_words) < 2 or len(title) < 6:
        return "Untitled Design"

    return title.strip()


def disambiguate_title(
    candidate: str,
    seen: set[str],
    domain_hint: str | None = None,
    data_hint: str | None = None,
) -> str:
    """Resolve duplicate title collisions deterministically for backfill.

    Maintains a case-insensitive seen set of existing non-null titles and proposed titles.
    1. If candidate.lower() not in seen, record and return candidate.
    2. Shorten base to <= 26 chars at word boundary and append (2), (3)...
    Total length <= 40 chars. Records resolved title in seen and returns it.
    """
    if candidate.lower() not in seen:
        seen.add(candidate.lower())
        return candidate

    # Append numeric suffix: shorten base to <= 26 characters at word boundary
    base = candidate
    if len(base) > 26:
        words = base.split()
        while words and len(" ".join(words)) > 26:
            words.pop()
        base = " ".join(words)
        if not base:
            base = candidate[:26].strip()

    counter = 2
    while f"{base} ({counter})".lower() in seen:
        counter += 1

    resolved = f"{base} ({counter})"
    seen.add(resolved.lower())
    return resolved


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

    # Title case formatting for final output: only capitalize entirely lowercase words
    cleaned_title = apply_smart_title_case(text)
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
    except LLMRateLimited as exc:
        msg = getattr(exc, "message", str(exc))
        return fallback, "heuristic", f"RATE_LIMITED:{msg}"
    except LLMUnavailable as exc:
        msg = getattr(exc, "message", str(exc))
        return fallback, "heuristic", f"UNAVAILABLE:{msg}"
    except (LLMError, Exception):  # noqa: BLE001 - Title failure must never fail design creation
        return fallback, "heuristic", "LLM_ERROR"
