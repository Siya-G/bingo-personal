"""Host voice profile persistence and sample upload handling."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import BACKEND_ROOT, settings
from app.models.host_voice import HostVoiceProfile
from app.models.host_voice import VOICE_PROVIDERS
from app.services.elevenlabs_voice import (
    clone_instant_voice,
    delete_cloned_voice,
)
from app.services.tts_cache import clear_tts_cache_for_game
from app.schemas.host_voice import (
    HostVoiceProfilePublic,
    HostVoiceProfileResponse,
    HostVoiceSampleResponse,
)

logger = logging.getLogger(__name__)

VOICE_SAMPLES_DIR = BACKEND_ROOT / "storage" / "voice_samples"
MAX_SAMPLE_BYTES = 10 * 1024 * 1024  # 10 MB
ALLOWED_AUDIO_CONTENT_TYPES = frozenset(
    {
        "audio/webm",
        "audio/wav",
        "audio/x-wav",
        "audio/ogg",
        "audio/mp4",
    }
)


def normalize_voice_provider(raw: str | None) -> str:
    """Map ``VOICE_PROVIDER`` env value to stored provider enum."""
    key = (raw or "demo").strip().lower()
    mapping = {
        "demo": "DEMO",
        "elevenlabs": "ELEVENLABS",
        "azure": "AZURE",
    }
    provider = mapping.get(key, "DEMO")
    if provider not in VOICE_PROVIDERS:
        return "DEMO"
    return provider


def is_demo_provider(provider: str) -> bool:
    return provider.upper() == "DEMO"


def profile_uses_demo_narration(
    row: HostVoiceProfile | None,
    *,
    default_provider: str,
) -> bool:
    """True when narration should fall back to browser TTS (no cloned voice)."""
    if row is None or not row.active:
        return is_demo_provider(default_provider)
    if row.provider == "DEMO":
        return True
    if row.provider == "ELEVENLABS":
        return not bool(row.provider_voice_id and row.provider_voice_id.strip())
    return True


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _profile_for_game(db: Session, game_id: int) -> HostVoiceProfile | None:
    """Prefer the active row; otherwise the newest profile for the game."""
    active = db.scalar(
        select(HostVoiceProfile)
        .where(
            HostVoiceProfile.game_id == game_id,
            HostVoiceProfile.active.is_(True),
        )
        .order_by(HostVoiceProfile.id.desc())
        .limit(1)
    )
    if active is not None:
        return active
    return db.scalar(
        select(HostVoiceProfile)
        .where(HostVoiceProfile.game_id == game_id)
        .order_by(HostVoiceProfile.id.desc())
        .limit(1)
    )


def _to_profile_response(row: HostVoiceProfile) -> HostVoiceProfileResponse:
    return HostVoiceProfileResponse(
        id=row.id,
        game_id=row.game_id,
        consent_given=row.consent_given,
        consent_timestamp=row.consent_timestamp,
        consent_text=row.consent_text,
        voice_mode=row.voice_mode,  # type: ignore[arg-type]
        provider=row.provider,  # type: ignore[arg-type]
        active=row.active,
        expires_at=row.expires_at,
        created_at=row.created_at,
    )


def _to_public_profile(
    row: HostVoiceProfile | None,
    *,
    default_provider: str,
) -> HostVoiceProfilePublic:
    if row is None:
        provider = default_provider
        return HostVoiceProfilePublic(
            voice_mode="DEFAULT",
            consent_given=False,
            provider=provider,  # type: ignore[arg-type]
            active=False,
            demo_mode=profile_uses_demo_narration(None, default_provider=provider),
        )
    return HostVoiceProfilePublic(
        voice_mode=row.voice_mode,  # type: ignore[arg-type]
        consent_given=row.consent_given,
        provider=row.provider,  # type: ignore[arg-type]
        active=row.active,
        demo_mode=profile_uses_demo_narration(row, default_provider=default_provider),
    )


def record_host_voice_consent(
    *,
    db: Session,
    game_id: int,
    consent_text: str,
) -> HostVoiceProfileResponse:
    """Create or update the game's host voice profile with consent metadata."""
    provider = normalize_voice_provider(settings.voice_provider)
    now = _utc_now()
    expires_at = now + timedelta(hours=settings.voice_profile_ttl_hours)

    row = _profile_for_game(db, game_id)
    if row is None:
        row = HostVoiceProfile(game_id=game_id)
        db.add(row)

    row.consent_given = True
    row.consent_timestamp = now
    row.consent_text = consent_text
    row.voice_mode = "HOST_VOICE"
    row.provider = provider
    row.expires_at = expires_at
    # Sample upload sets active=True; consent alone does not activate narration.
    row.active = False

    db.commit()
    db.refresh(row)
    return _to_profile_response(row)


