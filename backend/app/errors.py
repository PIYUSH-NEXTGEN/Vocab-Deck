"""Domain errors and their HTTP mapping."""

from __future__ import annotations


class ApiError(Exception):
    """Base error that serializes to the API error schema.

    Subclasses only set ``code`` and ``status_code``.
    """

    code = "internal_error"
    status_code = 500

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class DeckNotFoundError(ApiError):
    code = "deck_not_found"
    status_code = 404


class EntryNotFoundError(ApiError):
    code = "entry_not_found"
    status_code = 404


class DeckLoadError(RuntimeError):
    """Raised when built-in deck files fail validation.

    This is a startup-time (fail fast) error: built-in decks are version-controlled,
    so a failure is a server bug, never a user input problem.
    """
