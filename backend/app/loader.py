"""Built-in deck loading and validation.

Deck files live in ``app/data/decks`` and come in two formats, both validated by this
module with identical rules:

1. ``<id>.json`` — complete deck document.
2. ``<id>.csv`` + ``<id>.meta.json`` — tabular vocabulary plus a JSON metadata
   sidecar. Columns: ``source,target[,alternatives,tags]`` with ``|``-separated lists.

Rules:
- deck id: ``^[a-z0-9][a-z0-9_-]{0,63}$``, unique across all built-in decks;
- entry ids: same pattern, unique within a deck (CSV decks get slugs derived from the
  source text, with ``-2``, ``-3`` suffixes for collisions — never renumbered);
- source/target/alternatives/tags must be non-empty after NFC normalization;
- no duplicate ``(source, target)`` pairs within a deck;
- source/target languages must match the language pattern;
- a deck must contain at least one entry.

The loader is fail-fast: every problem found, across every deck, is reported at once.
"""

from __future__ import annotations

import csv
import json
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path

from pydantic import ValidationError

from .errors import DeckLoadError
from .schemas import DeckSummary, VocabularyEntry

SLUG_PATTERN = re.compile(r"[^a-z0-9]+")
DECK_FILE_SUFFIXES = (".csv", ".json")
META_SUFFIX = ".meta.json"

# Characters that survive NFKD decomposition unchanged but have an ASCII expansion.
TRANSLITERATIONS = {
    "ß": "ss",
    "æ": "ae",
    "œ": "oe",
    "ø": "o",
    "đ": "d",
    "ł": "l",
    "þ": "th",
    "ð": "d",
}


def slugify(text: str) -> str:
    """Deterministic ASCII slug for a source text; ``''`` when nothing survives.

    ``aujourd'hui`` -> ``aujourdhui``, ``frère`` -> ``frere``, ``Straße`` -> ``strasse``.

    Slugs are capped at 60 characters so generated entry ids always fit the
    ``^[a-z0-9][a-z0-9_-]{0,63}$`` pattern (leaving room for ``-2``-style
    collision suffixes), matching the frontend's truncation.
    """
    decomposed = unicodedata.normalize("NFKD", text.strip())
    stripped = "".join(c for c in decomposed if not unicodedata.combining(c))
    for src, dst in TRANSLITERATIONS.items():
        stripped = stripped.replace(src, dst)
    stripped = stripped.replace("'", "")  # aujourd'hui -> aujourdhui, not aujourd-hui
    ascii_text = stripped.casefold().encode("ascii", "ignore").decode("ascii")
    return SLUG_PATTERN.sub("-", ascii_text).strip("-")[:60].rstrip("-")


@dataclass(frozen=True)
class Deck:
    """A validated built-in deck: summary metadata plus ordered entries."""

    summary: DeckSummary
    entries: tuple[VocabularyEntry, ...]


def _format_validation_errors(exc: ValidationError) -> str:
    """One-line summary of every pydantic failure (shared by rows and metadata)."""
    return "; ".join(
        f"{'.'.join(str(part) for part in error['loc']) or 'entry'}: {error['msg']}"
        for error in exc.errors()
    )


def _parse_rows(
    rows: list[object], *, assign_ids: bool, deck_label: str
) -> tuple[list[VocabularyEntry], list[str]]:
    """Turn raw entry dicts into validated entries; collect every problem."""
    problems: list[str] = []
    used_ids: set[str] = set()
    entries: list[VocabularyEntry] = []

    for index, raw_row in enumerate(rows):
        if not isinstance(raw_row, dict):
            problems.append(
                f"{deck_label}: entry #{index + 1} must be an object "
                f"(got {type(raw_row).__name__})"
            )
            continue
        payload = dict(raw_row)
        label = payload.pop("_row_label", f"entry #{index + 1}")
        if assign_ids:
            base = slugify(str(payload.get("source", ""))) or "entry"
            candidate = base
            suffix = 2
            while candidate in used_ids:
                candidate = f"{base}-{suffix}"
                suffix += 1
            payload["id"] = candidate
        entry_id = payload.get("id")
        if entry_id in used_ids:
            problems.append(f"{deck_label}: duplicate entry id '{entry_id}' ({label})")
            continue
        try:
            entry = VocabularyEntry.model_validate(payload)
        except ValidationError as exc:
            details = _format_validation_errors(exc)
            problems.append(f"{deck_label}: {label} is invalid ({details})")
            continue
        used_ids.add(entry.id)
        entries.append(entry)

    return entries, problems


