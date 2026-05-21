"""Tests for ElevenLabs clone integration on sample upload."""

from __future__ import annotations

import io

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.database.connection import SessionLocal
from app.models.host_voice import HostVoiceProfile

DEFAULT_HOST_PIN = "test-host-pin-1234"
CONSENT_TEXT = (
    "I consent to storing a short voice sample for this Bingo game session only."
)


def _host_headers(pin: str = DEFAULT_HOST_PIN) -> dict[str, str]:
    return {"X-Host-Pin": pin}


def _create_game(client: TestClient) -> dict:
    response = client.post(
        "/games",
        json={
            "title": "ElevenLabs Voice Test",
            "topic": "Mountains",
            "host_pin": DEFAULT_HOST_PIN,
            "number_of_players": 4,
            "winning_patterns": ["HORIZONTAL_ROW"],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_sample_clone_saves_provider_voice_id(
    client: TestClient,
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    samples_dir = tmp_path / "voice_samples"
    monkeypatch.setattr("app.services.host_voice.VOICE_SAMPLES_DIR", samples_dir)
    monkeypatch.setattr("app.services.host_voice.settings.voice_provider", "elevenlabs")
    monkeypatch.setattr(
        "app.services.host_voice.settings.elevenlabs_api_key",
        "test-key",
    )
    monkeypatch.setattr(
        "app.services.host_voice.clone_instant_voice",
        lambda **kwargs: "abc123VoiceIdXYZ",
    )

    game = _create_game(client)
    client.post(
        f"/games/{game['id']}/voice/consent",
        json={"consent_given": True, "consent_text": CONSENT_TEXT},
        headers=_host_headers(),
    )

    response = client.post(
        f"/games/{game['id']}/voice/sample",
        headers=_host_headers(),
        files={"audio": ("sample.webm", io.BytesIO(b"\x00" * 128), "audio/webm")},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["demo_mode"] is False
    assert body["active"] is True
    assert body["provider"] == "ELEVENLABS"
    assert body.get("error") is None

    with SessionLocal() as db:
        row = db.scalar(
            select(HostVoiceProfile).where(HostVoiceProfile.game_id == game["id"])
        )
    assert row is not None
    assert row.provider_voice_id == "abc123VoiceIdXYZ"
    assert row.provider == "ELEVENLABS"


def test_sample_clone_failure_returns_demo_mode(
    client: TestClient,
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    samples_dir = tmp_path / "voice_samples"
    monkeypatch.setattr("app.services.host_voice.VOICE_SAMPLES_DIR", samples_dir)
    monkeypatch.setattr("app.services.host_voice.settings.voice_provider", "elevenlabs")
    monkeypatch.setattr(
        "app.services.host_voice.settings.elevenlabs_api_key",
        "test-key",
    )
    monkeypatch.setattr(
        "app.services.host_voice.clone_instant_voice",
        lambda **kwargs: None,
    )

    game = _create_game(client)
    client.post(
        f"/games/{game['id']}/voice/consent",
        json={"consent_given": True, "consent_text": CONSENT_TEXT},
        headers=_host_headers(),
    )

    response = client.post(
        f"/games/{game['id']}/voice/sample",
        headers=_host_headers(),
        files={"audio": ("sample.webm", io.BytesIO(b"\x00" * 64), "audio/webm")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["demo_mode"] is True
    assert body["active"] is True
    assert "Voice cloning failed" in (body.get("error") or "")
