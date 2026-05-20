"""Chat moderation pipeline (rule-based, with optional AI).

The chat route calls :func:`moderate_chat_message` before persisting or
broadcasting any HOST/PLAYER message. ``moderate_chat_message`` returns a
:class:`ModerationDecision`:

* ``allowed=True``  → save + broadcast as usual.
* ``allowed=False`` → the route raises a 422 with a structured payload and
  records an ``ModerationEvent`` row so the host/admin can audit blocked
  content. The blocked message is **never** saved as a normal
  ``chat_messages`` row and is **never** broadcast over WebSocket.

The local rule-based filter always runs (it cannot be disabled, fails closed
on errors). The OpenAI Moderation API can be optionally layered on top by
setting ``CHAT_USE_AI_MODERATION=true`` *and* providing ``OPENAI_API_KEY``.
"""

from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Literal

from app.config import settings
from app.models.chat import (
    CHAT_MESSAGE_MAX_LENGTH,
    MODERATION_DETAIL_MAX_LENGTH,
)

logger = logging.getLogger(__name__)

ModerationReason = Literal[
    "inappropriate_language",
    "spam_repetition",
    "html_or_script",
    "ai_moderation",
]


@dataclass(frozen=True)
class ModerationDecision:
    """Outcome of running the moderation pipeline over a single message."""

    allowed: bool
    reason: ModerationReason | None = None
    detail: str | None = None

    @classmethod
    def allow(cls) -> "ModerationDecision":
        return cls(allowed=True)

    @classmethod
    def block(
        cls, reason: ModerationReason, detail: str | None = None
    ) -> "ModerationDecision":
        return cls(allowed=False, reason=reason, detail=_truncate_detail(detail))


def _truncate_detail(detail: str | None) -> str | None:
    if detail is None:
        return None
    return detail[:MODERATION_DETAIL_MAX_LENGTH]


# Common obfuscation map: leetspeak / symbols → letters. Applied to a copy of
# the message before scanning so "f@ck" still matches "fuck". The original
# message text is what we store in ``ModerationEvent`` — normalization only
# affects matching, never persistence.
_LEET_MAP = str.maketrans(
    {
        "0": "o",
        "1": "i",
        "3": "e",
        "4": "a",
        "5": "s",
        "7": "t",
        "@": "a",
        "$": "s",
        "!": "i",
    }
)

# Strip combining marks ("ǹ", "ñ") so accented obfuscation can't bypass the
# matcher. Unicode normalization runs before leet folding.
_COMBINING_RE = re.compile(r"[\u0300-\u036f]")

# Matches an HTML tag or attribute-style JS handler. Used to catch raw HTML /
# script injection attempts; we don't try to be a full HTML parser, only to
# refuse anything that looks like markup. Chat is plain text, so any tag-like
# token is suspicious — frontend React already escapes text content, but we
# also refuse to STORE raw markup so a future renderer can't be tricked into
# rendering it.
_HTML_TAG_RE = re.compile(
    r"<\s*/?\s*[a-z][a-z0-9-]*"  # any opening or closing tag like <a, </div
    r"|on[a-z]+\s*=",             # any on*= JS attribute handler
    re.IGNORECASE,
)

# Detects the kind of repeated-character / repeated-token spam that is annoying
# in chat without being inappropriate per-se. Tunable via ``min_run`` below.
_SPAM_RUN_RE = re.compile(r"(.)\1{9,}")  # 10+ identical characters in a row


@lru_cache(maxsize=1)
def _load_blocked_terms() -> tuple[str, ...]:
    """Read and cache the blocked-terms list.

    Loaded from ``CHAT_BLOCKED_WORDS_FILE`` if set, otherwise from the JSON
    file packaged next to this module. Entries are lowercased and de-duped.
    Failure to load is logged but is NOT fatal — the moderator falls back to
    an empty list (which still blocks HTML / spam patterns).
    """
    override = os.environ.get("CHAT_BLOCKED_WORDS_FILE", "").strip()
    candidates: list[Path] = []
    if override:
        candidates.append(Path(override))
    candidates.append(Path(__file__).with_name("chat_moderation_words.json"))

    for path in candidates:
        try:
            if not path.exists():
                continue
            raw = json.loads(path.read_text(encoding="utf-8"))
            terms = raw.get("blocked_terms") if isinstance(raw, dict) else None
            if not isinstance(terms, list):
                continue
            unique: dict[str, None] = {}
            for term in terms:
                if not isinstance(term, str):
                    continue
                cleaned = term.strip().lower()
                if cleaned:
                    unique.setdefault(cleaned, None)
            return tuple(unique.keys())
        except Exception:
            logger.exception(
                "Failed to load chat moderation word list from %s — continuing", path
            )

    logger.warning(
        "Chat moderation: no blocked-terms file found; rule-based filter will only "
        "catch HTML/script and spam patterns."
    )
    return ()


def reload_blocked_terms() -> None:
    """Drop the cached blocked-terms tuple (for tests / hot-reload tooling)."""
    _load_blocked_terms.cache_clear()


def _strip_combining(text: str) -> str:
    import unicodedata

    nfd = unicodedata.normalize("NFD", text)
    return _COMBINING_RE.sub("", nfd)


def _normalize_for_match(message: str) -> str:
    """Lowercase, strip accents, fold leet, collapse whitespace.

    The matcher uses this normalized form to detect obfuscated profanity.
    """
    lowered = _strip_combining(message).lower()
    folded = lowered.translate(_LEET_MAP)
    # Collapse repeated punctuation/whitespace to a single space so
    # "f-u-c-k" and "f u c k" both reduce to "f u c k" / "fuck".
    collapsed = re.sub(r"[\s_\-./*]+", " ", folded)
    return collapsed.strip()


