"""Host voice cloning / TTS profile (opt-in, per-game).

Stored separately from the ``games`` row so the consent record and any
provider-specific voice IDs / sample audio paths can be audited and expired
independently of the game itself. No endpoints or service code consumes this
yet — this milestone only ships the model, migration, and config plumbing.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.connection import Base

# Allowed values kept in module-level tuples (not SQL ENUMs) to match the rest
# of the codebase, which uses ``String`` columns for status-like fields. This
# keeps SQLite migrations simple and avoids cross-dialect ENUM headaches.
VOICE_MODES: tuple[str, ...] = ("DEFAULT", "HOST_VOICE")
VOICE_PROVIDERS: tuple[str, ...] = ("DEMO", "ELEVENLABS", "AZURE")

VOICE_MODE_MAX_LENGTH = 32
VOICE_PROVIDER_MAX_LENGTH = 32
VOICE_PROVIDER_ID_MAX_LENGTH = 128
VOICE_SAMPLE_PATH_MAX_LENGTH = 512
VOICE_CONSENT_TEXT_MAX_LENGTH = 2000


class HostVoiceProfile(Base):
    """Opt-in host voice profile for the Bingo Agent narration.

    ``consent_text`` captures the exact wording shown to the host at the time
    they consented so disputes can be resolved with the original disclosure.
    ``expires_at`` is intended for TTL-based cleanup (e.g. delete cloned voice
    artefacts after ``VOICE_PROFILE_TTL_HOURS`` hours).
    """

    __tablename__ = "host_voice_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    game_id: Mapped[int] = mapped_column(
        ForeignKey("games.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    # Consent — recorded for every row, even when the host later turns the
    # feature off, so we keep a tamper-evident trail of "they did say yes".
    consent_given: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    consent_timestamp: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    consent_text: Mapped[str | None] = mapped_column(
        String(VOICE_CONSENT_TEXT_MAX_LENGTH),
        nullable=True,
    )

    # What to play when the agent speaks. ``DEFAULT`` keeps the existing browser
    # TTS path; ``HOST_VOICE`` routes through ``provider``.
    voice_mode: Mapped[str] = mapped_column(
        String(VOICE_MODE_MAX_LENGTH),
        default="DEFAULT",
        nullable=False,
    )

    # Provider routing. ``DEMO`` means "no external API call — use a built-in
    # placeholder voice / sample". Real providers (ELEVENLABS, AZURE) require
    # the matching env credentials to be set.
    provider: Mapped[str] = mapped_column(
        String(VOICE_PROVIDER_MAX_LENGTH),
        default="DEMO",
        nullable=False,
    )
    provider_voice_id: Mapped[str | None] = mapped_column(
        String(VOICE_PROVIDER_ID_MAX_LENGTH),
        nullable=True,
    )
    sample_audio_path: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # ``active=True`` designates the row the agent should currently use for the
    # game; other rows for the same game remain as history. We do NOT enforce
    # this with a partial unique index — the service layer will keep at most
    # one active row per game.
    active: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    game: Mapped["Game"] = relationship("Game")
