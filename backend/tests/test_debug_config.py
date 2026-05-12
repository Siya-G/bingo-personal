"""Smoke tests for the local-only debug config endpoint."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_debug_config_returns_flags_without_secrets(client: TestClient) -> None:
    response = client.get("/debug/config")
    assert response.status_code == 200
    data = response.json()
    assert set(data.keys()) == {
        "use_mock_llm",
        "openai_model",
        "openai_api_key_present",
        "bingo_item_pool_size",
        "bingo_card_cell_count",
    }
    assert isinstance(data["use_mock_llm"], bool)
    assert isinstance(data["openai_model"], str)
    assert isinstance(data["openai_api_key_present"], bool)
    assert "sk-" not in response.text
