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

    # Database and administration
    database_url: str = "sqlite+aiosqlite:///./arch_nemesis.db"
    admin_token: SecretStr | None = None
    log_level: str = "INFO"

    # Core limits and defaults (Section 7 table)
    max_nodes: int = 15
    max_edges: int = 40
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


@lru_cache
def get_settings() -> Settings:
    """Return cached Settings instance."""
    return Settings()
