"""Outbound email: SendGrid Web API (preferred) with SMTP fallback.

SendGrid avoids Railway's blocked outbound SMTP port 587. When
``SENDGRID_API_KEY`` is set, sends go through the API first; SMTP is used only
as a fallback if SendGrid fails and SMTP is configured.

Secrets stay in backend ``.env`` — this module never logs API keys or passwords.
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
    """Raised when an email send fails after retries; ``message`` is safe to surface."""

    def __init__(self, message: str, recipient: str | None = None) -> None:
        super().__init__(message)
        self.recipient = recipient


@dataclass(frozen=True)
class SmtpStatus:
    configured: bool
    sendgrid_configured: bool
    email_configured: bool
    host: str | None
    port: int | None
    use_tls: bool
    use_ssl: bool
    has_credentials: bool
    from_address: str | None


def is_sendgrid_configured(settings: Settings) -> bool:
    """SendGrid API key + From address (verified sender in SendGrid)."""
    return bool(
        settings.sendgrid_api_key.strip() and settings.smtp_from.strip()
    )


def is_smtp_configured(settings: Settings) -> bool:
    """Host + From are the minimum needed to attempt a real SMTP send."""
    return bool(
        settings.smtp_host.strip()
        and settings.smtp_from.strip()
        and int(settings.smtp_port) > 0
    )


def is_email_configured(settings: Settings) -> bool:
    """True when at least one outbound email path is available."""
    return is_sendgrid_configured(settings) or is_smtp_configured(settings)


def describe_smtp(settings: Settings) -> SmtpStatus:
    """Return a non-secret status snapshot for logs and the public health check."""
    smtp_on = is_smtp_configured(settings)
    sendgrid_on = is_sendgrid_configured(settings)
    return SmtpStatus(
        configured=smtp_on,
        sendgrid_configured=sendgrid_on,
        email_configured=is_email_configured(settings),
        host=settings.smtp_host.strip() or None,
        port=int(settings.smtp_port) if settings.smtp_port else None,
        use_tls=bool(settings.smtp_use_tls),
        use_ssl=bool(settings.smtp_use_ssl),
        has_credentials=bool(settings.smtp_username.strip()),
        from_address=settings.smtp_from.strip() or None,
    )


def _email_delivery_mode(settings: Settings) -> str:
    if is_sendgrid_configured(settings):
        return "sendgrid"
    if is_smtp_configured(settings):
        return "smtp"
    return "preview"


def log_smtp_startup_status(settings: Settings) -> None:
    """Log a one-line email summary at app startup (never logs secrets)."""
    status = describe_smtp(settings)
    mode = _email_delivery_mode(settings)
    if mode == "preview":
        logger.info(
            "Email not configured — Bingo invites will run in preview mode."
        )
        return
    if mode == "sendgrid":
        logger.info(
            "Email via SendGrid API (from=%s); SMTP fallback=%s",
            status.from_address,
            "yes" if status.configured else "no",
        )
        return
    logger.info(
        "Email via SMTP: host=%s port=%s ssl=%s tls=%s credentials=%s from=%s",
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


def _send_via_sendgrid(
    settings: Settings,
    *,
    from_addr: str,
    to_addr: str,
    subject: str,
    text_body: str,
    html_body: str | None,
) -> None:
    sendgrid_key = settings.sendgrid_api_key.strip()
    from_email = from_addr
    to_email = to_addr

    logger.error("SENDGRID: attempting to send to %s", to_email)
    logger.error("SENDGRID: API key set: %s", bool(sendgrid_key))
    logger.error("SENDGRID: from email: %s", from_email)

    try:
        from sendgrid import SendGridAPIClient
        from sendgrid.helpers.mail import Mail
    except ImportError as exc:
        logger.error("SENDGRID: exception: %s", str(exc))
        raise SmtpSendError("SendGrid package is not installed.") from exc

    try:
        message = Mail(
            from_email=from_email,
            to_emails=to_email,
            subject=subject,
            plain_text_content=text_body,
            html_content=html_body,
        )
        client = SendGridAPIClient(sendgrid_key)
        response = client.send(message)
        logger.error("SENDGRID: status code: %s", response.status_code)
        logger.error("SENDGRID: response body: %s", response.body)

        status_code = int(getattr(response, "status_code", 0) or 0)
        if status_code not in (200, 202):
            body = getattr(response, "body", b"") or b""
            detail = body.decode("utf-8", errors="replace")[:200]
            raise SmtpSendError(
                f"SendGrid API returned status {status_code}. {detail}".strip(),
                recipient=to_email,
            )
        logger.error("SENDGRID: send accepted to=%s status=%s", to_email, status_code)
    except SmtpSendError:
        raise
    except Exception as exc:
        logger.error("SENDGRID: exception: %s", str(exc))
        raise SmtpSendError(
            f"SendGrid send failed for {to_email}: {exc.__class__.__name__}.",
            recipient=to_email,
        ) from exc


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
        raise SmtpSendError(
            "SMTP authentication failed. Verify SMTP_USERNAME and SMTP_PASSWORD "
            "(use a Gmail App Password if 2FA is on)."
        ) from exc


def _attempt_smtp_send(settings: Settings, msg: EmailMessage) -> None:
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
        except Exception:  # noqa: BLE001
            try:
                server.close()
            except Exception:  # noqa: BLE001
                pass


def _send_via_smtp(
    settings: Settings,
    *,
    to_addr: str,
    subject: str,
    text_body: str,
    html_body: str | None,
) -> None:
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
            _attempt_smtp_send(settings, msg)
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
            logger.warning(
                "SMTP data error host=%s to=%s code=%s", host, to_addr, exc.smtp_code
            )
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

    raise SmtpSendError(
        f"SMTP send failed for {to_addr}.",
        recipient=to_addr,
    ) from last_error


def send_email(
    settings: Settings,
    *,
    to_addr: str,
    subject: str,
    text_body: str,
    html_body: str | None = None,
) -> None:
    """Send one email via SendGrid when configured, else SMTP (with SendGrid fallback)."""
    logger.error(
        "SENDGRID: send_email called to=%s sendgrid_configured=%s smtp_configured=%s",
        to_addr,
        is_sendgrid_configured(settings),
        is_smtp_configured(settings),
    )

    if not is_email_configured(settings):
        raise SmtpSendError("Email is not configured on the server.", recipient=to_addr)

    from_addr = settings.smtp_from.strip()
    sendgrid_errors: list[SmtpSendError] = []

    if is_sendgrid_configured(settings):
        try:
            _send_via_sendgrid(
                settings,
                from_addr=from_addr,
                to_addr=to_addr,
                subject=subject,
                text_body=text_body,
                html_body=html_body,
            )
            return
        except SmtpSendError as exc:
            sendgrid_errors.append(exc)
            logger.error(
                "SENDGRID: send_email caught failure for %s, smtp_fallback=%s: %s",
                to_addr,
                is_smtp_configured(settings),
                exc,
            )

    if is_smtp_configured(settings):
        try:
            _send_via_smtp(
                settings,
                to_addr=to_addr,
                subject=subject,
                text_body=text_body,
                html_body=html_body,
            )
            return
        except SmtpSendError:
            raise

    if sendgrid_errors:
        raise sendgrid_errors[0]

    raise SmtpSendError("Email is not configured on the server.", recipient=to_addr)


__all__ = [
    "SmtpSendError",
    "SmtpStatus",
    "describe_smtp",
    "is_email_configured",
    "is_sendgrid_configured",
    "is_smtp_configured",
    "log_smtp_startup_status",
    "send_email",
]
