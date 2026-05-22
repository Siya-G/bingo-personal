"""Tests for ElevenLabs TTS speak endpoint and cached audio serving."""

from __future__ import annotations

from urllib.parse import urlparse

import pytest
from fastapi.testclient import TestClient

DEFAULT_HOST_PIN = "test-host-pin-1234"


def _host_headers(pin: str = DEFAULT_HOST_PIN) -> dict[str, str]:
    return {"X-Host-Pin": pin}


def _create_game(client: TestClient) -> dict:
    response = client.post(
        "/games",
        json={
            "title": "Voice Speak Test",
            "topic": "Mountains",
            "host_pin": DEFAULT_HOST_PIN,
            "number_of_players": 10,
            "winning_patterns": ["HORIZONTAL_ROW"],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_voice_speak_demo_mode_without_elevenlabs(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.services.elevenlabs_voice.settings.voice_provider",
        "demo",
    )
    monkeypatch.setattr(
        "app.services.elevenlabs_voice.settings.elevenlabs_api_key",
        "test-key",
    )

    game = _create_game(client)
    response = client.post(
        f"/games/{game['id']}/voice/speak",
        headers=_host_headers(),
        json={"text": "Everest. Tallest peak."},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["demo_mode"] is True
    assert body["audio_url"] is None


def test_voice_speak_generates_cached_mp3(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    cache_dir = tmp_path / "tts_cache"
    cache_dir.mkdir()
    monkeypatch.setattr("app.services.tts_cache.TTS_CACHE_DIR", cache_dir)
    monkeypatch.setattr(
        "app.services.elevenlabs_voice.settings.voice_provider",
        "elevenlabs",
    )
    monkeypatch.setattr(
        "app.services.elevenlabs_voice.settings.elevenlabs_api_key",
        "test-key",
    )

    game = _create_game(client)
    voice_id = "21m00Tcm4TlvDq8ikWAM"

    class _FakeProfile:
        provider_voice_id = voice_id

    monkeypatch.setattr(
        "app.routes.voice._profile_for_game",
        lambda _db, _game_id: _FakeProfile(),
    )

    calls: list[str] = []

    def fake_synthesize(*, game_id: int, text: str, voice_id: str) -> str | None:
        from app.services.tts_cache import cached_audio_url, write_cached_mp3

        existing = cached_audio_url(game_id, text)
        if existing:
            return existing
        calls.append(text)
        return write_cached_mp3(game_id, text, b"ID3fake-mp3")

    monkeypatch.setattr(
        "app.routes.voice.synthesize_and_cache",
        fake_synthesize,
    )

    speak = client.post(
        f"/games/{game['id']}/voice/speak",
        headers=_host_headers(),
        json={"text": "Everest. Tallest peak."},
    )
    assert speak.status_code == 200
    body = speak.json()
    assert body["demo_mode"] is False
    assert body["audio_url"] is not None
    # Endpoint now returns an absolute URL (relative paths caused mixed-content
    # blocks when the Vercel frontend is HTTPS and the Railway backend returns http://).
    assert "/voice/audio/" in body["audio_url"]
    assert body["audio_url"].endswith(".mp3")

    # TestClient operates at http://testserver — extract the path for the GET.
    audio_path = urlparse(body["audio_url"]).path
    audio = client.get(audio_path)
    assert audio.status_code == 200
    assert audio.headers["content-type"] == "audio/mpeg"
    assert audio.content.startswith(b"ID3")

    speak_again = client.post(
        f"/games/{game['id']}/voice/speak",
        headers=_host_headers(),
        json={"text": "Everest. Tallest peak."},
    )
    assert speak_again.status_code == 200
    assert speak_again.json()["audio_url"] == body["audio_url"]
    assert len(calls) == 1


def test_voice_audio_rejects_non_mp3(client: TestClient) -> None:
    response = client.get("/voice/audio/evil.wav")
    assert response.status_code == 404
