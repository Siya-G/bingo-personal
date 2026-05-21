"""Serve cached OpenAI TTS MP3 files — only ``.mp3`` under ``storage/tts_cache``."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse

from app.services.tts_cache import resolve_cached_audio_path

router = APIRouter(tags=["voice-audio"])


@router.get("/voice/audio/{filename}")
def get_tts_audio(filename: str) -> FileResponse:
    """Stream a cached TTS file. Rejects non-``.mp3`` or path-traversal names."""
    if not filename.endswith(".mp3"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audio not found.",
        )

    path = resolve_cached_audio_path(filename)
    if path is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audio not found.",
        )

    return FileResponse(path, media_type="audio/mpeg")
