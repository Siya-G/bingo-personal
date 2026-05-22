"""Unit tests for the reusable SMTP mailer service."""

from __future__ import annotations

import smtplib
from typing import Any

import pytest

from app.config import Settings
from app.services.smtp_mailer import (
    SmtpSendError,
    describe_smtp,
    is_email_configured,
    is_sendgrid_configured,
    is_smtp_configured,
    send_email,
)


def _live_settings(**overrides: Any) -> Settings:
    base = {
        "smtp_host": "smtp.example.com",
        "smtp_port": 587,
        "smtp_username": "user@example.com",
        "smtp_password": "secret-not-logged",
        "smtp_from": "noreply@example.com",
        "smtp_use_tls": True,
        "smtp_use_ssl": False,
    }
    base.update(overrides)
    return Settings(**base)


def test_is_smtp_configured_requires_host_and_from() -> None:
    assert is_smtp_configured(Settings()) is False
    assert is_smtp_configured(_live_settings(smtp_host="")) is False
    assert is_smtp_configured(_live_settings(smtp_from="")) is False
    assert is_smtp_configured(_live_settings()) is True


def test_describe_smtp_never_returns_password() -> None:
    s = _live_settings()
    desc = describe_smtp(s)
    assert desc.configured is True
    assert desc.email_configured is True
    assert desc.sendgrid_configured is False
    assert desc.host == "smtp.example.com"
    assert desc.from_address == "noreply@example.com"
    assert desc.has_credentials is True
    # Make sure no password leaks through dataclass fields or repr.
    assert "secret-not-logged" not in repr(desc)


def test_smtp_user_alias_accepts_legacy_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """``SMTP_USER`` (legacy name) still binds to ``smtp_username``."""
    # conftest pre-sets ``SMTP_USERNAME=""`` to isolate tests from the dev .env;
    # remove it here so the alias falls through to the legacy ``SMTP_USER`` value.
    monkeypatch.delenv("SMTP_USERNAME", raising=False)
    monkeypatch.setenv("SMTP_HOST", "smtp.legacy.example.com")
    monkeypatch.setenv("SMTP_USER", "legacy-user@example.com")
    monkeypatch.setenv("SMTP_FROM", "noreply@example.com")
    monkeypatch.setenv("SMTP_PASSWORD", "x")
    s = Settings()
    assert s.smtp_username == "legacy-user@example.com"


def test_send_email_raises_when_not_configured() -> None:
    s = Settings()
    with pytest.raises(SmtpSendError, match="not configured"):
        send_email(
            s,
            to_addr="a@example.com",
            subject="x",
            text_body="hi",
        )


class _FakeSmtp:
    """Minimal stand-in for ``smtplib.SMTP`` / ``SMTP_SSL`` used in unit tests."""

    captured_messages: list[Any] = []
    last_login: tuple[str, str] | None = None
    starttls_called: bool = False
    quit_called: bool = False

    def __init__(self, *_args: Any, **_kwargs: Any) -> None:
        type(self).captured_messages = []
        type(self).last_login = None
        type(self).starttls_called = False
        type(self).quit_called = False

    def ehlo(self) -> None:  # noqa: D401
        return None

    def starttls(self, **_kwargs: Any) -> None:
        type(self).starttls_called = True

    def login(self, username: str, password: str) -> None:
        type(self).last_login = (username, password)

    def send_message(self, msg: Any) -> None:
        type(self).captured_messages.append(msg)

    def quit(self) -> None:
        type(self).quit_called = True

    def close(self) -> None:  # pragma: no cover — defensive
        return None


def test_send_email_uses_starttls_login_and_sends(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(smtplib, "SMTP", _FakeSmtp)
    s = _live_settings()
    send_email(
        s,
        to_addr="dest@example.com",
        subject="Hello",
        text_body="plain body",
        html_body="<p>html body</p>",
    )
    assert _FakeSmtp.starttls_called is True
    assert _FakeSmtp.last_login == ("user@example.com", "secret-not-logged")
    assert _FakeSmtp.quit_called is True
    assert len(_FakeSmtp.captured_messages) == 1
    msg = _FakeSmtp.captured_messages[0]
    assert msg["Subject"] == "Hello"
    assert msg["To"] == "dest@example.com"
    # Multipart alternative when html_body is supplied.
    assert msg.is_multipart()


def test_send_email_uses_sendgrid_when_api_key_set(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _FakeSmtp()  # reset class-level SMTP capture from earlier tests
    sendgrid_calls: list[dict[str, str]] = []

    def fake_sendgrid(
        _settings: Settings,
        *,
        from_addr: str,
        to_addr: str,
        subject: str,
        text_body: str,
        html_body: str | None,
    ) -> None:
        sendgrid_calls.append(
            {
                "from_addr": from_addr,
                "to_addr": to_addr,
                "subject": subject,
                "text_body": text_body,
                "html_body": html_body or "",
            }
        )

    monkeypatch.setattr(
        "app.services.smtp_mailer._send_via_sendgrid",
        fake_sendgrid,
    )
    monkeypatch.setattr(smtplib, "SMTP", _FakeSmtp)

    settings = _live_settings(sendgrid_api_key="SG.test-key")
    send_email(
        settings,
        to_addr="winner@example.com",
        subject="Hello",
        text_body="Plain",
        html_body="<p>Hi</p>",
    )

    assert len(sendgrid_calls) == 1
    assert sendgrid_calls[0]["to_addr"] == "winner@example.com"
    assert _FakeSmtp.captured_messages == []


def test_send_email_falls_back_to_smtp_when_sendgrid_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def failing_sendgrid(*_args: object, **_kwargs: object) -> None:
        raise SmtpSendError("SendGrid API returned status 403.")

    monkeypatch.setattr(
        "app.services.smtp_mailer._send_via_sendgrid",
        failing_sendgrid,
    )
    monkeypatch.setattr(smtplib, "SMTP", _FakeSmtp)

    settings = _live_settings(sendgrid_api_key="SG.test-key")
    send_email(settings, to_addr="a@example.com", subject="Hi", text_body="Body")

    assert len(_FakeSmtp.captured_messages) == 1


def test_is_email_configured_with_sendgrid_only() -> None:
    settings = Settings(
        sendgrid_api_key="SG.test",
        smtp_from="noreply@example.com",
    )
    assert is_sendgrid_configured(settings) is True
    assert is_smtp_configured(settings) is False
    assert is_email_configured(settings) is True


def test_send_email_translates_auth_error(monkeypatch: pytest.MonkeyPatch) -> None:
    class _AuthFailingSmtp(_FakeSmtp):
        def login(self, username: str, password: str) -> None:
            raise smtplib.SMTPAuthenticationError(535, b"auth failed")

    monkeypatch.setattr(smtplib, "SMTP", _AuthFailingSmtp)
    s = _live_settings()
    with pytest.raises(SmtpSendError, match="authentication failed"):
        send_email(
            s,
            to_addr="dest@example.com",
            subject="x",
            text_body="hi",
        )
