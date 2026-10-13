"""FastAPI application: vocabulary endpoints, CORS from the environment.

Run locally:  uvicorn app.main:app --reload --port 8000
(From the ``backend`` directory; deck discovery is relative to this file.)
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import __version__
from .config import Settings
from .errors import ApiError, DeckNotFoundError, EntryNotFoundError
from .loader import Deck, load_decks
from .schemas import DeckListResponse, EntryPage, Health, VocabularyEntry

logger = logging.getLogger("flash_card_game")

DEFAULT_DATA_DIR = Path(__file__).resolve().parent / "data" / "decks"


class DeckStore:
    """Read-only access to validated built-in decks."""

    def __init__(self, decks: dict[str, Deck]) -> None:
        self._decks = decks

    def list(self) -> list[Deck]:
        return [self._decks[key] for key in sorted(self._decks)]

    def get(self, deck_id: str) -> Deck:
        deck = self._decks.get(deck_id)
        if deck is None:
            raise DeckNotFoundError(
                f"Deck '{deck_id}' does not exist. Use GET /api/decks to list decks."
            )
        return deck

    def get_entry(self, deck_id: str, entry_id: str) -> VocabularyEntry:
        deck = self.get(deck_id)
        for entry in deck.entries:
            if entry.id == entry_id:
                return entry
        raise EntryNotFoundError(
            f"Entry '{entry_id}' does not exist in deck '{deck_id}'."
        )


def create_app(
    data_dir: Path | None = None,
    settings: Settings | None = None,
) -> FastAPI:
    settings = settings or Settings.from_env()
    decks = load_decks(data_dir or DEFAULT_DATA_DIR)
    logger.info("Loaded %d built-in deck(s) from %s", len(decks), data_dir or DEFAULT_DATA_DIR)

    app = FastAPI(
        title="Flash Card Game Vocabulary API",
        version=__version__,
        description=(
            "Vocabulary service for the Flash Card Game. Serves version-controlled "
            "built-in decks (multiple language pairs). No authentication, no database, "
            "no gameplay-progress endpoints."
        ),
    )
    app.state.settings = settings
    app.state.deck_store = DeckStore(decks)

    origins = settings.cors_origins
    if "*" in origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=False,
            allow_methods=["GET"],
            allow_headers=["*"],
        )
    else:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            allow_credentials=True,
            allow_methods=["GET"],
            allow_headers=["*"],
        )

    @app.middleware("http")
    async def security_headers(request: Request, call_next):  # type: ignore[no-untyped-def]
        """Minimal hardening for JSON API responses (no behavior change)."""
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        # Built-in decks are immutable per deployment, so repeat visits (every
        # page mount refetches) are served from the browser cache for a minute.
        # Health is excluded: monitoring should always see a live response.
        if request.url.path.startswith("/api/decks"):
            response.headers["Cache-Control"] = "public, max-age=60"
        return response

    # FastAPI's Annotated+Depends form for the store isn't honored here, so handlers
    # read the store from app.state directly (keeps create_app injectable in tests).
    def store_of(request: Request) -> DeckStore:
        return request.app.state.deck_store

    @app.exception_handler(ApiError)
    async def api_error_handler(request: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": exc.code, "message": exc.message}},
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        parts = []
        for error in exc.errors():
            location = ".".join(str(part) for part in error.get("loc", ())) or "request"
            message = str(error.get("msg", "invalid")).removeprefix("Value error, ")
            parts.append(f"{location}: {message}")
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "validation_error",
                    "message": "; ".join(parts) or "Invalid request.",
                }
            },
        )

    @app.exception_handler(Exception)
    async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error for %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "internal_error",
                    "message": "Unexpected server error.",
                }
            },
        )

    @app.get("/api/health", response_model=Health, tags=["meta"])
    async def health(request: Request) -> Health:
        return Health(
            status="ok", version=__version__, deck_count=len(store_of(request).list())
        )

    @app.get("/api/decks", response_model=DeckListResponse, tags=["decks"])
    async def list_decks(request: Request) -> DeckListResponse:
        store = store_of(request)
        summaries = [
            deck.summary.model_copy(update={"entry_count": len(deck.entries)})
            for deck in store.list()
        ]
        return DeckListResponse(decks=summaries, total=len(summaries))

    @app.get("/api/decks/{deck_id}", tags=["decks"])
    async def get_deck(deck_id: str, request: Request) -> JSONResponse:
        deck = store_of(request).get(deck_id)
        return JSONResponse(content=deck.summary.model_dump(mode="json"))

    @app.get("/api/decks/{deck_id}/entries", response_model=EntryPage, tags=["vocabulary"])
    async def list_entries(
        request: Request,
        deck_id: str,
        limit: Annotated[int | None, Query(ge=1, le=500, description="Page size")] = None,
        offset: Annotated[int, Query(ge=0, description="Items to skip")] = 0,
    ) -> EntryPage:
        entries = store_of(request).get(deck_id).entries
        total = len(entries)
        if offset > total:
            offset = total
        window = entries[offset : offset + limit] if limit is not None else entries[offset:]
        return EntryPage(
            entries=list(window),
            total=total,
            limit=limit,
            offset=offset,
        )

    @app.get(
        "/api/decks/{deck_id}/entries/{entry_id}",
        response_model=VocabularyEntry,
        tags=["vocabulary"],
    )
    async def get_entry(deck_id: str, entry_id: str, request: Request) -> VocabularyEntry:
        return store_of(request).get_entry(deck_id, entry_id)

    return app


app = create_app()
