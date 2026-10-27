"""Tests for structlog sensitive key redaction processor."""

from archnemesis.logging import REDACTED_KEYS, redaction_processor


def test_redaction_processor_all_keys() -> None:
    test_dict: dict[str, object] = {}
    for key in REDACTED_KEYS:
        test_dict[key] = f"secret_value_for_{key}"
        test_dict[key.upper()] = f"uppercase_value_for_{key}"
        test_dict[key.capitalize()] = f"capitalized_value_for_{key}"

    # Non-sensitive keys should not be redacted
    test_dict["status"] = "ok"
    test_dict["count"] = 42

    result = redaction_processor(None, "info", test_dict)

    for key in REDACTED_KEYS:
        assert result[key] == "[redacted]"
        assert result[key.upper()] == "[redacted]"
        assert result[key.capitalize()] == "[redacted]"

    assert result["status"] == "ok"
    assert result["count"] == 42


def test_redaction_processor_nested_structures() -> None:
    payload = {
        "user_profile": {
            "name": "Alice Smith",
            "contact": {
                "email": "alice@example.com",
                "phone": "555-1234",
            },
        },
        "history": [
            {"prompt": "design a system", "message": "hello"},
            {"system": "system prompt", "text": "generated text"},
        ],
        "credentials": {
            "api_key": "key-123",
            "token": "tok-456",
            "password": "pass",
            "authorization": "Bearer xyz",
        },
        "safe_data": {"version": 1, "public": True},
    }

    result = redaction_processor(None, "info", payload)

    assert result["user_profile"]["name"] == "[redacted]"
    assert result["user_profile"]["contact"]["email"] == "[redacted]"
    assert result["user_profile"]["contact"]["phone"] == "555-1234"

    assert result["history"][0]["prompt"] == "[redacted]"
    assert result["history"][0]["message"] == "[redacted]"
    assert result["history"][1]["system"] == "[redacted]"
    assert result["history"][1]["text"] == "[redacted]"

    assert result["credentials"]["api_key"] == "[redacted]"
    assert result["credentials"]["token"] == "[redacted]"
    assert result["credentials"]["password"] == "[redacted]"
    assert result["credentials"]["authorization"] == "[redacted]"

    assert result["safe_data"]["version"] == 1
    assert result["safe_data"]["public"] is True


def test_redaction_processor_mixed_case_and_camel_case() -> None:
    payload = {
        "ApiKey": "secret-1",
        "API_KEY": "secret-2",
        "apiKey": "secret-3",
        "api_Key": "secret-4",
        "PassWord": "secret-pass",
        "passWord": "secret-pass-2",
        "eMail": "alice@example.com",
        "Authorization": "Bearer tok",
        "User": "admin",
        "normalKey": "normalValue",
        "count": 100,
    }

    result = redaction_processor(None, "info", payload)

    assert result["ApiKey"] == "[redacted]"
    assert result["API_KEY"] == "[redacted]"
    assert result["apiKey"] == "[redacted]"
    assert result["api_Key"] == "[redacted]"
    assert result["PassWord"] == "[redacted]"
    assert result["passWord"] == "[redacted]"
    assert result["eMail"] == "[redacted]"
    assert result["Authorization"] == "[redacted]"
    assert result["User"] == "[redacted]"
    assert result["normalKey"] == "normalValue"
    assert result["count"] == 100
