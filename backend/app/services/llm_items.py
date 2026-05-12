"""OpenAI-backed Bingo item generation with optional mock fallback."""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Any

from openai import OpenAI

from app.config import BACKEND_ENV_FILE, Settings
from app.services.item_generation_errors import ItemGenerationError
from app.services.item_generator import GeneratedItem, generate_mock_items

logger = logging.getLogger(__name__)

_MAX_DESC_LEN = 400
_MAX_WORD_LEN = 80
_MAX_COERCE = 220

_USER_PROMPT = """Generate up to {count} unique Virtual Bingo items for the topic: "{topic}".

Aim for as close to {count} items as you can while staying accurate. If the topic is narrow,
include closely related concepts (subtopics, examples, tools, missions, people, places, or events)
so the list has enough educational variety — do not invent false facts.

Return only valid JSON in this exact format:
{{
  "items": [
    {{
      "word": "Everest",
      "description": "The tallest mountain in the world, located in the Himalayas."
    }}
  ]
}}

Rules:
- Each word must be 1 to 3 words (short label).
- Each description must be one short sentence.
- Keep everything appropriate for a workplace team game.
- Do not include markdown.
- Do not include numbering.
- Avoid duplicates within the array.
- Avoid overly obscure items unless the topic requires it.
- Make the descriptions simple, accurate, and interesting.
"""


_TOP_UP_PROMPT = """Topic: "{topic}"

These Bingo word labels are already used — do NOT repeat any (case-insensitive):
{words}

Add exactly {need} more unique items in the same JSON format:
{{"items": [{{"word": "...", "description": "..."}}, ...]}}

Same rules: 1–3 words per label, one short accurate sentence each, workplace-appropriate, JSON only, no markdown.
"""


@dataclass(frozen=True)
class ItemGenerationOutcome:
    """Result of building the shared Bingo item pool."""

    items: list[GeneratedItem]
    warning: str | None = None


def _word_token_count(word: str) -> int:
    return len(word.split())


def _looks_clean_text(s: str) -> bool:
    if re.search(r"[*_`#]|```|\[\[", s):
        return False
    return True


def coerce_raw_item_rows(raw_items: Any, *, cap: int) -> list[GeneratedItem]:
    """Parse ``items`` array: validate, dedupe by word (case-insensitive), up to ``cap`` rows."""
    if not isinstance(raw_items, list):
        raise ItemGenerationError('Expected JSON property "items" to be an array.')

    seen: set[str] = set()
    out: list[GeneratedItem] = []

    for row in raw_items:
        if len(out) >= cap:
            break
        if not isinstance(row, dict):
            continue
        w = row.get("word")
        d = row.get("description")
        if not isinstance(w, str) or not isinstance(d, str):
            continue
        word = " ".join(w.split()).strip()
        description = " ".join(d.split()).strip()
        if not word or not description:
            continue
        if len(word) > _MAX_WORD_LEN or len(description) > _MAX_DESC_LEN:
            continue
        if not _looks_clean_text(word) or not _looks_clean_text(description):
            continue
        tc = _word_token_count(word)
        if tc < 1 or tc > 3:
            continue
        key = word.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(GeneratedItem(word=word, description=description))

    return out


def normalize_llm_items(raw_items: Any, count: int) -> list[GeneratedItem]:
    """Strict helper for tests: require at least ``count`` valid unique rows."""
    got = coerce_raw_item_rows(raw_items, cap=max(count, _MAX_COERCE))
    if len(got) < count:
        raise ItemGenerationError(
            f"The model returned only {len(got)} valid unique items after validation, "
            f"but this pass required {count}. Try again or shorten the topic."
        )
    return got[:count]


def merge_unique_items(
    primary: list[GeneratedItem],
    extra: list[GeneratedItem],
) -> list[GeneratedItem]:
    seen = {x.word.lower() for x in primary}
    out = list(primary)
    for x in extra:
        k = x.word.lower()
        if k not in seen:
            seen.add(k)
            out.append(x)
    return out


def _parse_openai_json(content: str, cap: int) -> list[GeneratedItem]:
    try:
        data = json.loads(content)
    except json.JSONDecodeError as exc:
        raise ItemGenerationError("OpenAI returned invalid JSON.") from exc
    items = data.get("items") if isinstance(data, dict) else None
    return coerce_raw_item_rows(items, cap=cap)


def _chat_json(client: OpenAI, model: str, user_content: str) -> str:
    try:
        completion = client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You output only compact JSON objects. "
                        "Never wrap JSON in markdown fences."
                    ),
                },
                {"role": "user", "content": user_content},
            ],
            response_format={"type": "json_object"},
            temperature=0.65,
        )
    except Exception as exc:
        logger.exception("OpenAI API request failed")
        raise ItemGenerationError(
            "OpenAI request failed (network, auth, or quota). Check the API key and model name."
        ) from exc

    raw = completion.choices[0].message.content
    if not raw or not raw.strip():
        raise ItemGenerationError("OpenAI returned an empty message body.")
    return raw.strip()


