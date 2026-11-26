"""Application settings configured via environment variables."""

from functools import lru_cache

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuration loaded from environment variables and .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Secrets and AI model configuration
    gemini_api_key: SecretStr | None = None
    llm_model_intake: str | None = None
    llm_model_architect: str | None = None
    llm_model_writer: str | None = None
    llm_model_models: str | None = None

    # Database and administration
    database_url: str = "sqlite+aiosqlite:///./arch_nemesis.db"
    admin_token: SecretStr | None = None
    log_level: str = "INFO"

    # Core limits and defaults (Section 7 table)
    max_nodes: int = 25
    max_edges: int = 60
    max_layers: int = 8
    max_input_chars: int = 4000
    max_followup_rounds: int = 3
    max_questions_per_round: int = 3
    max_repair_attempts: int = 2
    llm_max_attempts: int = 3
    llm_timeout_seconds: int = 60
    lead_note_max_chars: int = 500
    max_patch_ops: int = 20
    max_refinement_turns: int = 20
    max_versions: int = 15

    # Prompt overrides (optional; defaults in service modules win when unset)
    architect_prompt_name: str | None = None
    architect_repair_prompt_name: str | None = None

    # Rate limiting (Phase 8A, sliding window per client IP per hour)
    rate_limit_intake_per_hour: int = 60
    rate_limit_designs_per_hour: int = 10
    rate_limit_refinement_per_hour: int = 30
    rate_limit_leads_per_hour: int = 5
    rate_limit_trusted_proxies: list[str] = ["127.0.0.1", "::1"]

    # ModelFit integration (Stage 6A, D-402, Phase M, D-408-D-412, D-422, D-423)
    model_size_small_max_params: int = 3_000_000_000
    model_size_medium_max_params: int = 14_000_000_000
    model_size_high_responsibility_min_params: int = 30_000_000_000
    max_gate_probes_per_node: int = 6

    # ModelFit native settings (Phase M, D-408-D-412)
    llm_model_advisor: str | None = None
    hf_token: SecretStr | None = None
    hf_proxy_rate_limit_requests: int = 30
    hf_proxy_rate_limit_window_seconds: float = 60.0
    advisor_rate_limit_requests: int = 4
    advisor_rate_limit_window_seconds: float = 60.0


@lru_cache
def get_settings() -> Settings:
    """Return cached Settings instance."""
    return Settings()
