"""On-disk TTS audio cache (shared by voice providers)."""

from __future__ import annotations

import hashlib
import logging
import re
from pathlib import Path

from app.config import BACKEND_ROOT

logger = logging.getLogger(__name__)

TTS_CACHE_DIR = BACKEND_ROOT / "storage" / "tts_cache"
_SAFE_FILENAME = re.compile(r"^\d+_[a-f0-9]{32}\.mp3$")


def cache_filename(game_id: int, text: str) -> str:
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()[:32]
    return f"{game_id}_{digest}.mp3"


def cached_audio_url(game_id: int, text: str) -> str | None:
    """Return public URL if this game+text MP3 is already cached."""
    trimmed = text.strip()
    if not trimmed:
        return None
    path = TTS_CACHE_DIR / cache_filename(game_id, trimmed)
    if path.is_file():
        return f"/voice/audio/{path.name}"
    return None


def is_safe_tts_filename(filename: str) -> bool:
    return bool(_SAFE_FILENAME.fullmatch(filename))


def resolve_cached_audio_path(filename: str) -> Path | None:
    if not is_safe_tts_filename(filename):
        return None
    path = (TTS_CACHE_DIR / filename).resolve()
    try:
        path.relative_to(TTS_CACHE_DIR.resolve())
    except ValueError:
        return None
    if not path.is_file() or path.suffix.lower() != ".mp3":
        return None
    return path


def write_cached_mp3(game_id: int, text: str, audio_bytes: bytes) -> str | None:
    trimmed = text.strip()
    if not trimmed or not audio_bytes:
        return None
    TTS_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    filename = cache_filename(game_id, trimmed)
    out_path = TTS_CACHE_DIR / filename
    out_path.write_bytes(audio_bytes)
    return f"/voice/audio/{filename}"


def clear_tts_cache_for_game(game_id: int) -> int:
    """Remove cached MP3 files for a game. Returns count deleted."""
    if not TTS_CACHE_DIR.is_dir():
        return 0
    removed = 0
    prefix = f"{game_id}_"
    for path in TTS_CACHE_DIR.glob(f"{prefix}*.mp3"):
        try:
            path.unlink()
            removed += 1
        except OSError:
            logger.warning("Failed to delete cached TTS file: %s", path.name)
    return removed
