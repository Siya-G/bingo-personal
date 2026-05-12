"""Unit tests for OpenAI item generation, validation, and env resolution."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from app.config import Settings
from app.services.item_generation_errors import ItemGenerationError
from app.services.llm_items import (
    _parse_openai_json,
    generate_bingo_items_outcome,
    merge_unique_items,
    normalize_llm_items,
    resolve_generated_items_for_game,
)
from app.services.item_generator import GeneratedItem


def test_normalize_dedupes_by_word_case_insensitive() -> None:
    raw = [
        {"word": "Foo Bar", "description": "First fact about foo bar here."},
        {"word": "foo bar", "description": "Duplicate word casing should be skipped."},
        {"word": "Baz", "description": "Another valid sentence for the list."},
    ]
    out = normalize_llm_items(raw, 2)
    assert len(out) == 2
    assert out[0].word == "Foo Bar"
    assert out[1].word == "Baz"


def test_normalize_rejects_when_too_few_valid() -> None:
    with pytest.raises(ItemGenerationError, match="only 1 valid"):
        normalize_llm_items(
            [{"word": "Only", "description": "One valid row in this payload."}],
            5,
        )


def test_parse_openai_json_extracts_items() -> None:
    payload = {
        "items": [
            {"word": "Python", "description": "A popular programming language."},
            {"word": "Ruby", "description": "Known for elegant syntax."},
        ],
    }
    out = _parse_openai_json(json.dumps(payload), cap=10)
    assert [x.word for x in out] == ["Python", "Ruby"]


def test_missing_key_strict_mode_raises() -> None:
    s = Settings(openai_api_key="", use_mock_llm=False)
    with pytest.raises(ItemGenerationError, match="OPENAI_API_KEY"):
        resolve_generated_items_for_game("Any topic", 5, s)


def test_mock_mode_without_key_uses_catalog_or_placeholder() -> None:
    s = Settings(openai_api_key="", use_mock_llm=True)
    outcome = resolve_generated_items_for_game("Canadian cities", 5, s)
    assert len(outcome.items) == s.bingo_item_pool_size
    assert all("Canadian cities" in x.description for x in outcome.items)


@patch("app.services.llm_items.OpenAI")
def test_resolve_openai_failure_falls_back_when_mock_on(
    mock_openai_cls: MagicMock,
) -> None:
    mock_client = MagicMock()
    mock_openai_cls.return_value = mock_client
    mock_client.chat.completions.create.side_effect = RuntimeError("network down")
    s = Settings(openai_api_key="sk-test", use_mock_llm=True)
    outcome = resolve_generated_items_for_game("Space exploration", 3, s)
    assert len(outcome.items) == s.bingo_item_pool_size


@patch("app.services.llm_items.OpenAI")
def test_resolve_openai_failure_strict_when_mock_off(
    mock_openai_cls: MagicMock,
) -> None:
    mock_client = MagicMock()
    mock_openai_cls.return_value = mock_client
    mock_client.chat.completions.create.side_effect = RuntimeError("network down")
    s = Settings(openai_api_key="sk-test", use_mock_llm=False)
    with pytest.raises(ItemGenerationError, match="OpenAI request failed"):
        resolve_generated_items_for_game("t", 2, s)


def _valid_row(i: int) -> dict[str, str]:
    return {
        "word": f"Word{i}",
        "description": f"Accurate short description for concept number {i} here.",
    }


def _rows(n: int) -> str:
    return json.dumps({"items": [_valid_row(i) for i in range(n)]})


@patch("app.services.llm_items._chat_json")
def test_outcome_full_target_no_warning(mock_chat: MagicMock) -> None:
    mock_chat.return_value = _rows(75)
    s = Settings(openai_api_key="sk-test", use_mock_llm=False)
    out = generate_bingo_items_outcome("Broad topic", settings=s)
    assert len(out.items) == 75
    assert out.warning is None
    assert mock_chat.call_count == 1


@patch("app.services.llm_items._chat_json")
def test_outcome_74_accepted_with_warning(mock_chat: MagicMock) -> None:
    mock_chat.side_effect = [_rows(74), _rows(0)]
    s = Settings(openai_api_key="sk-test", use_mock_llm=False)
    out = generate_bingo_items_outcome("Topic", settings=s)
    assert len(out.items) == 74
    assert out.warning is not None
    assert "74" in out.warning and "75" in out.warning
    assert mock_chat.call_count == 2


@patch("app.services.llm_items._chat_json")
def test_outcome_top_up_fills_to_target(mock_chat: MagicMock) -> None:
    first = json.dumps({"items": [_valid_row(i) for i in range(74)]})
    extra = json.dumps(
        {
            "items": [
                {
                    "word": "Final Word",
                    "description": "The seventy-fifth distinct educational label.",
                }
            ]
        }
    )
    mock_chat.side_effect = [first, extra]
    s = Settings(openai_api_key="sk-test", use_mock_llm=False)
    out = generate_bingo_items_outcome("Topic", settings=s)
    assert len(out.items) == 75
    assert out.warning is None
    assert mock_chat.call_count == 2


@patch("app.services.llm_items._chat_json")
def test_outcome_top_up_dedupes_duplicates(mock_chat: MagicMock) -> None:
    dup = _valid_row(0)
    first = json.dumps({"items": [_valid_row(i) for i in range(73)] + [dup]})
    extra = json.dumps({"items": [_valid_row(73), _valid_row(74)]})
    mock_chat.side_effect = [first, extra]
    s = Settings(openai_api_key="sk-test", use_mock_llm=False)
    out = generate_bingo_items_outcome("Topic", settings=s)
    assert len(out.items) == 75
    words_lower = {x.word.lower() for x in out.items}
    assert len(words_lower) == 75


@patch("app.services.llm_items._chat_json")
def test_outcome_below_minimum_rejected(mock_chat: MagicMock) -> None:
    mock_chat.side_effect = [_rows(30), _rows(0)]
    s = Settings(openai_api_key="sk-test", use_mock_llm=False)
    with pytest.raises(ItemGenerationError, match="minimum shared pool"):
        generate_bingo_items_outcome("Narrow", settings=s)


@patch("app.services.llm_items._chat_json")
def test_outcome_below_card_size_rejected(mock_chat: MagicMock) -> None:
    mock_chat.return_value = _rows(20)
    s = Settings(openai_api_key="sk-test", use_mock_llm=False)
    with pytest.raises(ItemGenerationError, match="each Bingo card needs"):
        generate_bingo_items_outcome("Tiny", settings=s)


def test_merge_unique_items_skips_seen_words() -> None:
    a = [GeneratedItem(word="A", description="One.")]
    b = [
        GeneratedItem(word="a", description="Dup."),
        GeneratedItem(word="B", description="Two."),
    ]
    merged = merge_unique_items(a, b)
    assert [x.word for x in merged] == ["A", "B"]
