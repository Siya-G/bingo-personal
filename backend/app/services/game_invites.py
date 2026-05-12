"""Workplace demo: Teams-style invite email preview and optional SMTP send."""

from __future__ import annotations

import logging
import re
import smtplib
from datetime import UTC, datetime
from email.message import EmailMessage
from typing import Any, Literal
from urllib.parse import urlparse

from sqlalchemy.orm import Session

from app.config import Settings
from app.models import Game, GameInvite

logger = logging.getLogger(__name__)

_EMAIL_RE = re.compile(
    r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,24}$",
)

InviteMode = Literal["preview", "sent"]


def normalize_unique_emails(raw: list[str]) -> list[str]:
    """Lowercase, trim, dedupe, and validate RFC-ish email shape."""
    seen: set[str] = set()
    out: list[str] = []
    for item in raw:
        email = str(item).strip().lower()
        if not email:
            continue
        if len(email) > 254:
            raise ValueError(f"Email address is too long: {item!r}")
        if not _EMAIL_RE.fullmatch(email):
            raise ValueError(f"Invalid email address: {item!r}")
        if email not in seen:
            seen.add(email)
            out.append(email)
    if not out:
        raise ValueError("Provide at least one valid participant email.")
    if len(out) > 100:
        raise ValueError("Too many participant emails in one batch (max 100).")
    return out


def _bingo_join_url(settings: Settings, game_code: str) -> str:
    base = settings.frontend_base_url.rstrip("/")
    return f"{base}/join?code={game_code}"


def build_invite_subject(game_title: str) -> str:
    return f"Virtual Bingo Invite: {game_title}"


def build_invite_body(
    *,
    game_title: str,
    topic: str | None,
    scheduled_start_time: datetime | None,
    teams_join_url: str,
    bingo_join_url: str,
    room_code: str,
    game_id: int,
) -> str:
    if scheduled_start_time is not None:
        st = scheduled_start_time
        if st.tzinfo is None:
            st = st.replace(tzinfo=UTC)
        start_line = st.astimezone(UTC).strftime("%Y-%m-%d %H:%M UTC")
    else:
        start_line = "To be announced"
    topic_line = topic.strip() if topic and topic.strip() else "(see game title)"
    return (
        "Hi everyone,\n\n"
        "You're invited to a Virtual Bingo session.\n\n"
        f"Game: {game_title}\n"
        f"Topic: {topic_line}\n"
        f"Start Time: {start_line}\n\n"
        "Join the Teams meeting:\n"
        f"{teams_join_url}\n\n"
        "Join the Bingo game:\n"
        f"{bingo_join_url}\n\n"
        "Room Code:\n"
        f"{room_code}\n\n"
        f"Game ID (for host tools): {game_id}\n\n"
        "Instructions:\n"
        "1. Join the Teams meeting.\n"
        "2. Open the Bingo game link.\n"
        "3. Enter the room code.\n"
        "4. Listen for the Bingo Agent to call each item and description.\n"
        "5. Mark your card when you have the called item.\n"
        "6. Click Bingo when you complete the winning pattern.\n\n"
        "Thanks!\n"
    )


def _smtp_configured(settings: Settings) -> bool:
    return bool(settings.smtp_host.strip() and settings.smtp_from.strip())


def _send_one_email(
    settings: Settings,
    *,
    to_addr: str,
    subject: str,
    body: str,
) -> None:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from.strip()
    msg["To"] = to_addr
    msg.set_content(body, subtype="plain", charset="utf-8")

    with smtplib.SMTP(
        settings.smtp_host.strip(),
        int(settings.smtp_port),
        timeout=20,
    ) as server:
        if settings.smtp_use_tls:
            server.starttls()
        user = settings.smtp_user.strip()
        password = settings.smtp_password
        if user:
            server.login(user, password or "")
        server.send_message(msg)


def process_game_invites(
    db: Session,
    game: Game,
    *,
    participant_emails: list[str],
    teams_join_url: str,
    scheduled_start_time: datetime | None,
    settings: Settings,
) -> dict[str, Any]:
    """Persist invite rows, optionally SMTP-send, return API-shaped dict."""
    emails = normalize_unique_emails(participant_emails)
    trimmed_teams = teams_join_url.strip()
    parsed = urlparse(trimmed_teams)
    if parsed.scheme != "https" or not parsed.netloc:
        raise ValueError("Teams meeting link must be a valid https:// URL.")

    bingo_join_url = _bingo_join_url(settings, game.game_code)
    subject = build_invite_subject(game.title)
    body = build_invite_body(
        game_title=game.title,
        topic=game.topic,
        scheduled_start_time=scheduled_start_time,
        teams_join_url=trimmed_teams,
        bingo_join_url=bingo_join_url,
        room_code=game.game_code,
        game_id=game.id,
    )

    game.teams_join_url = trimmed_teams
    game.scheduled_start_time = scheduled_start_time

    rows: list[GameInvite] = []
    for addr in emails:
        row = GameInvite(
            game_id=game.id,
            email=addr,
            name=None,
            invite_status="PREVIEW",
        )
        db.add(row)
        rows.append(row)
    db.flush()

    mode: InviteMode = "preview"
    recipients: list[dict[str, str]] = []

    if _smtp_configured(settings):
        mode = "sent"
        any_sent = False
        for row in rows:
            try:
                _send_one_email(
                    settings,
                    to_addr=row.email,
                    subject=subject,
                    body=body,
                )
                row.invite_status = "SENT"
                any_sent = True
            except Exception:
                logger.exception("SMTP send failed for game_id=%s to=%s", game.id, row.email)
                row.invite_status = "FAILED"
        if any_sent:
            game.invites_sent_at = datetime.now(UTC)
    else:
        for row in rows:
            row.invite_status = "PREVIEW"

    db.commit()

    for row in rows:
        recipients.append(
            {"email": row.email, "invite_status": row.invite_status},
        )

    return {
        "mode": mode,
        "game_id": str(game.id),
        "room_code": game.game_code,
        "bingo_join_url": bingo_join_url,
        "teams_join_url": trimmed_teams,
        "recipients": recipients,
        "subject": subject,
        "body_preview": body,
    }