def _word_block(words: list[str], *, max_chars: int = 3500) -> str:
    joined = ", ".join(words)
    if len(joined) <= max_chars:
        return joined
    return joined[: max_chars - 20] + "\n…(list truncated)"


def generate_bingo_items_outcome(
    topic: str,
    *,
    settings: Settings,
) -> ItemGenerationOutcome:
    """Call OpenAI (optional top-up), enforce min/target rules, return items + optional warning."""
    target = settings.bingo_item_pool_size
    min_need = settings.bingo_min_item_pool_size
    card_need = settings.bingo_card_cell_count

    topic_clean = (topic or "").strip() or "General Knowledge"
    safe_topic = topic_clean.replace('"', "'")

    key = (settings.openai_api_key or "").strip()
    if not key:
        env_exists = BACKEND_ENV_FILE.is_file()
        raise ItemGenerationError(
            "OPENAI_API_KEY is not set or is empty. "
            f"Expected OPENAI_API_KEY in {BACKEND_ENV_FILE} (file exists: {env_exists}). "
            "Add the key to backend/.env and restart the API."
        )

    model = (settings.openai_model or "gpt-4.1-mini").strip()
    client = OpenAI(api_key=key)

    first_prompt = _USER_PROMPT.format(count=target, topic=safe_topic)
    merged = _parse_openai_json(_chat_json(client, model, first_prompt), cap=_MAX_COERCE)

    if len(merged) < target:
        need = target - len(merged)
        if need > 0 and len(merged) > 0:
            words = [x.word for x in merged]
            top_prompt = _TOP_UP_PROMPT.format(
                topic=safe_topic,
                words=_word_block(words),
                need=need,
            )
            try:
                extra_raw = _chat_json(client, model, top_prompt)
                extra = _parse_openai_json(extra_raw, cap=need + 30)
                merged = merge_unique_items(merged, extra)
            except ItemGenerationError as exc:
                logger.warning("Top-up item generation skipped or failed: %s", exc)

    if len(merged) < card_need:
        raise ItemGenerationError(
            f"Only {len(merged)} valid unique items were produced; each Bingo card needs "
            f"{card_need} distinct cells. Try a broader topic or increase the model output."
        )

    if len(merged) < min_need:
        raise ItemGenerationError(
            f"Only {len(merged)} valid unique items were produced; the minimum shared pool "
            f"for this game is {min_need}. Try a broader topic, adjust BINGO_MIN_ITEM_POOL_SIZE, "
            "or try again."
        )

    warning: str | None = None
    if len(merged) < target:
        warning = (
            f"Generated {len(merged)} items instead of target {target}. "
            "The game can still continue."
        )

    return ItemGenerationOutcome(items=merged, warning=warning)


def resolve_generated_items_for_game(
    topic: str,
    count: int,
    settings: Settings,
) -> ItemGenerationOutcome:
    """Pick mock-only, OpenAI, or OpenAI-with-mock-fallback based on env flags.

    ``count`` is accepted for API compatibility; pool sizing comes from ``settings``.
    """
    display_topic = (topic or "").strip() or "General Knowledge"
    mock_mode = settings.use_mock_llm
    key = (settings.openai_api_key or "").strip()
    pool_target = settings.bingo_item_pool_size

    if mock_mode and not key:
        items = generate_mock_items(display_topic, pool_target)
        return ItemGenerationOutcome(items=items, warning=None)

    if not key:
        env_exists = BACKEND_ENV_FILE.is_file()
        raise ItemGenerationError(
            "OPENAI_API_KEY is not set or is empty. "
            f"Expected environment variable OPENAI_API_KEY in the backend env file at "
            f"{BACKEND_ENV_FILE} (file exists: {env_exists}). "
            f"USE_MOCK_LLM is {mock_mode}. "
            "Set the key in backend/.env and restart uvicorn, or set USE_MOCK_LLM=true "
            "to use the offline mock generator without OpenAI."
        )

    try:
        return generate_bingo_items_outcome(display_topic, settings=settings)
    except ItemGenerationError as exc:
        if mock_mode:
            logger.warning("OpenAI item generation failed; using mock fallback: %s", exc)
            items = generate_mock_items(display_topic, pool_target)
            return ItemGenerationOutcome(items=items, warning=None)
        raise
    except Exception as exc:
        if mock_mode:
            logger.warning(
                "OpenAI item generation failed; using mock fallback",
                exc_info=exc,
            )
            items = generate_mock_items(display_topic, pool_target)
            return ItemGenerationOutcome(items=items, warning=None)
        logger.exception("OpenAI item generation failed")
        raise ItemGenerationError(
            "OpenAI item generation failed. Check OPENAI_API_KEY, model name, and network access."
        ) from exc
