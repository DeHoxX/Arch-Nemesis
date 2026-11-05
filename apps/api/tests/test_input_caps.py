"""Tests for request payload input caps across all endpoints."""

import httpx
import pytest
from pydantic import ValidationError

from archnemesis.main import app
from archnemesis.modules.designs.schemas import CreateDesignRequest
from archnemesis.modules.intake.schemas import MAX_INPUT_CHARS, IntakeTurnRequest
from archnemesis.modules.leads.schemas import CreateLeadRequest
from archnemesis.settings import get_settings


def test_intake_turn_request_length_caps() -> None:
    """IntakeTurnRequest enforces session_id <= 36 and text between 1 and MAX_INPUT_CHARS."""
    settings = get_settings()
    assert MAX_INPUT_CHARS == settings.max_input_chars
    assert MAX_INPUT_CHARS == 4000

    # Valid payload
    valid_session_id = "a" * 36
    valid_text = "a" * 4000
    assert len(valid_session_id) == 36
    assert len(valid_text) == 4000
    valid = IntakeTurnRequest(session_id=valid_session_id, text=valid_text)
    assert len(valid.session_id or "") == 36
    assert len(valid.text) == 4000

    # session_id > 36 chars (exactly 37)
    invalid_session_id = "a" * 37
    assert len(invalid_session_id) == 37
    with pytest.raises(ValidationError) as exc_info:
        IntakeTurnRequest(session_id=invalid_session_id, text="valid text")
    errors = exc_info.value.errors()
    assert any(e["loc"] == ("session_id",) for e in errors)

    # text empty (min_length=1)
    with pytest.raises(ValidationError) as exc_info:
        IntakeTurnRequest(session_id="valid", text="")
    errors = exc_info.value.errors()
    assert any(e["loc"] == ("text",) for e in errors)

    # text > MAX_INPUT_CHARS (exactly 4001)
    invalid_text = "a" * 4001
    assert len(invalid_text) == 4001
    with pytest.raises(ValidationError) as exc_info:
        IntakeTurnRequest(session_id="valid", text=invalid_text)
    errors = exc_info.value.errors()
    assert any(e["loc"] == ("text",) for e in errors)


def test_create_design_request_session_id_cap() -> None:
    """CreateDesignRequest enforces session_id between 1 and 36 characters."""
    valid_session_id = "s" * 36
    assert len(valid_session_id) == 36
    valid = CreateDesignRequest(session_id=valid_session_id)
    assert len(valid.session_id) == 36

    # empty string
    with pytest.raises(ValidationError) as exc_info:
        CreateDesignRequest(session_id="")
    assert any(e["loc"] == ("session_id",) for e in exc_info.value.errors())

    # > 36 characters (exactly 37)
    invalid_session_id = "s" * 37
    assert len(invalid_session_id) == 37
    with pytest.raises(ValidationError) as exc_info:
        CreateDesignRequest(session_id=invalid_session_id)
    assert any(e["loc"] == ("session_id",) for e in exc_info.value.errors())


def test_create_lead_request_website_cap() -> None:
    """CreateLeadRequest enforces website <= 200 characters."""
    prefix = "https://"
    suffix = ".com"
    valid_website = prefix + "w" * (200 - len(prefix) - len(suffix)) + suffix
    assert len(valid_website) == 200

    valid = CreateLeadRequest(
        design_id="des_1",
        version_no=1,
        name="Alice",
        email="alice@example.com",
        website=valid_website,
    )
    assert valid.website is not None
    assert len(valid.website) == 200

    # website > 200 characters (exactly 201)
    invalid_website = prefix + "w" * (201 - len(prefix) - len(suffix)) + suffix
    assert len(invalid_website) == 201

    with pytest.raises(ValidationError) as exc_info:
        CreateLeadRequest(
            design_id="des_1",
            version_no=1,
            name="Alice",
            email="alice@example.com",
            website=invalid_website,
        )
    assert any(e["loc"] == ("website",) for e in exc_info.value.errors())


@pytest.mark.asyncio
async def test_oversize_input_returns_input_invalid_without_echoing_payload() -> None:
    """Oversized inputs return 422 with code INPUT_INVALID and do not echo the raw input."""
    huge_text = "SECRET_USER_NEED_" + ("x" * 4500)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/api/intake/turn",
            json={"session_id": "test_session", "text": huge_text},
        )
        assert res.status_code == 422
        body = res.json()
        assert "error" in body
        error = body["error"]
        assert error["code"] == "INPUT_INVALID"
        # Ensure the raw user text is never echoed in the response
        assert huge_text not in res.text
        assert "SECRET_USER_NEED" not in res.text
