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
    assert body["total"] == len(body["decks"]) == 3
    for deck in body["decks"]:
        assert REQUIRED_SUMMARY_FIELDS <= set(deck)
    by_id = {deck["id"]: deck for deck in body["decks"]}
    assert by_id["en-fr"]["entry_count"] == 50
    assert by_id["en-fr"]["source_language"] == "en"
    assert by_id["en-fr"]["target_language"] == "fr"
    assert by_id["en-de"]["source_language"] == "en"
    assert by_id["en-ja"]["target_language"] == "ja"


def test_deck_detail(real_client):
    response = real_client.get("/api/decks/en-fr")
    assert response.status_code == 200
    body = response.json()
    assert REQUIRED_SUMMARY_FIELDS <= set(body)
    assert body["id"] == "en-fr"
    assert body["entry_count"] == 50


def test_deck_detail_unknown(real_client):
    response = real_client.get("/api/decks/does-not-exist")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "deck_not_found"


def test_entries_unpaginated(real_client):
    response = real_client.get("/api/decks/en-fr/entries")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 50
    assert body["limit"] is None
    assert body["offset"] == 0
    assert len(body["entries"]) == 50
    assert body["entries"][0] == {
        "id": "water",
        "source": "water",
        "target": "eau",
        "alternatives": [],
        "tags": ["noun"],
    }


def test_entries_paginated(real_client):
    response = real_client.get("/api/decks/en-ja/entries?limit=3&offset=2")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 50
    assert body["limit"] == 3
    assert body["offset"] == 2
    assert [e["id"] for e in body["entries"]] == ["book", "house", "cat"]


def test_entries_offset_clamped(real_client):
    response = real_client.get("/api/decks/en-ja/entries?offset=99")
    assert response.status_code == 200
    body = response.json()
    assert body["offset"] == 50
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
    response = real_client.get(f"/api/decks/en-fr/entries?{query}")
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_entries_unknown_deck(real_client):
    response = real_client.get("/api/decks/nope/entries")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "deck_not_found"


def test_entry_detail(real_client):
    response = real_client.get("/api/decks/en-fr/entries/eye")
    assert response.status_code == 200
    body = response.json()
    assert body == {
        "id": "eye",
        "source": "eye",
        "target": "œil",
        "alternatives": [],
        "tags": ["noun"],
    }


def test_entry_detail_unicode(real_client):
    response = real_client.get("/api/decks/en-de/entries/road")
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "road"
    assert body["target"] == "Straße"  # sharp s survives intact


def test_entry_detail_unknown_entry(real_client):
    response = real_client.get("/api/decks/en-fr/entries/nope")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "entry_not_found"


def test_entry_detail_unknown_deck_takes_precedence(real_client):
    response = real_client.get("/api/decks/nope/entries/frere")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "deck_not_found"
