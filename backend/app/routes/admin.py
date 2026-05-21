"""Admin-only endpoints (cache management, etc.).

Access is gated by an ``X-Admin-Secret`` request header that must match the
``ADMIN_SECRET`` environment variable.  When ``ADMIN_SECRET`` is empty the
endpoint always returns 403 so these routes are inert in default dev setups.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.database.connection import get_db
from app.services.topic_cache import clear_all_topic_cache

router = APIRouter(prefix="/admin", tags=["admin"])


def _verify_admin_secret(x_admin_secret: str | None = Header(default=None)) -> None:
    """Dependency: raise 403 unless the header matches the configured secret."""
    configured = settings.admin_secret.strip()
    if not configured:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin endpoints are disabled (ADMIN_SECRET is not configured).",
        )
    if not x_admin_secret or x_admin_secret.strip() != configured:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or missing admin secret.",
        )


class ClearCacheResponse(BaseModel):
    deleted: int
    message: str


@router.delete(
    "/cache/topics",
    response_model=ClearCacheResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(_verify_admin_secret)],
)
def clear_topic_cache(db: Session = Depends(get_db)) -> ClearCacheResponse:
    """Delete all topic-level item cache entries.

    Forces fresh AI generation for all topics on the next generate-items call.
    Protected by ``X-Admin-Secret`` header — value must match ``ADMIN_SECRET``.
    """
    deleted = clear_all_topic_cache(db)
    return ClearCacheResponse(
        deleted=deleted,
        message=f"Cleared {deleted} cached topic entr{'y' if deleted == 1 else 'ies'}.",
    )