async def save_host_voice_sample(
    *,
    db: Session,
    game_id: int,
    upload: UploadFile,
) -> HostVoiceSampleResponse:
    """Validate, store sample audio, and activate the profile for this game."""
    row = _profile_for_game(db, game_id)
    if row is None or not row.consent_given:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Record host voice consent before uploading a sample.",
        )

    content_type = (upload.content_type or "").split(";")[0].strip().lower()
    if content_type not in ALLOWED_AUDIO_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                "Unsupported audio type. Allowed: audio/webm, audio/wav, "
                "audio/ogg, audio/mp4."
            ),
        )

    body = await upload.read()
    if not body:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Audio file is empty.",
        )
    if len(body) > MAX_SAMPLE_BYTES:
        code = getattr(status, "HTTP_413_CONTENT_TOO_LARGE", 413)
        raise HTTPException(
            status_code=code,
            detail="Audio file exceeds the 10 MB limit.",
        )

    VOICE_SAMPLES_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = int(_utc_now().timestamp())
    filename = f"{game_id}_{timestamp}.webm"
    dest = VOICE_SAMPLES_DIR / filename
    dest.write_bytes(body)

    row.sample_audio_path = str(dest)
    row.active = True
    provider = normalize_voice_provider(settings.voice_provider)
    row.provider = provider
    clone_error: str | None = None
    demo_mode = True

    if is_demo_provider(provider):
        row.provider_voice_id = None
    elif provider == "ELEVENLABS":
        voice_id = clone_instant_voice(audio_path=dest, game_id=game_id)
        if voice_id:
            row.provider_voice_id = voice_id
            row.provider = "ELEVENLABS"
            demo_mode = False
        else:
            row.provider_voice_id = None
            clone_error = "Voice cloning failed, using demo mode"
            demo_mode = True
    elif provider == "AZURE":
        # TODO: Azure Custom Neural Voice clone when VOICE_PROVIDER=azure
        row.provider_voice_id = None

    db.commit()
    db.refresh(row)

    return HostVoiceSampleResponse(
        demo_mode=demo_mode,
        active=row.active,
        provider=row.provider,  # type: ignore[arg-type]
        error=clone_error,
    )


def get_host_voice_profile_public(
    *,
    db: Session,
    game_id: int,
) -> HostVoiceProfilePublic:
    """Return the public profile view (no sample paths)."""
    default_provider = normalize_voice_provider(settings.voice_provider)
    row = _profile_for_game(db, game_id)
    return _to_public_profile(row, default_provider=default_provider)


def deactivate_host_voice_profile(*, db: Session, game_id: int) -> bool:
    """Soft-delete: deactivate profile, remove ElevenLabs clone and TTS cache."""
    row = _profile_for_game(db, game_id)
    if row is None:
        clear_tts_cache_for_game(game_id)
        return True

    voice_id = (row.provider_voice_id or "").strip()
    if voice_id:
        delete_cloned_voice(voice_id)
        row.provider_voice_id = None

    row.active = False
    db.commit()
    clear_tts_cache_for_game(game_id)
    return True
