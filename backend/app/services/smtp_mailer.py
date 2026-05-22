"""Reusable SMTP mail service.

Supports STARTTLS (Gmail / Outlook style on port 587), implicit SSL
(``SMTP_USE_SSL=true`` on port 465), or plain SMTP (testing only).

Secrets stay in backend ``.env`` — this module never logs the password.
"""

from __future__ import annotations

import logging
import smtplib
import socket
import ssl
import time
from dataclasses import dataclass
from email.message import EmailMessage
from typing import Final

from app.config import Settings

logger = logging.getLogger(__name__)

_TRANSIENT_ERRORS: Final[tuple[type[BaseException], ...]] = (
    smtplib.SMTPServerDisconnected,
    smtplib.SMTPConnectError,
    smtplib.SMTPHeloError,
    ConnectionError,
    TimeoutError,
    socket.timeout,
)
_MAX_ATTEMPTS: Final[int] = 2
_BACKOFF_SECONDS: Final[float] = 0.75


class SmtpSendError(Exception):
    """Raised when an SMTP send fails after retries; ``message`` is safe to surface."""

    def __init__(self, message: str, recipient: str | None = None) -> None:
        super().__init__(message)
        self.recipient = recipient


@dataclass(frozen=True)
class SmtpStatus:
    configured: bool
    host: str | None
    port: int | None
    use_tls: bool
    use_ssl: bool
    has_credentials: bool
    from_address: str | None


def is_smtp_configured(settings: Settings) -> bool:
    """Host + From are the minimum needed to attempt a real send."""
    return bool(
        settings.smtp_host.strip()
        and settings.smtp_from.strip()
        and int(settings.smtp_port) > 0
    )


def describe_smtp(settings: Settings) -> SmtpStatus:
    """Return a non-secret status snapshot for logs and the public health check."""
    return SmtpStatus(
        configured=is_smtp_configured(settings),
        host=settings.smtp_host.strip() or None,
        port=int(settings.smtp_port) if settings.smtp_port else None,
        use_tls=bool(settings.smtp_use_tls),
        use_ssl=bool(settings.smtp_use_ssl),
        has_credentials=bool(settings.smtp_username.strip()),
        from_address=settings.smtp_from.strip() or None,
    )


def log_smtp_startup_status(settings: Settings) -> None:
    """Log a one-line SMTP summary at app startup (never logs the password)."""
    status = describe_smtp(settings)
    if not status.configured:
        logger.info(
            "SMTP not configured — Bingo invites will run in preview mode."
        )
        return
    logger.info(
        "SMTP configured: host=%s port=%s ssl=%s tls=%s credentials=%s from=%s",
        status.host,
        status.port,
        status.use_ssl,
        status.use_tls,
        status.has_credentials,
        status.from_address,
    )


def _build_message(
    *,
    from_addr: str,
    to_addr: str,
    subject: str,
    text_body: str,
    html_body: str | None,
) -> EmailMessage:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_addr
    msg.set_content(text_body, subtype="plain", charset="utf-8")
    if html_body:
        msg.add_alternative(html_body, subtype="html")
    return msg


def _open_smtp(settings: Settings) -> smtplib.SMTP:
    host = settings.smtp_host.strip()
    port = int(settings.smtp_port)
    timeout = int(settings.smtp_timeout_seconds)
    if settings.smtp_use_ssl:
        context = ssl.create_default_context()
        return smtplib.SMTP_SSL(host, port, timeout=timeout, context=context)
    return smtplib.SMTP(host, port, timeout=timeout)


def _login_if_needed(server: smtplib.SMTP, settings: Settings) -> None:
    username = settings.smtp_username.strip()
    if not username:
        return
    try:
        server.login(username, settings.smtp_password or "")
    except smtplib.SMTPAuthenticationError as exc:
        # Sanitize: do not echo the password or server-specific tokens.
        raise SmtpSendError(
            "SMTP authentication failed. Verify SMTP_USERNAME and SMTP_PASSWORD "
            "(use a Gmail App Password if 2FA is on)."
        ) from exc


def _attempt_send(settings: Settings, msg: EmailMessage) -> None:
    server = _open_smtp(settings)
    try:
        server.ehlo()
        if not settings.smtp_use_ssl and settings.smtp_use_tls:
            context = ssl.create_default_context()
            server.starttls(context=context)
            server.ehlo()
        _login_if_needed(server, settings)
        server.send_message(msg)
    finally:
        try:
            server.quit()
        except Exception:  # noqa: BLE001 — closing a broken connection is best-effort
            try:
                server.close()
            except Exception:  # noqa: BLE001
                pass


def send_email(
    settings: Settings,
    *,
    to_addr: str,
    subject: str,
    text_body: str,
    html_body: str | None = None,
) -> None:
    """Send one email with simple retry on transient connection errors."""
    if not is_smtp_configured(settings):
        raise SmtpSendError("SMTP is not configured on the server.", recipient=to_addr)

    from_addr = settings.smtp_from.strip()
    msg = _build_message(
        from_addr=from_addr,
        to_addr=to_addr,
        subject=subject,
        text_body=text_body,
        html_body=html_body,
    )
    host = settings.smtp_host.strip()

    last_error: BaseException | None = None
    for attempt in range(1, _MAX_ATTEMPTS + 1):
        try:
            _attempt_send(settings, msg)
            logger.info(
                "SMTP send ok host=%s to=%s attempt=%d",
                host,
                to_addr,
                attempt,
            )
            return
        except _TRANSIENT_ERRORS as exc:
            last_error = exc
            logger.warning(
                "SMTP transient error host=%s to=%s attempt=%d/%d: %s",
                host,
                to_addr,
                attempt,
                _MAX_ATTEMPTS,
                exc.__class__.__name__,
            )
            if attempt < _MAX_ATTEMPTS:
                time.sleep(_BACKOFF_SECONDS)
                continue
            raise SmtpSendError(
                f"SMTP server {host} unreachable after {_MAX_ATTEMPTS} attempts.",
                recipient=to_addr,
            ) from exc
        except SmtpSendError:
            raise
        except smtplib.SMTPRecipientsRefused as exc:
            logger.warning("SMTP recipient refused host=%s to=%s", host, to_addr)
            raise SmtpSendError(
                f"Recipient address rejected by SMTP server: {to_addr}",
                recipient=to_addr,
            ) from exc
        except smtplib.SMTPSenderRefused as exc:
            logger.warning("SMTP sender refused host=%s from=%s", host, from_addr)
            raise SmtpSendError(
                "Sender address rejected by SMTP server. Check SMTP_FROM.",
                recipient=to_addr,
            ) from exc
        except smtplib.SMTPDataError as exc:
            logger.warning("SMTP data error host=%s to=%s code=%s", host, to_addr, exc.smtp_code)
            raise SmtpSendError(
                f"SMTP server rejected the message (code {exc.smtp_code}).",
                recipient=to_addr,
            ) from exc
        except smtplib.SMTPException as exc:
            logger.exception("SMTP unexpected error host=%s to=%s", host, to_addr)
            raise SmtpSendError(
                f"SMTP send failed for {to_addr}: {exc.__class__.__name__}.",
                recipient=to_addr,
            ) from exc

    # Defensive: loop only exits via return/raise above; this satisfies type checkers.
    raise SmtpSendError(
        f"SMTP send failed for {to_addr}.",
        recipient=to_addr,
    ) from last_error


__all__ = [
    "SmtpSendError",
    "SmtpStatus",
    "describe_smtp",
    "is_smtp_configured",
    "log_smtp_startup_status",
    "send_email",
]
