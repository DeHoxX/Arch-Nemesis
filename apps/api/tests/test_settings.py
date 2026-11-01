"""Tests for application settings, defaults, secret masking, and limits."""

import pytest
from pydantic import SecretStr

from archnemesis.settings import Settings


def test_settings_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("LLM_MODEL_INTAKE", raising=False)
    monkeypatch.delenv("LLM_MODEL_ARCHITECT", raising=False)
    monkeypatch.delenv("LLM_MODEL_WRITER", raising=False)
    settings = Settings(_env_file=None)  # type: ignore[call-arg]
    assert settings.max_nodes == 25
    assert settings.max_edges == 60
    assert settings.max_input_chars == 4000
    assert settings.max_followup_rounds == 3
    assert settings.max_repair_attempts == 2
    assert settings.llm_max_attempts == 3
    assert settings.llm_timeout_seconds == 60
    assert settings.lead_note_max_chars == 500
    assert settings.max_patch_ops == 20
    assert settings.max_refinement_turns == 20
    assert settings.max_versions == 15
    assert settings.database_url == "sqlite+aiosqlite:///./arch_nemesis.db"
    assert settings.log_level == "INFO"
    assert settings.gemini_api_key is None
    assert settings.llm_model_intake is None
    assert settings.llm_model_architect is None
    assert settings.llm_model_writer is None


def test_secrets_masked_in_repr_and_str() -> None:
    secret_value = "super-secret-key-12345"
    settings = Settings(gemini_api_key=SecretStr(secret_value))
    assert secret_value not in repr(settings)
    assert secret_value not in str(settings)
    assert settings.gemini_api_key is not None
    assert secret_value not in str(settings.gemini_api_key)
    assert settings.gemini_api_key.get_secret_value() == secret_value


def test_settings_environment_override(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MAX_NODES", "30")
    monkeypatch.setenv("LOG_LEVEL", "DEBUG")
    monkeypatch.setenv("LLM_MODEL_INTAKE", "test-model-v1")
    settings = Settings()
    assert settings.max_nodes == 30
    assert settings.log_level == "DEBUG"
    assert settings.llm_model_intake == "test-model-v1"
