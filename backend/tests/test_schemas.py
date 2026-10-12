"""Schema validation rules (pydantic models)."""

from __future__ import annotations

import unicodedata

import pytest
from pydantic import ValidationError

from app.schemas import DeckSummary, VocabularyEntry


def test_entry_accepts_minimal_payload():
    entry = VocabularyEntry(id="hello", source="hello", target="hola")
    assert entry.alternatives == []
    assert entry.tags == []


def test_entry_normalizes_nfc():
    decomposed = "cafe\u0301"  # e + combining acute
    assert decomposed != unicodedata.normalize("NFC", decomposed)
    entry = VocabularyEntry(id="cafe", source=decomposed, target="café")
    assert entry.source == unicodedata.normalize("NFC", decomposed)
    assert entry.source != decomposed


def test_entry_trims_and_dedupes_lists():
    entry = VocabularyEntry(
        id="thanks",
        source="  thank you  ",
        target="gracias",
        alternatives=["gracias", " gracias ", "merci"],
        tags=["phrase", "phrase"],
    )
    assert entry.source == "thank you"
    assert entry.alternatives == ["gracias", "merci"]
    assert entry.tags == ["phrase"]


@pytest.mark.parametrize("payload", [
    {"id": "x", "source": "", "target": "hola"},
    {"id": "x", "source": "   ", "target": "hola"},
    {"id": "x", "source": "hello", "target": ""},
    {"id": "x", "source": "hello", "target": "\t\n "},
])
def test_entry_rejects_empty_fields(payload):
    with pytest.raises(ValidationError):
        VocabularyEntry(**payload)


@pytest.mark.parametrize("entry_id", ["", "Bad Id", "UPPER", "-leading", "a" * 65])
def test_entry_rejects_bad_ids(entry_id):
    with pytest.raises(ValidationError):
        VocabularyEntry(id=entry_id, source="a", target="b")


def test_entry_accepts_underscored_ids():
    assert VocabularyEntry(id="fr_en-1", source="a", target="b").id == "fr_en-1"


def test_entry_rejects_unknown_fields():
    with pytest.raises(ValidationError):
        VocabularyEntry(id="x", source="a", target="b", bogus=1)


def test_deck_summary_valid_languages():
    for code in ["fr", "en", "de", "ja", "zh-Hans", "english", "hindi", "spanish"]:
        summary = DeckSummary(
            id="d", name="D", source_language=code, target_language="en"
        )
        assert summary.source_language == code


@pytest.mark.parametrize("code", ["", "   "])
def test_deck_summary_rejects_invalid_languages(code):
    with pytest.raises(ValidationError):
        DeckSummary(id="d", name="D", source_language=code, target_language="en")


def test_deck_summary_same_source_and_target_allowed():
    # Not forbidden by the contract: e.g. cognate drills are legitimate.
    summary = DeckSummary(
        id="d", name="D", source_language="fr", target_language="fr-CA"
    )
    assert summary.target_language == "fr-CA"


def test_deck_summary_rejects_negative_entry_count():
    with pytest.raises(ValidationError):
        DeckSummary(id="d", name="D", source_language="fr", target_language="en", entry_count=-1)
