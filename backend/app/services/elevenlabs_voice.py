"""ElevenLabs instant voice cloning and text-to-speech."""

from __future__ import annotations

import logging
from pathlib import Path

import httpx

from app.config import settings
from app.services.tts_cache import cached_audio_url, write_cached_mp3

logger = logging.getLogger(__name__)

ELEVENLABS_BASE = "https://api.elevenlabs.io/v1"
CLONE_TIMEOUT_SECONDS = 120.0
TTS_TIMEOUT_SECONDS = 90.0


def is_elevenlabs_enabled() -> bool:
    return (
        settings.voice_provider.strip().lower() == "elevenlabs"
        and bool(settings.elevenlabs_api_key.strip())
    )


def _api_headers(*, accept: str | None = None) -> dict[str, str]:
    headers = {"xi-api-key": settings.elevenlabs_api_key.strip()}
    if accept:
        headers["accept"] = accept
    return headers


def clone_instant_voice(*, audio_path: Path, game_id: int) -> str | None:
    """Upload a sample and return the ElevenLabs ``voice_id``, or None on failure."""
    if not is_elevenlabs_enabled():
        return None
    if not audio_path.is_file():
        logger.error("ElevenLabs clone skipped: sample missing for game_id=%s", game_id)
        return None

    voice_name = f"bingo-host-{game_id}"
    url = f"{ELEVENLABS_BASE}/voices/add"
    try:
        with audio_path.open("rb") as audio_file:
            response = httpx.post(
                url,
                headers=_api_headers(),
                data={"name": voice_name},
                files={"files": (audio_path.name, audio_file, "application/octet-stream")},
                timeout=CLONE_TIMEOUT_SECONDS,
            )
        if response.status_code >= 400:
            logger.error(
                "ElevenLabs voice clone failed for game_id=%s status=%s",
                game_id,
                response.status_code,
            )
            return None
        payload = response.json()
        voice_id = payload.get("voice_id")
        if not voice_id or not isinstance(voice_id, str):
            logger.error(
                "ElevenLabs clone response missing voice_id for game_id=%s",
                game_id,
            )
            return None
        logger.info(
            "ElevenLabs voice cloned for game_id=%s voice_id=%s",
            game_id,
            voice_id,
        )
        return voice_id
    except Exception:
        logger.exception("ElevenLabs voice clone failed for game_id=%s", game_id)
        return None


def delete_cloned_voice(voice_id: str) -> bool:
    """Delete a cloned voice from ElevenLabs. Returns True if delete succeeded."""
    if not settings.elevenlabs_api_key.strip() or not voice_id.strip():
        return False
    url = f"{ELEVENLABS_BASE}/voices/{voice_id.strip()}"
    try:
        response = httpx.delete(
            url,
            headers=_api_headers(),
            timeout=30.0,
        )
        if response.status_code >= 400:
            logger.warning(
                "ElevenLabs voice delete failed voice_id=%s status=%s",
                voice_id,
                response.status_code,
            )
            return False
        logger.info("ElevenLabs voice deleted voice_id=%s", voice_id)
        return True
    except Exception:
        logger.exception("ElevenLabs voice delete failed voice_id=%s", voice_id)
        return False


def synthesize_and_cache(
    *,
    game_id: int,
    text: str,
    voice_id: str,
) -> str | None:
    """Generate MP3 via ElevenLabs TTS; use cache when present."""
    trimmed = text.strip()
    voice = voice_id.strip()
    if not trimmed or not voice:
        return None

    existing = cached_audio_url(game_id, trimmed)
    if existing:
        return existing

    if not is_elevenlabs_enabled():
        return None

    url = f"{ELEVENLABS_BASE}/text-to-speech/{voice}"
    payload = {
        "text": trimmed,
        "model_id": "eleven_monolingual_v1",
        "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
    }
    try:
        response = httpx.post(
            url,
            headers={**_api_headers(accept="audio/mpeg"), "Content-Type": "application/json"},
            json=payload,
            timeout=TTS_TIMEOUT_SECONDS,
        )
        if response.status_code >= 400:
            logger.error(
                "ElevenLabs TTS failed game_id=%s status=%s",
                game_id,
                response.status_code,
            )
            return None
        return write_cached_mp3(game_id, trimmed, response.content)
    except Exception:
        logger.exception("ElevenLabs TTS failed for game_id=%s", game_id)
        return None