def _build_term_pattern(term: str) -> re.Pattern[str]:
    """Compile a whole-word match for ``term``.

    Multi-word phrases ("kill yourself") match across one or more spaces.
    Single tokens are bounded by ``\\b`` so "shitake" doesn't trigger "shit"
    but "shit!" or "shit?" still does. Cached so repeated messages reuse the
    same compiled pattern.
    """
    parts = [re.escape(p) for p in term.split()]
    body = r"\s+".join(parts)
    return re.compile(rf"(?<![a-z0-9]){body}(?![a-z0-9])", re.IGNORECASE)


@lru_cache(maxsize=512)
def _compiled_pattern(term: str) -> re.Pattern[str]:
    return _build_term_pattern(term)


def _find_blocked_term(normalized: str) -> str | None:
    for term in _load_blocked_terms():
        if _compiled_pattern(term).search(normalized):
            return term
    return None


def _looks_like_html_injection(message: str) -> bool:
    # Frontend already escapes text content (React renders strings safely), but
    # we still refuse to STORE raw markup so a future renderer can't be tricked
    # into rendering it as HTML. Heuristic: any HTML-ish tag or on*= handler.
    return bool(_HTML_TAG_RE.search(message))


def _looks_like_spam(message: str) -> bool:
    if _SPAM_RUN_RE.search(message):
        return True
    # All-caps shouting + very long? Block as spam to discourage griefing.
    if (
        len(message) > 80
        and sum(1 for c in message if c.isalpha()) > 0
        and message == message.upper()
    ):
        return True
    return False


def _ai_moderation_block(message: str) -> ModerationDecision | None:
    """Optional OpenAI moderation pass.

    Disabled unless both ``CHAT_USE_AI_MODERATION=true`` and ``OPENAI_API_KEY``
    are set. Network failures fall through to "allow at the AI stage" — the
    local rule-based filter is always authoritative for clear cases.
    """
    if not _ai_moderation_enabled():
        return None
    try:  # Imported lazily so the dependency stays optional.
        from openai import OpenAI  # type: ignore
    except Exception:  # pragma: no cover - optional dep
        logger.debug("OpenAI SDK not installed; skipping AI moderation")
        return None

    try:
        client = OpenAI(api_key=settings.openai_api_key)
        result = client.moderations.create(
            model="omni-moderation-latest",
            input=message,
        )
        flagged = bool(getattr(result.results[0], "flagged", False))
        if not flagged:
            return None
        categories = getattr(result.results[0], "categories", None)
        # Pick the top-ranked flagged category for the audit detail.
        top = None
        if categories is not None:
            for name, value in dict(categories).items():
                if value:
                    top = name
                    break
        return ModerationDecision.block(
            "ai_moderation",
            detail=f"AI flag: {top}" if top else "AI flag",
        )
    except Exception:
        # AI moderation is best-effort; never block the chat path on a network
        # / quota error. The local filter already ran before this.
        logger.warning("OpenAI moderation call failed; falling back to local rules")
        return None


def _ai_moderation_enabled() -> bool:
    raw = os.environ.get("CHAT_USE_AI_MODERATION", "").strip().lower()
    if raw not in {"1", "true", "yes", "on"}:
        return False
    if not getattr(settings, "openai_api_key", ""):
        return False
    return True


def moderate_chat_message(
    *,
    message: str,
    sender_role: str,
) -> ModerationDecision:
    """Run the moderation pipeline over ``message`` and return a decision.

    The pipeline is intentionally short-circuit:

    1. Length guard — should already be enforced upstream, but we double-check
       so the moderator can never be skipped by passing the schema layer.
    2. HTML/script injection guard.
    3. Spam pattern guard.
    4. Blocked-term scan over the normalized text.
    5. Optional AI moderation (when enabled + reachable).

    ``sender_role == "SYSTEM"`` is allowed through the blocked-term scan but
    still subject to HTML/script guards — the chat service uses fixed strings
    for system lines, so a flag here would indicate a bug.
    """
    raw = message or ""
    stripped = raw.strip()
    if not stripped:
        # Upstream will have already rejected this; treat as block for safety.
        return ModerationDecision.block(
            "inappropriate_language",
            detail="Empty after strip",
        )
    if len(stripped) > CHAT_MESSAGE_MAX_LENGTH:
        return ModerationDecision.block(
            "inappropriate_language",
            detail="Exceeds max length",
        )

    if _looks_like_html_injection(stripped):
        return ModerationDecision.block(
            "html_or_script",
            detail="Looks like HTML/script markup",
        )

    if sender_role != "SYSTEM" and _looks_like_spam(stripped):
        return ModerationDecision.block(
            "spam_repetition",
            detail="Excessive repetition or shouting",
        )

    if sender_role != "SYSTEM":
        normalized = _normalize_for_match(stripped)
        term = _find_blocked_term(normalized)
        if term is not None:
            return ModerationDecision.block(
                "inappropriate_language",
                detail=f"Matched blocked term: {term!r}",
            )

        ai_block = _ai_moderation_block(stripped)
        if ai_block is not None:
            return ai_block

    return ModerationDecision.allow()


__all__ = [
    "ModerationDecision",
    "ModerationReason",
    "moderate_chat_message",
    "reload_blocked_terms",
]