def _build_deck(
    meta: dict, rows: list[object], *, assign_ids: bool, deck_label: str
) -> Deck:
    """Validate deck metadata and entries; shared by both file formats."""
    try:
        summary = DeckSummary.model_validate(
            {**{k: v for k, v in meta.items() if k != "entries"}, "entry_count": 0}
        )
    except ValidationError as exc:
        raise DeckLoadError(
            f"{deck_label}: invalid deck metadata ({_format_validation_errors(exc)})"
        ) from exc

    entries, problems = _parse_rows(rows, assign_ids=assign_ids, deck_label=deck_label)

    if not entries:
        problems.append(f"{deck_label}: deck has no entries")
    else:
        seen_pairs: set[tuple[str, str]] = set()
        for entry in entries:
            pair = (entry.source.casefold(), entry.target.casefold())
            if pair in seen_pairs:
                problems.append(
                    f"{deck_label}: duplicate source/target pair "
                    f"'{entry.source}' -> '{entry.target}' (entry '{entry.id}')"
                )
            seen_pairs.add(pair)

    if problems:
        raise DeckLoadError("; ".join(problems))

    return Deck(
        summary=summary.model_copy(update={"entry_count": len(entries)}), entries=entries
    )


def _load_json_deck(path: Path) -> Deck:
    label = path.name
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise DeckLoadError(f"{label}: not valid JSON ({exc})") from exc
    if not isinstance(raw, dict):
        raise DeckLoadError(f"{label}: JSON deck must be an object")
    rows = raw.get("entries") or []
    if not isinstance(rows, list):
        raise DeckLoadError(f"{label}: 'entries' must be a list")
    return _build_deck(
        raw, list(rows), assign_ids=False, deck_label=label
    )


def _load_csv_deck(path: Path) -> Deck:
    label = path.name
    meta_path = path.with_suffix(META_SUFFIX)
    if not meta_path.is_file():
        raise DeckLoadError(f"{label}: missing metadata sidecar '{meta_path.name}'")
    try:
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise DeckLoadError(f"{meta_path.name}: not valid JSON ({exc})") from exc
    if not isinstance(meta, dict):
        raise DeckLoadError(f"{meta_path.name}: deck metadata must be an object")

    rows: list[dict] = []
    try:
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            headers = [name.strip() if name else "" for name in reader.fieldnames or []]
            if headers[:2] != ["source", "target"]:
                raise DeckLoadError(
                    f"{label}: header must start with 'source,target' "
                    f"(got: {','.join(headers) or '<empty>'})"
                )
            for row_number, row in enumerate(reader, start=2):
                row_label = f"row {row_number}"
                extra = row.get(None) or []  # csv restkey for over-long rows
                if any((item or "").strip() for item in extra):
                    raise DeckLoadError(
                        f"{label}: {row_label} has more columns than the header"
                    )
                if all(
                    (value or "").strip() == ""
                    for key, value in row.items()
                    if key is not None
                ):
                    continue  # skip blank padding rows
                entry = {
                    "source": (row.get("source") or "").strip(),
                    "target": (row.get("target") or "").strip(),
                }
                alternatives = (row.get("alternatives") or "").strip()
                if alternatives:
                    entry["alternatives"] = [p.strip() for p in alternatives.split("|")]
                tags = (row.get("tags") or "").strip()
                if tags:
                    entry["tags"] = [p.strip() for p in tags.split("|")]
                entry["_row_label"] = row_label
                rows.append(entry)
    except (OSError, csv.Error) as exc:
        raise DeckLoadError(f"{label}: cannot read CSV ({exc})") from exc

    return _build_deck(meta, rows, assign_ids=True, deck_label=meta_path.name)


def _load_deck_file(path: Path) -> Deck:
    if path.suffix == ".csv":
        return _load_csv_deck(path)
    return _load_json_deck(path)


def discover_deck_files(data_dir: Path) -> list[Path]:
    """All loadable deck files (JSON decks and CSV decks, never their meta sidecars)."""
    return sorted(
        path
        for path in data_dir.iterdir()
        if path.is_file()
        and path.name.endswith(DECK_FILE_SUFFIXES)
        and not path.name.endswith(META_SUFFIX)
    )


def load_decks(data_dir: Path) -> dict[str, Deck]:
    """Load and validate every built-in deck in ``data_dir`` (fail fast)."""
    if not data_dir.is_dir():
        raise DeckLoadError(f"deck directory does not exist: {data_dir}")

    decks: dict[str, Deck] = {}
    deck_files: dict[str, str] = {}
    problems: list[str] = []
    for path in discover_deck_files(data_dir):
        try:
            deck = _load_deck_file(path)
        except DeckLoadError as exc:
            problems.append(str(exc))
            continue
        if deck.summary.id in decks:
            problems.append(
                f"{path.name}: duplicate deck id '{deck.summary.id}' "
                f"(already defined by '{deck_files[deck.summary.id]}')"
            )
            continue
        decks[deck.summary.id] = deck
        deck_files[deck.summary.id] = path.name

    if problems:
        raise DeckLoadError(
            f"{len(problems)} problem(s) in built-in decks at {data_dir}: "
            + "; ".join(problems)
        )
    if not decks:
        raise DeckLoadError(f"no built-in decks found in {data_dir}")
    return decks
