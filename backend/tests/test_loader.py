"""Loader rules: both deck formats, validation failures, Unicode, duplicates."""

from __future__ import annotations

import json

import pytest

from app.errors import DeckLoadError
from app.loader import load_decks, slugify


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("partie", "partie"),
        ("aujourd'hui", "aujourdhui"),
        ("frère", "frere"),
        ("Straße", "strasse"),
        ("café", "cafe"),
        ("多様", ""),
        ("", ""),
    ],
)
def test_slugify(text, expected):
    assert slugify(text) == expected


def test_slug_ids_are_unique_and_stable():
    rows = [{"source": "parle"}, {"source": "parlé"}, {"source": "parle"}]
    used: set[str] = set()
    ids = []
    for row in rows:
        base = slugify(row["source"]) or "entry"
        candidate, suffix = base, 2
        while candidate in used:
            candidate = f"{base}-{suffix}"
            suffix += 1
        used.add(candidate)
        ids.append(candidate)
    assert ids == ["parle", "parle-2", "parle-3"]


def test_loads_valid_json_deck(build_client, deck_payload):
    client = build_client({"demo.json": json.dumps(deck_payload())})
    body = client.get("/api/decks/demo").json()
    assert body["name"] == "Demo Deck"
    assert body["entry_count"] == 2


def test_loads_csv_deck_with_meta_sidecar(build_client):
    meta = {
        "id": "csv-deck",
        "name": "CSV Deck",
        "description": "from csv",
        "source_language": "es",
        "target_language": "en",
    }
    csv_text = (
        "source,target,alternatives,tags\n"
        "hola,hello,hi|hey,greeting\n"
        "gracias,thank you,thanks,phrase\n"
    )
    client = build_client(
        {
            "csv-deck.csv": csv_text,
            "csv-deck.meta.json": json.dumps(meta),
        }
    )
    page = client.get("/api/decks/csv-deck/entries").json()
    assert page["total"] == 2
    assert page["entries"][0]["id"] == "hola"
    assert page["entries"][0]["alternatives"] == ["hi", "hey"]
    assert page["entries"][0]["tags"] == ["greeting"]
    assert page["entries"][1]["id"] == "gracias"


def test_csv_deck_ignores_blank_lines(build_client):
    meta = {"id": "d", "name": "D", "source_language": "en", "target_language": "en"}
    csv_text = "source,target\nhello,hola\n\n\n,,\nbye,adiós\n"
    client = build_client({"d.csv": csv_text, "d.meta.json": json.dumps(meta)})
    page = client.get("/api/decks/d/entries").json()
    assert page["total"] == 2
    assert [e["source"] for e in page["entries"]] == ["hello", "bye"]


def test_unicode_survives_csv_round_trip(build_client):
    meta = {"id": "d", "name": "D", "source_language": "de", "target_language": "ja"}
    csv_text = "source,target\nStraße,道\nBücher,本\n"
    client = build_client({"d.csv": csv_text, "d.meta.json": json.dumps(meta)})
    entries = client.get("/api/decks/d/entries").json()["entries"]
    assert [(e["source"], e["target"], e["id"]) for e in entries] == [
        ("Straße", "道", "strasse"),
        ("Bücher", "本", "bucher"),
    ]


def test_duplicate_entry_ids_rejected(build_client, deck_payload):
    payload = deck_payload(
        entries=[
            {"id": "same", "source": "a", "target": "b"},
            {"id": "same", "source": "c", "target": "d"},
        ]
    )
    with pytest.raises(DeckLoadError, match="duplicate entry id 'same'"):
        build_client({"demo.json": json.dumps(payload)})


def test_exact_duplicate_source_target_pair_rejected(build_client, deck_payload):
    payload = deck_payload(
        entries=[
            {"id": "one", "source": "parle", "target": "speak"},
            {"id": "two", "source": "parle", "target": "speak"},
        ]
    )
    with pytest.raises(DeckLoadError, match="duplicate source/target pair"):
        build_client({"demo.json": json.dumps(payload)})


def test_same_target_with_distinct_sources_allowed(build_client, deck_payload):
    # parle / parlé both translate to "speak" in the real data; keep both.
    payload = deck_payload(
        entries=[
            {"id": "one", "source": "parle", "target": "speak"},
            {"id": "two", "source": "parlé", "target": "speak"},
        ]
    )
    client = build_client({"demo.json": json.dumps(payload)})
    page = client.get("/api/decks/demo/entries").json()
    assert [e["id"] for e in page["entries"]] == ["one", "two"]


