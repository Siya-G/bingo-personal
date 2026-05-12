"""TODO(Phase future): issue or reserve gift cards for winners.

This module is a stub for MVP. No payment or gift-card APIs are connected.
Planned integration points:
- Host-triggered fulfillment after verifying a winner.
- Store provider references in ``PrizeNotification`` metadata or a sibling table.

Example placeholder:
    def request_gift_card_for_winner(winner_id: int, amount_cents: int) -> str:
        raise NotImplementedError
"""


def request_gift_card_placeholder(winner_id: int, amount_cents: int) -> str:
    """Reserved for future gift-card workflows — not implemented."""
    _ = (winner_id, amount_cents)
    return ""
