"""Workplace demo: Teams-style invite email preview and optional SMTP send."""

from __future__ import annotations

import html
import logging
import re
from datetime import UTC, datetime
from typing import Any, Literal
from urllib.parse import urlparse

from sqlalchemy.orm import Session

from app.config import Settings
from app.models import Game, GameInvite
from app.services.smtp_mailer import (
    SmtpSendError,
    describe_smtp,
    is_smtp_configured,
    send_email,
)

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


def build_invite_html_body(
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

    e = html.escape
    return (
        '<!doctype html>'
        '<html><body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,'
        'sans-serif;background:#0f172a;margin:0;padding:24px;color:#e2e8f0;">'
        '<table role="presentation" cellspacing="0" cellpadding="0" border="0" '
        'width="100%" style="max-width:560px;margin:0 auto;background:#111827;'
        'border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">'
        '<tr><td style="padding:24px 28px;background:linear-gradient(135deg,#0ea5e9,'
        '#a855f7);color:#0f172a;">'
        f'<div style="font-size:12px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;">Virtual Bingo Invite</div>'
        f'<div style="margin-top:8px;font-size:22px;font-weight:800;color:#0f172a;">{e(game_title)}</div>'
        '</td></tr>'
        '<tr><td style="padding:24px 28px;font-size:14px;line-height:1.55;">'
        f'<p style="margin:0 0 8px 0;">Hi everyone,</p>'
        f'<p style="margin:0 0 16px 0;">You&rsquo;re invited to a Virtual Bingo session.</p>'
        '<div style="background:#0b1220;border:1px solid rgba(255,255,255,0.07);'
        'border-radius:12px;padding:14px 16px;margin:0 0 16px 0;">'
        f'<div><strong style="color:#fef08a;">Topic:</strong> {e(topic_line)}</div>'
        f'<div style="margin-top:6px;"><strong style="color:#fef08a;">Start time:</strong> {e(start_line)}</div>'
        f'<div style="margin-top:6px;"><strong style="color:#fef08a;">Room code:</strong> '
        f'<span style="font-family:monospace;font-size:16px;color:#fff;">{e(room_code)}</span></div>'
        f'<div style="margin-top:6px;color:#94a3b8;font-size:12px;">Game ID (host tools): {e(str(game_id))}</div>'
        '</div>'
        '<div style="margin:0 0 12px 0;">'
        f'<a href="{e(teams_join_url)}" '
        'style="display:inline-block;padding:12px 18px;border-radius:9999px;'
        'background:#22d3ee;color:#0f172a;font-weight:800;text-decoration:none;'
        'margin-right:8px;">Join Teams meeting</a>'
        f'<a href="{e(bingo_join_url)}" '
        'style="display:inline-block;padding:12px 18px;border-radius:9999px;'
        'background:#fde047;color:#0f172a;font-weight:800;text-decoration:none;">'
        'Open Bingo game</a>'
        '</div>'
        '<p style="margin:16px 0 6px 0;color:#cbd5e1;">If the buttons do not work, '
        'use these links:</p>'
        f'<p style="margin:0 0 4px 0;word-break:break-all;"><a href="{e(teams_join_url)}" '
        f'style="color:#7dd3fc;">{e(teams_join_url)}</a></p>'
        f'<p style="margin:0 0 16px 0;word-break:break-all;"><a href="{e(bingo_join_url)}" '
        f'style="color:#fde047;">{e(bingo_join_url)}</a></p>'
        '<ol style="margin:0 0 0 18px;padding:0;color:#cbd5e1;">'
        '<li>Join the Teams meeting.</li>'
        '<li>Open the Bingo game link.</li>'
        '<li>Enter the room code.</li>'
        '<li>Listen for the Bingo Agent to call each item.</li>'
        '<li>Mark your card when you have the called word.</li>'
        '<li>Click Bingo when you complete the winning pattern.</li>'
        '</ol>'
        '</td></tr>'
        '<tr><td style="padding:14px 28px;background:#0b1220;color:#64748b;'
        'font-size:11px;">This invite was sent by your Virtual Bingo host.</td></tr>'
        '</table></body></html>'
    )


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
    text_body = build_invite_body(
        game_title=game.title,
        topic=game.topic,
        scheduled_start_time=scheduled_start_time,
        teams_join_url=trimmed_teams,
        bingo_join_url=bingo_join_url,
        room_code=game.game_code,
        game_id=game.id,
    )
    html_body = build_invite_html_body(
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
            error_message=None,
            sent_at=None,
        )
        db.add(row)
        rows.append(row)
    db.flush()

    smtp_status = describe_smtp(settings)
    mode: InviteMode = "preview"
    sent_count = 0
    failed_count = 0

    if is_smtp_configured(settings):
        mode = "sent"
        logger.info(
            "Dispatching invites via SMTP host=%s port=%s tls=%s ssl=%s recipients=%d",
            smtp_status.host,
            smtp_status.port,
            smtp_status.use_tls,
            smtp_status.use_ssl,
            len(rows),
        )
        for row in rows:
            # Per-recipient try/except: one failure must not block the rest.
            try:
                send_email(
                    settings,
                    to_addr=row.email,
                    subject=subject,
                    text_body=text_body,
                    html_body=html_body,
                )
                row.invite_status = "SENT"
                row.error_message = None
                row.sent_at = datetime.now(UTC)
                sent_count += 1
            except SmtpSendError as exc:
                row.invite_status = "FAILED"
                row.error_message = str(exc)[:500]
                row.sent_at = None
                failed_count += 1
                logger.warning(
                    "Invite SMTP send failed game_id=%s to=%s: %s",
                    game.id,
                    row.email,
                    exc,
                )
            except Exception as exc:  # noqa: BLE001 — never let a single send abort the batch
                row.invite_status = "FAILED"
                row.error_message = f"Unexpected error: {exc.__class__.__name__}"[:500]
                row.sent_at = None
                failed_count += 1
                logger.exception(
                    "Invite send crashed game_id=%s to=%s", game.id, row.email
                )
        if sent_count > 0:
            game.invites_sent_at = datetime.now(UTC)
    else:
        logger.info(
            "SMTP not configured — storing %d invites as PREVIEW for game_id=%s",
            len(rows),
            game.id,
        )

    db.commit()

    recipients = [
        {
            "email": row.email,
            "invite_status": row.invite_status,
            "error_message": row.error_message,
            "sent_at": row.sent_at,
        }
        for row in rows
    ]

    return {
        "mode": mode,
        "smtp_configured": smtp_status.configured,
        "smtp_host": smtp_status.host,
        "sent_count": sent_count,
        "failed_count": failed_count,
        "game_id": str(game.id),
        "room_code": game.game_code,
        "bingo_join_url": bingo_join_url,
        "teams_join_url": trimmed_teams,
        "recipients": recipients,
        "subject": subject,
        "body_preview": text_body,
    }
