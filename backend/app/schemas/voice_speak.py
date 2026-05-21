"""Schemas for OpenAI TTS speak endpoint (separate from profile CRUD)."""

from pydantic import BaseModel, Field


class HostVoiceSpeakRequest(BaseModel):
    """Body for POST /games/{game_id}/voice/speak."""

    text: str = Field(..., min_length=1, max_length=4096)


class HostVoiceSpeakResponse(BaseModel):
    """TTS result — ``audio_url`` is null when running in demo / fallback mode."""

    audio_url: str | None
    demo_mode: bool
