"""Deck and vocabulary endpoints against the real built-in decks."""

from __future__ import annotations

import pytest

REQUIRED_SUMMARY_FIELDS = {
    "id",
    "name",
    "description",
    "source_language",
    "target_language",
    "entry_count",
}


def test_deck_list(real_client):
    response = real_client.get("/api/decks")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == len(body["decks"]) == 2
    for deck in body["decks"]:
        assert REQUIRED_SUMMARY_FIELDS <= set(deck)
    by_id = {deck["id"]: deck for deck in body["decks"]}
    assert by_id["fr-en-common"]["entry_count"] == 101
    assert by_id["fr-en-common"]["source_language"] == "fr"
    assert by_id["fr-en-common"]["target_language"] == "en"
    assert by_id["de-ja-starter"]["source_language"] == "de"
    assert by_id["de-ja-starter"]["target_language"] == "ja"


def test_deck_detail(real_client):
    response = real_client.get("/api/decks/fr-en-common")
    assert response.status_code == 200
    body = response.json()
    assert REQUIRED_SUMMARY_FIELDS <= set(body)
    assert body["id"] == "fr-en-common"
    assert body["entry_count"] == 101


def test_deck_detail_unknown(real_client):
    response = real_client.get("/api/decks/does-not-exist")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "deck_not_found"


def test_entries_unpaginated(real_client):
    response = real_client.get("/api/decks/fr-en-common/entries")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 101
    assert body["limit"] is None
    assert body["offset"] == 0
    assert len(body["entries"]) == 101
    assert body["entries"][0] == {
        "id": "partie",
        "source": "partie",
        "target": "part",
        "alternatives": [],
        "tags": [],
    }


def test_entries_paginated(real_client):
    response = real_client.get("/api/decks/de-ja-starter/entries?limit=3&offset=2")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 8
    assert body["limit"] == 3
    assert body["offset"] == 2
    assert [e["id"] for e in body["entries"]] == ["brot", "wasser", "buch"]


def test_entries_offset_clamped(real_client):
    response = real_client.get("/api/decks/de-ja-starter/entries?offset=99")
    assert response.status_code == 200
    body = response.json()
    assert body["offset"] == 8
    assert body["entries"] == []


@pytest.mark.parametrize(
    "query",
    [
        "limit=0",
        "limit=501",
        "limit=-1",
        "limit=abc",
        "offset=-1",
        "offset=abc",
    ],
)
def test_entries_invalid_query(real_client, query):
    response = real_client.get(f"/api/decks/fr-en-common/entries?{query}")
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_entries_unknown_deck(real_client):
    response = real_client.get("/api/decks/nope/entries")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "deck_not_found"


def test_entry_detail(real_client):
    response = real_client.get("/api/decks/fr-en-common/entries/frere")
    assert response.status_code == 200
    body = response.json()
    assert body == {
        "id": "frere",
        "source": "frère",
        "target": "brother",
        "alternatives": [],
        "tags": [],
    }


def test_entry_detail_unicode(real_client):
    response = real_client.get("/api/decks/de-ja-starter/entries/strasse")
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "Straße"  # sharp s survives intact
    assert body["target"] == "道"  # non-Latin script round-trips
    assert body["alternatives"] == ["みち"]


def test_entry_detail_unknown_entry(real_client):
    response = real_client.get("/api/decks/fr-en-common/entries/nope")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "entry_not_found"


def test_entry_detail_unknown_deck_takes_precedence(real_client):
    response = real_client.get("/api/decks/nope/entries/frere")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "deck_not_found"
