"""Canonical winning-pattern names and normalization for API + Bingo validation."""

from __future__ import annotations

from typing import Iterable

ALLOWED_CANONICAL = frozenset(
    {
        "HORIZONTAL_ROW",
        "VERTICAL_COLUMN",
        "DIAGONAL",
        "FOUR_CORNERS",
        "FULL_HOUSE",
    }
)


def canonicalize_winning_pattern(pattern: str) -> str:
    """Map aliases (ROW, COLUMN) and normalize to stored API keys."""
    key = pattern.strip().upper().replace(" ", "_")
    aliases = {
        "ROW": "HORIZONTAL_ROW",
        "COLUMN": "VERTICAL_COLUMN",
    }
    canon = aliases.get(key, key)
    if canon not in ALLOWED_CANONICAL:
        allowed = ", ".join(sorted(ALLOWED_CANONICAL))
        raise ValueError(
            f"Invalid winning pattern {pattern!r}. "
            f"Allowed values: {allowed}, plus aliases ROW and COLUMN."
        )
    return canon


def normalize_winning_pattern_list(patterns: Iterable[str]) -> list[str]:
    """Deduplicate while preserving order."""
    seen: set[str] = set()
    out: list[str] = []
    for raw in patterns:
        canon = canonicalize_winning_pattern(str(raw))
        if canon not in seen:
            seen.add(canon)
            out.append(canon)
    return out


def winning_pattern_display_name(canon: str) -> str:
    labels = {
        "HORIZONTAL_ROW": "horizontal row",
        "VERTICAL_COLUMN": "vertical column",
        "DIAGONAL": "diagonal",
        "FOUR_CORNERS": "four corners",
        "FULL_HOUSE": "full house",
    }
    return labels.get(canon, canon.replace("_", " ").lower())
