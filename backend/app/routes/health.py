from typing import Any

from fastapi import APIRouter, HTTPException, status

from app.config import BACKEND_ENV_FILE, settings
from app.services.smtp_mailer import describe_smtp

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check() -> dict[str, str]:
    """Confirm that the API process is running."""
    return {"status": "ok"}


@router.get("/health/smtp")
async def smtp_health() -> dict[str, Any]:
    """Public SMTP status (no secrets) — frontend uses this to show the LIVE badge."""
    status_snapshot = describe_smtp(settings)
    if status_snapshot.sendgrid_configured:
        mode = "sendgrid"
    elif status_snapshot.configured:
        mode = "smtp"
    else:
        mode = "preview"
    return {
        "configured": status_snapshot.email_configured,
        "sendgrid_configured": status_snapshot.sendgrid_configured,
        "host": status_snapshot.host,
        "port": status_snapshot.port,
        "use_tls": status_snapshot.use_tls,
        "use_ssl": status_snapshot.use_ssl,
        "has_credentials": status_snapshot.has_credentials,
        "mode": mode,
    }


@router.get("/debug/config")
async def debug_config() -> dict[str, Any]:
    """Local dev only: feature flags + SMTP summary (never exposes secrets).

    Per-field ``*_present`` booleans help debug ".env not loaded" issues without
    leaking secret values — only host/port/from are echoed in full (no password).
    """
    if settings.environment != "development":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found.")
    status_snapshot = describe_smtp(settings)
    return {
        "env_file": str(BACKEND_ENV_FILE),
        "env_file_exists": BACKEND_ENV_FILE.is_file(),
        "use_mock_llm": settings.use_mock_llm,
        "openai_model": settings.openai_model,
        "openai_api_key_present": bool(settings.openai_api_key.strip()),
        "bingo_item_pool_size": settings.bingo_item_pool_size,
        "bingo_card_cell_count": settings.bingo_card_cell_count,
        "smtp_configured": status_snapshot.configured,
        "smtp_host": status_snapshot.host,
        "smtp_port": status_snapshot.port,
        "smtp_use_tls": status_snapshot.use_tls,
        "smtp_use_ssl": status_snapshot.use_ssl,
        "smtp_from": status_snapshot.from_address,
        "smtp_host_present": bool(settings.smtp_host.strip()),
        "smtp_from_present": bool(settings.smtp_from.strip()),
        "smtp_username_present": bool(settings.smtp_username.strip()),
        # ``smtp_password`` may legitimately contain whitespace (Gmail App Passwords),
        # so check non-empty after stripping outer whitespace only.
        "smtp_password_present": bool(settings.smtp_password.strip()),
        "smtp_has_credentials": status_snapshot.has_credentials,
    }
