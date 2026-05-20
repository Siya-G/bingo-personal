"""Application service layer.

This package intentionally does NOT eagerly re-export names from concrete
service modules. Doing so created a startup-time circular import:

    app.schemas.game
        → from app.services.winning_pattern_rules import normalize_winning_pattern_list
        → (loads app.services package init)
        → from app.services.card_generator import ...
        → from app.schemas import BingoCardResponse   ← app.schemas is mid-init
        → ImportError

Callers should import directly from the concrete submodule they need, e.g.
``from app.services.gameplay import call_next_item`` or
``from app.services.card_generator import generate_cards_for_game``. That way
``app.schemas.game`` can pull a single pure-Python helper from
``app.services.winning_pattern_rules`` without dragging the whole service
graph (which depends back on ``app.schemas``) into the partially-initialized
schemas package.
"""
