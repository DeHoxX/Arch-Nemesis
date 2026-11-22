"""Constants and configuration weights for deterministic recommendation scoring."""

from typing import Final

# Scoring weights (sum to 1.0)
WEIGHT_HEADROOM: Final[float] = 0.45
WEIGHT_DOWNLOADS: Final[float] = 0.25
WEIGHT_RECENCY: Final[float] = 0.15
WEIGHT_LICENSE: Final[float] = 0.15

# Headroom scoring thresholds (as fraction of total device memory)
OPTIMAL_HEADROOM_MIN: Final[float] = 0.15  # 15% headroom is lower bound of sweet spot
OPTIMAL_HEADROOM_MAX: Final[float] = 0.30  # 30% headroom is upper bound of sweet spot
MIN_SAFE_HEADROOM: Final[float] = 0.05  # Below 5% is penalized heavily

# Hub query bounding
MAX_CANDIDATES: Final[int] = 8  # Max candidates inspected per recommendation request
HUB_CONCURRENCY_LIMIT: Final[int] = 3  # Bounded concurrency for Hub detail/safetensors fetches

# Task heuristic search query terms
TASK_SEARCH_TERMS: Final[dict[str, list[str]]] = {
    "coding": ["coder", "code"],
    "general": ["instruct", "chat"],
    "reasoning": ["reasoning", "math"],
    "writing": ["instruct", "creative"],
}

# License scoring lookup tables
LICENSE_SCORES_ANY: Final[dict[str, float]] = {
    "permissive": 1.0,
    "open_weights": 1.0,
    "other": 0.8,
    "unknown": 0.5,
}

LICENSE_SCORES_PERMISSIVE: Final[dict[str, float]] = {
    "permissive": 1.0,
    "open_weights": 0.2,
    "other": 0.0,
    "unknown": 0.0,
}

LICENSE_SCORES_OPEN_WEIGHTS: Final[dict[str, float]] = {
    "permissive": 1.0,
    "open_weights": 1.0,
    "other": 0.3,
    "unknown": 0.1,
}

PERMISSIVE_LICENSES: Final[set[str]] = {
    "mit",
    "apache-2.0",
    "bsd",
    "bsd-2-clause",
    "bsd-3-clause",
    "isc",
    "unlicense",
}

OPEN_WEIGHT_LICENSES: Final[set[str]] = {
    "llama3",
    "llama3.1",
    "llama3.2",
    "llama3.3",
    "llama2",
    "mistral",
    "gemma",
    "apple-ascl",
    "qwen",
}
