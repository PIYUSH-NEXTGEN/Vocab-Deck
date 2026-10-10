"""Pydantic schemas: the single source of truth for the API contract.

Field names are the wire format (snake_case). The React frontend may re-map to
camelCase internally; see docs/architecture.md.
"""

from __future__ import annotations

import re
import unicodedata

from pydantic import BaseModel, ConfigDict, Field, field_validator

# BCP-47-ish primary tag with an optional region or script: fr, de, ja, zh-Hans.
LANGUAGE_PATTERN = re.compile(r"^[a-z]{2,3}(-[A-Za-z]{2,4})?$")
DECK_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")
MAX_TEXT = 500


def normalize_text(value: str) -> str:
    """NFC-normalize and trim; empty/whitespace-only text is invalid."""
    return unicodedata.normalize("NFC", value).strip()


class VocabularyEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    source: str
    target: str
    alternatives: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)

    @field_validator("source", "target")
    @classmethod
    def _validate_text(cls, value: str) -> str:
        text = normalize_text(value)
        if not text:
            raise ValueError("must not be empty")
        if len(text) > MAX_TEXT:
            raise ValueError(f"must be at most {MAX_TEXT} characters")
        return text

    @field_validator("alternatives", "tags")
    @classmethod
    def _validate_list(cls, values: list[str]) -> list[str]:
        cleaned: list[str] = []
        for raw in values:
            if not isinstance(raw, str):
                raise ValueError("must be a list of strings")
            text = normalize_text(raw)
            if not text:
                raise ValueError("must not contain empty items")
            if text not in cleaned:
                cleaned.append(text)
        return cleaned

    @field_validator("id")
    @classmethod
    def _validate_id(cls, value: str) -> str:
        if not value:
            raise ValueError("must not be empty")
        if not DECK_ID_PATTERN.match(value):
            raise ValueError(
                "must match ^[a-z0-9][a-z0-9_-]{0,63}$ (lowercase ASCII id)"
            )
        return value


class DeckSummary(BaseModel):
    """Deck metadata without entries (list and detail views)."""

    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    description: str = ""
    source_language: str
    target_language: str
    entry_count: int = Field(default=0, ge=0)

    @field_validator("id")
    @classmethod
    def _validate_id(cls, value: str) -> str:
        if not DECK_ID_PATTERN.match(value):
            raise ValueError("must match ^[a-z0-9][a-z0-9_-]{0,63}$")
        return value

    @field_validator("name", "description")
    @classmethod
    def _validate_text(cls, value: str) -> str:
        text = normalize_text(value)
        if len(text) > 1000:
            raise ValueError("must be at most 1000 characters")
        return text

    @field_validator("source_language", "target_language")
    @classmethod
    def _validate_language(cls, value: str) -> str:
        if not LANGUAGE_PATTERN.match(value):
            raise ValueError(
                "must be a valid language code, e.g. 'fr', 'de', 'ja' or 'zh-Hans'"
            )
        return value


class DeckListResponse(BaseModel):
    decks: list[DeckSummary]
    total: int


class EntryPage(BaseModel):
    entries: list[VocabularyEntry]
    total: int
    limit: int | None
    offset: int


class Health(BaseModel):
    status: str = "ok"
    version: str
    deck_count: int


class ErrorBody(BaseModel):
    code: str
    message: str


class ApiErrorResponse(BaseModel):
    error: ErrorBody
