"""Tests for opt-in host voice profile API endpoints."""

from __future__ import annotations

import io
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models.host_voice import HostVoiceProfile
from app.services.host_voice import normalize_voice_provider

DEFAULT_HOST_PIN = "test-host-pin-1234"
CONSENT_TEXT = (
    "I consent to storing a short voice sample for this Bingo game session only."
)


def _host_headers(pin: str = DEFAULT_HOST_PIN) -> dict[str, str]:
    return {"X-Host-Pin": pin}


def _create_game(client: TestClient) -> dict[str, Any]:
    response = client.post(
        "/games",
        json={
            "title": "Voice Test",
            "topic": "Famous mountains",
            "number_of_players": 4,
            "winning_pattern": "HORIZONTAL_ROW",
            "host_pin": DEFAULT_HOST_PIN,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_normalize_voice_provider_maps_env_values() -> None:
    assert normalize_voice_provider("demo") == "DEMO"
    assert normalize_voice_provider("elevenlabs") == "ELEVENLABS"
    assert normalize_voice_provider("azure") == "AZURE"
    assert normalize_voice_provider("unknown") == "DEMO"


def test_consent_creates_profile(client: TestClient) -> None:
    game = _create_game(client)
    response = client.post(
        f"/games/{game['id']}/voice/consent",
        json={"consent_given": True, "consent_text": CONSENT_TEXT},
        headers=_host_headers(),
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["game_id"] == game["id"]
    assert body["consent_given"] is True
    assert body["consent_text"] == CONSENT_TEXT
    assert body["voice_mode"] == "HOST_VOICE"
    assert body["provider"] == "DEMO"
    assert body["active"] is False
    assert "sample_audio_path" not in body


def test_consent_requires_host_pin(client: TestClient) -> None:
    game = _create_game(client)
    response = client.post(
        f"/games/{game['id']}/voice/consent",
        json={"consent_given": True, "consent_text": CONSENT_TEXT},
    )
    assert response.status_code == 401


def test_consent_rejects_false_consent(client: TestClient) -> None:
    game = _create_game(client)
    response = client.post(
        f"/games/{game['id']}/voice/consent",
        json={"consent_given": False, "consent_text": CONSENT_TEXT},
        headers=_host_headers(),
    )
    assert response.status_code == 422


def test_get_profile_defaults_when_none(client: TestClient) -> None:
    game = _create_game(client)
    response = client.get(
        f"/games/{game['id']}/voice/profile",
        headers=_host_headers(),
    )
    assert response.status_code == 200
    body = response.json()
    assert body == {
        "voice_mode": "DEFAULT",
        "consent_given": False,
        "provider": "DEMO",
        "active": False,
        "demo_mode": True,
    }
    assert "sample_audio_path" not in body


def test_get_profile_after_consent(client: TestClient) -> None:
    game = _create_game(client)
    client.post(
        f"/games/{game['id']}/voice/consent",
        json={"consent_given": True, "consent_text": CONSENT_TEXT},
        headers=_host_headers(),
    )
    response = client.get(
        f"/games/{game['id']}/voice/profile",
        headers=_host_headers(),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["voice_mode"] == "HOST_VOICE"
    assert body["consent_given"] is True
    assert body["provider"] == "DEMO"
    assert body["active"] is False
    assert body["demo_mode"] is True


def test_sample_upload_activates_profile(client: TestClient, tmp_path, monkeypatch) -> None:
    samples_dir = tmp_path / "voice_samples"
    monkeypatch.setattr("app.services.host_voice.VOICE_SAMPLES_DIR", samples_dir)

    game = _create_game(client)
    client.post(
        f"/games/{game['id']}/voice/consent",
        json={"consent_given": True, "consent_text": CONSENT_TEXT},
        headers=_host_headers(),
    )

    audio_bytes = b"\x00" * 128
    response = client.post(
        f"/games/{game['id']}/voice/sample",
        headers=_host_headers(),
        files={"audio": ("sample.webm", io.BytesIO(audio_bytes), "audio/webm")},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["demo_mode"] is True
    assert body["active"] is True

    saved = list(samples_dir.glob(f"{game['id']}_*.webm"))
    assert len(saved) == 1

    profile = client.get(
        f"/games/{game['id']}/voice/profile",
        headers=_host_headers(),
    ).json()
    assert profile["active"] is True


def test_sample_rejects_without_consent(client: TestClient) -> None:
    game = _create_game(client)
    response = client.post(
        f"/games/{game['id']}/voice/sample",
        headers=_host_headers(),
        files={"audio": ("sample.webm", io.BytesIO(b"abc"), "audio/webm")},
    )
    assert response.status_code == 400


def test_sample_rejects_invalid_mime(client: TestClient) -> None:
    game = _create_game(client)
    client.post(
        f"/games/{game['id']}/voice/consent",
        json={"consent_given": True, "consent_text": CONSENT_TEXT},
        headers=_host_headers(),
    )
    response = client.post(
        f"/games/{game['id']}/voice/sample",
        headers=_host_headers(),
        files={"audio": ("sample.txt", io.BytesIO(b"not audio"), "text/plain")},
    )
    assert response.status_code == 415


def test_sample_rejects_oversized_file(client: TestClient, monkeypatch) -> None:
    game = _create_game(client)
    client.post(
        f"/games/{game['id']}/voice/consent",
        json={"consent_given": True, "consent_text": CONSENT_TEXT},
        headers=_host_headers(),
    )
    huge = b"x" * (10 * 1024 * 1024 + 1)
    response = client.post(
        f"/games/{game['id']}/voice/sample",
        headers=_host_headers(),
        files={"audio": ("big.webm", io.BytesIO(huge), "audio/webm")},
    )
    assert response.status_code == 413


def test_delete_soft_deactivates_profile(client: TestClient, tmp_path, monkeypatch) -> None:
    samples_dir = tmp_path / "voice_samples"
    monkeypatch.setattr("app.services.host_voice.VOICE_SAMPLES_DIR", samples_dir)

    game = _create_game(client)
    client.post(
        f"/games/{game['id']}/voice/consent",
        json={"consent_given": True, "consent_text": CONSENT_TEXT},
        headers=_host_headers(),
    )
    client.post(
        f"/games/{game['id']}/voice/sample",
        headers=_host_headers(),
        files={"audio": ("sample.webm", io.BytesIO(b"\x00\x01"), "audio/webm")},
    )

    delete_response = client.delete(
        f"/games/{game['id']}/voice/profile",
        headers=_host_headers(),
    )
    assert delete_response.status_code == 200
    assert delete_response.json() == {"success": True}

    profile = client.get(
        f"/games/{game['id']}/voice/profile",
        headers=_host_headers(),
    ).json()
    assert profile["active"] is False

    from app.database.connection import SessionLocal

    with SessionLocal() as db:
        rows = list(
            db.scalars(
                select(HostVoiceProfile).where(HostVoiceProfile.game_id == game["id"])
            )
        )
        assert len(rows) == 1
        assert rows[0].active is False


def test_consent_response_never_includes_sample_path(client: TestClient, tmp_path, monkeypatch) -> None:
    samples_dir = tmp_path / "voice_samples"
    monkeypatch.setattr("app.services.host_voice.VOICE_SAMPLES_DIR", samples_dir)

    game = _create_game(client)
    consent = client.post(
        f"/games/{game['id']}/voice/consent",
        json={"consent_given": True, "consent_text": CONSENT_TEXT},
        headers=_host_headers(),
    ).json()
    assert "sample_audio_path" not in consent

    client.post(
        f"/games/{game['id']}/voice/sample",
        headers=_host_headers(),
        files={"audio": ("sample.webm", io.BytesIO(b"data"), "audio/webm")},
    )

    consent_again = client.post(
        f"/games/{game['id']}/voice/consent",
        json={"consent_given": True, "consent_text": CONSENT_TEXT},
        headers=_host_headers(),
    ).json()
    assert "sample_audio_path" not in consent_again
