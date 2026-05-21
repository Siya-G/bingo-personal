"""Schemas for opt-in host voice profile endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.host_voice import VOICE_CONSENT_TEXT_MAX_LENGTH

VoiceModeLiteral = Literal["DEFAULT", "HOST_VOICE"]
VoiceProviderLiteral = Literal["DEMO", "ELEVENLABS", "AZURE"]


class HostVoiceConsentCreate(BaseModel):
    """Body for POST /games/{game_id}/voice/consent."""

    consent_given: bool
    consent_text: str = Field(..., min_length=1, max_length=VOICE_CONSENT_TEXT_MAX_LENGTH)

    @field_validator("consent_text")
    @classmethod
    def strip_consent_text(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("consent_text cannot be empty or whitespace only.")
        return stripped

    @field_validator("consent_given")
    @classmethod
    def must_consent(cls, value: bool) -> bool:
        if not value:
            raise ValueError("consent_given must be true to enable host voice.")
        return value


class HostVoiceProfileResponse(BaseModel):
    """Saved profile returned by consent — never includes sample_audio_path."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    game_id: int
    consent_given: bool
    consent_timestamp: datetime | None
    consent_text: str | None
    voice_mode: VoiceModeLiteral
    provider: VoiceProviderLiteral
    active: bool
    expires_at: datetime | None
    created_at: datetime


class HostVoiceProfilePublic(BaseModel):
    """Public GET shape — no internal paths or provider voice IDs."""

    voice_mode: VoiceModeLiteral
    consent_given: bool
    provider: VoiceProviderLiteral
    active: bool
    demo_mode: bool


class HostVoiceSampleResponse(BaseModel):
    """Response after uploading a voice sample."""

    demo_mode: bool
    active: bool
    provider: VoiceProviderLiteral | None = None
    error: str | None = None


class HostVoiceDeactivateResponse(BaseModel):
    """Response for DELETE /voice/profile (soft delete)."""

    success: bool = True
