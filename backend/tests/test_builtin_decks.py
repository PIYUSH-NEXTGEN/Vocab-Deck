"""Guards for the built-in decks shipped in app/data/decks.

These decks are the product's seed content: three language pairs, 50 entries
each, stable ids and full Unicode (umlauts, eszett, ligatures, kanji/kana).
The Japanese deck uses romaji (Latin-letter) targets so answers can be typed
on an English keyboard; kanji/kana forms are kept as accepted alternatives.
"""

from __future__ import annotations

EXPECTED_DECKS = {
    "en-fr": ("en", "fr"),
    "en-de": ("en", "de"),
    "en-ja": ("en", "ja"),
}

EXPECTED_SOURCES = [
    "water", "bread", "book", "house", "cat", "dog", "friend", "school",
    "table", "chair", "door", "window", "apple", "milk", "sun", "moon",
    "tree", "car", "city", "road", "hand", "eye", "day", "night", "love",
]


def test_exactly_the_three_builtin_decks_are_served(real_client):
    body = real_client.get("/api/decks").json()
    assert body["total"] == 3
    assert {deck["id"] for deck in body["decks"]} == set(EXPECTED_DECKS)


def test_each_deck_has_50_entries_and_the_right_language_pair(real_client):
    for deck_id, (source, target) in EXPECTED_DECKS.items():
        summary = real_client.get(f"/api/decks/{deck_id}").json()
        assert summary["source_language"] == source
        assert summary["target_language"] == target
        assert summary["entry_count"] == 50

        page = real_client.get(f"/api/decks/{deck_id}/entries").json()
        assert page["total"] == 50
        assert [entry["id"] for entry in page["entries"]][:25] == EXPECTED_SOURCES


def test_translations_are_unique_within_each_deck(real_client):
    for deck_id in EXPECTED_DECKS:
        entries = real_client.get(f"/api/decks/{deck_id}/entries").json()["entries"]
        targets = [entry["target"] for entry in entries]
        assert len(set(targets)) == len(targets), deck_id


def test_unicode_round_trips_in_every_deck(real_client):
    fr = real_client.get("/api/decks/en-fr/entries").json()["entries"]
    assert next(e for e in fr if e["id"] == "eye")["target"] == "œil"
    assert next(e for e in fr if e["id"] == "window")["target"] == "fenêtre"

    de = real_client.get("/api/decks/en-de/entries").json()["entries"]
    assert next(e for e in de if e["id"] == "road")["target"] == "Straße"
    assert next(e for e in de if e["id"] == "door")["target"] == "Tür"

    ja = real_client.get("/api/decks/en-ja/entries").json()["entries"]
    water = next(e for e in ja if e["id"] == "water")
    assert water["target"] == "mizu"  # romaji primary so it is typable
    assert water["alternatives"] == ["水", "みず"]  # kanji/kana still accepted


def test_alternatives_and_tags_are_present(real_client):
    de = real_client.get("/api/decks/en-de/entries").json()["entries"]
    car = next(e for e in de if e["id"] == "car")
    assert car["alternatives"] == ["Wagen"]
    assert car["tags"] == ["noun"]

    ja = real_client.get("/api/decks/en-ja/entries").json()["entries"]
    love = next(e for e in ja if e["id"] == "love")
    assert love["tags"] == ["noun", "verb"]


def test_second_half_entries_are_correct(real_client):
    fr = real_client.get("/api/decks/en-fr/entries").json()["entries"]
    by_id = {e["id"]: e for e in fr}
    assert by_id["beautiful"]["target"] == "beau"
    assert by_id["beautiful"]["alternatives"] == ["belle"]
    assert by_id["year"]["target"] == "année"
    assert by_id["money"]["target"] == "argent"

    de = real_client.get("/api/decks/en-de/entries").json()["entries"]
    by_id = {e["id"]: e for e in de}
    assert by_id["white"]["target"] == "weiß"
    assert by_id["big"]["target"] == "groß"
    assert by_id["family"]["target"] == "Familie"

    ja = real_client.get("/api/decks/en-ja/entries").json()["entries"]
    by_id = {e["id"]: e for e in ja}
    assert by_id["family"]["target"] == "kazoku"
    assert by_id["family"]["alternatives"] == ["家族", "かぞく"]
    assert by_id["fish"]["target"] == "sakana"
    assert by_id["white"]["target"] == "shiroi"