def test_duplicate_deck_ids_rejected(build_client, deck_payload):
    with pytest.raises(DeckLoadError, match="duplicate deck id 'demo'"):
        build_client(
            {
                "a.json": json.dumps(deck_payload()),
                "b.json": json.dumps(deck_payload()),
            }
        )


def test_empty_entry_list_rejected(build_client, deck_payload):
    with pytest.raises(DeckLoadError, match="no entries"):
        build_client({"demo.json": json.dumps(deck_payload(entries=[]))})


def test_malformed_json_rejected(build_client):
    with pytest.raises(DeckLoadError, match="not valid JSON"):
        build_client({"broken.json": "{not json"})


def test_json_must_be_object(build_client):
    with pytest.raises(DeckLoadError, match="must be an object"):
        build_client({"demo.json": json.dumps([1, 2, 3])})


def test_missing_meta_sidecar_rejected(build_client):
    with pytest.raises(DeckLoadError, match="missing metadata sidecar"):
        build_client({"d.csv": "source,target\nhello,hola\n"})


def test_bad_csv_header_rejected(build_client):
    meta = {"id": "d", "name": "D", "source_language": "en", "target_language": "en"}
    with pytest.raises(DeckLoadError, match="must start with 'source,target'"):
        build_client({"d.csv": "word,translation\nhello,hola\n", "d.meta.json": json.dumps(meta)})


def test_invalid_language_in_meta_rejected(build_client):
    meta = {"id": "d", "name": "D", "source_language": "", "target_language": "en"}
    with pytest.raises(DeckLoadError, match="invalid deck metadata"):
        build_client({"d.csv": "source,target\nhello,hola\n", "d.meta.json": json.dumps(meta)})


def test_empty_csv_field_rejected(build_client):
    meta = {"id": "d", "name": "D", "source_language": "en", "target_language": "en"}
    with pytest.raises(DeckLoadError, match=r"row 2 is invalid"):
        build_client({"d.csv": "source,target\nhello,\n", "d.meta.json": json.dumps(meta)})


def test_empty_directory_rejected(build_client):
    with pytest.raises(DeckLoadError, match="no built-in decks"):
        build_client({})


def test_missing_directory_rejected(tmp_path):
    with pytest.raises(DeckLoadError, match="does not exist"):
        load_decks(tmp_path / "nope")


def test_multiple_problems_reported_together(build_client, deck_payload):
    payload = deck_payload(
        entries=[
            {"id": "same", "source": "a", "target": "b"},
            {"id": "same", "source": "c", "target": "d"},
            {"id": "bad", "source": "x", "target": "   "},
        ]
    )
    with pytest.raises(DeckLoadError) as excinfo:
        build_client({"demo.json": json.dumps(payload)})
    assert "duplicate entry id 'same'" in str(excinfo.value)
    assert "entry #3 is invalid" in str(excinfo.value)


def test_non_object_json_rows_reported_not_dropped(build_client, deck_payload):
    payload = deck_payload(
        entries=[
            {"id": "hello", "source": "hello", "target": "hola"},
            "just-a-string",
            42,
            {"id": "bye", "source": "bye", "target": "adios"},
        ]
    )
    with pytest.raises(DeckLoadError) as excinfo:
        build_client({"demo.json": json.dumps(payload)})
    message = str(excinfo.value)
    assert "entry #2 must be an object (got str)" in message
    assert "entry #3 must be an object (got int)" in message


def test_long_csv_source_gets_truncated_slug(build_client):
    meta = {"id": "d", "name": "D", "source_language": "en", "target_language": "en"}
    long_source = "Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch extra words here"
    csv_text = f"source,target\n{long_source}, Town\n"
    client = build_client({"d.csv": csv_text, "d.meta.json": json.dumps(meta)})
    page = client.get("/api/decks/d/entries").json()
    assert len(page["entries"][0]["id"]) <= 64


def test_slugify_truncates_long_slugs():
    assert len(slugify("x" * 200)) <= 60


def test_duplicate_deck_id_names_both_files(build_client, deck_payload):
    with pytest.raises(DeckLoadError, match="already defined by 'a.json'"):
        build_client({
            "a.json": json.dumps(deck_payload()),
            "b.json": json.dumps(deck_payload()),
        })
