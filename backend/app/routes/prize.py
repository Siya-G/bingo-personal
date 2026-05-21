"""Prize email endpoint — send a winner notification by SMTP.

The player's email address is used only to address the outgoing message.
It is never stored in the database, never logged by this module, and never
returned in any response body.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.config import settings
from app.database.connection import get_db
from app.schemas.game import PrizeSendRequest, PrizeSendResponse
from app.services.game_lookup import get_game_or_404
from app.services.smtp_mailer import SmtpSendError, send_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/games", tags=["prize"])

_PLACEMENT_LABELS: dict[int, str] = {1: "1st", 2: "2nd", 3: "3rd"}


def _placement_label(placement: int) -> str:
    return _PLACEMENT_LABELS.get(placement, f"#{placement}")


@router.post(
    "/{game_id}/prize/send",
    response_model=PrizeSendResponse,
)
def send_prize_email(
    game_id: int,
    payload: PrizeSendRequest,
    db: Session = Depends(get_db),
) -> PrizeSendResponse:
    """Send a congratulatory prize email to the Bingo winner.

    The recipient email is validated by the Pydantic schema (400 on bad format)
    and passed directly to the SMTP mailer. It is not stored anywhere.
    """
    game = get_game_or_404(game_id, db)

    label = _placement_label(payload.placement)
    subject = "🎉 You won Bingo!"
    text_body = (
        f"Hi {payload.player_name},\n\n"
        f"Congratulations! You came in {label} place in {game.title} — amazing job!\n\n"
        f"Your prize gift card will be arriving in your email soon. "
        f"Keep an eye on your inbox!\n\n"
        f"Thanks for playing,\n"
        f"The AI Bingo Team"
    )

    try:
        send_email(
            settings,
            to_addr=payload.player_email,
            subject=subject,
            text_body=text_body,
        )
        return PrizeSendResponse(success=True)
    except SmtpSendError as exc:
        # Log the error class only — never log the recipient address here.
        logger.warning("Prize email failed for game %d: %s", game_id, exc)
        return PrizeSendResponse(success=False, error="Email could not be sent")
