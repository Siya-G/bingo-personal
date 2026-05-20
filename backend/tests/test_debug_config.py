"""Smoke tests for the local-only debug config endpoint."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_debug_config_returns_flags_without_secrets(client: TestClient) -> None:
    response = client.get("/debug/config")
    assert response.status_code == 200
    data = response.json()
    assert {
        "env_file",
        "env_file_exists",
        "use_mock_llm",
        "openai_model",
        "openai_api_key_present",
        "bingo_item_pool_size",
        "bingo_card_cell_count",
        "smtp_configured",
        "smtp_host",
        "smtp_port",
        "smtp_use_tls",
        "smtp_use_ssl",
        "smtp_from",
        "smtp_host_present",
        "smtp_from_present",
        "smtp_username_present",
        "smtp_password_present",
        "smtp_has_credentials",
    }.issubset(set(data.keys()))
    assert isinstance(data["use_mock_llm"], bool)
    assert isinstance(data["openai_model"], str)
    assert isinstance(data["openai_api_key_present"], bool)
    assert isinstance(data["smtp_configured"], bool)
    assert isinstance(data["smtp_host_present"], bool)
    assert isinstance(data["smtp_password_present"], bool)
    assert "sk-" not in response.text


def test_smtp_health_reports_preview_when_unset(client: TestClient) -> None:
    response = client.get("/health/smtp")
    assert response.status_code == 200
    data = response.json()
    assert data["configured"] is False
    assert data["mode"] == "preview"
