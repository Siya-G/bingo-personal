"""Host opt-in voice profile endpoints (consent, sample upload, profile read/delete).

All routes require a valid ``X-Host-Pin`` for the game. Sample files are written
under ``backend/storage/voice_samples/`` and are not exposed via static file
serving — only internal services may read ``sample_audio_path`` from the DB.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile, status
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.dependencies.game_auth import host_pin_protected_game
from app.models import Game
from app.services.game_lookup import get_game_or_404
from app.schemas.host_voice import (
    HostVoiceConsentCreate,
    HostVoiceDeactivateResponse,
    HostVoiceProfilePublic,
    HostVoiceProfileResponse,
    HostVoiceSampleResponse,
)
from app.schemas.voice_speak import HostVoiceSpeakRequest, HostVoiceSpeakResponse
from app.services.elevenlabs_voice import is_elevenlabs_enabled, synthesize_and_cache
from app.services.host_voice import (
    _profile_for_game,
    deactivate_host_voice_profile,
    get_host_voice_profile_public,
    record_host_voice_consent,
    save_host_voice_sample,
)

router = APIRouter(prefix="/games", tags=["host-voice"])


@router.post(
    "/{game_id}/voice/consent",
    response_model=HostVoiceProfileResponse,
    status_code=status.HTTP_200_OK,
)
def post_host_voice_consent(
    payload: HostVoiceConsentCreate,
    game: Game = Depends(host_pin_protected_game),
    db: Session = Depends(get_db),
) -> HostVoiceProfileResponse:
    """Record host consent and configure voice mode for this game."""
    return record_host_voice_consent(
        db=db,
        game_id=game.id,
        consent_text=payload.consent_text,
    )


@router.post(
    "/{game_id}/voice/sample",
    response_model=HostVoiceSampleResponse,
    status_code=status.HTTP_200_OK,
)
async def post_host_voice_sample(
    game: Game = Depends(host_pin_protected_game),
    db: Session = Depends(get_db),
    audio: UploadFile = File(..., description="Host voice sample (max 10 MB)"),
) -> HostVoiceSampleResponse:
    """Upload a short voice sample and activate the profile (demo or provider)."""
    return await save_host_voice_sample(db=db, game_id=game.id, upload=audio)


@router.get(
    "/{game_id}/voice/profile",
    response_model=HostVoiceProfilePublic,
)
def get_host_voice_profile(
    game_id: int,
    db: Session = Depends(get_db),
) -> HostVoiceProfilePublic:
    """Return the public voice profile state for this game (no auth required — players need this too)."""
    get_game_or_404(game_id, db)
    return get_host_voice_profile_public(db=db, game_id=game_id)


@router.delete(
    "/{game_id}/voice/profile",
    response_model=HostVoiceDeactivateResponse,
)
def delete_host_voice_profile(
    game: Game = Depends(host_pin_protected_game),
    db: Session = Depends(get_db),
) -> HostVoiceDeactivateResponse:
    """Soft-delete: deactivate host voice without removing the consent record."""
    deactivate_host_voice_profile(db=db, game_id=game.id)
    return HostVoiceDeactivateResponse(success=True)


@router.post(
    "/{game_id}/voice/speak",
    response_model=HostVoiceSpeakResponse,
    status_code=status.HTTP_200_OK,
)
def post_host_voice_speak(
    game_id: int,
    payload: HostVoiceSpeakRequest,
    db: Session = Depends(get_db),
) -> HostVoiceSpeakResponse:
    """Synthesize narration via ElevenLabs cloned voice, or return demo fallback (no auth required — players need this too)."""
    get_game_or_404(game_id, db)

    if not is_elevenlabs_enabled():
        return HostVoiceSpeakResponse(audio_url=None, demo_mode=True)

    row = _profile_for_game(db, game_id)
    voice_id = (row.provider_voice_id or "").strip() if row else ""
    if not voice_id:
        return HostVoiceSpeakResponse(audio_url=None, demo_mode=True)

    audio_url = synthesize_and_cache(
        game_id=game_id,
        text=payload.text,
        voice_id=voice_id,
    )
    if audio_url is None:
        return HostVoiceSpeakResponse(audio_url=None, demo_mode=True)

    return HostVoiceSpeakResponse(audio_url=audio_url, demo_mode=False)
