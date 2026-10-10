# Flash Card Game

A vocabulary practice app: choose a deck (any language pair), then train with
flashcards, a multiple-choice quiz, typing, or matching. The original Tkinter app was
replaced by a React frontend and a FastAPI vocabulary API.

## Layout

```
backend/    FastAPI vocabulary service (built-in decks, deck/entry endpoints, CORS)
frontend/   React + TypeScript + Vite app (all game modes, custom decks, sessions)
docs/       architecture audit, data model, API contract, migration record
```

## Requirements

- Python 3.11+ with `fastapi`, `uvicorn`, `pydantic` (backend)
- Node.js 18+ with npm (frontend)

## Run locally

Backend (serves built-in decks on port 8000):

```
cd backend
pip install fastapi uvicorn pydantic
uvicorn app.main:app --reload --port 8000
```

Frontend (dev server on port 5173, proxies /api to the backend):

```
cd frontend
npm install
npm run dev
```

## Test and check

```
cd backend && python -m pytest        # API, schemas, loader, migrated-vocabulary tests
cd frontend && npm run typecheck      # tsc --noEmit
cd frontend && npm run lint           # eslint
cd frontend && npm test               # vitest + Testing Library
npm run build                         # production build (tsc + vite)
```

## Data and deployments notes

- Built-in decks are version-controlled JSON/CSV files under
  `backend/app/data/decks/`; no database, no accounts.
- Custom decks are created/imported in the browser and stored in `localStorage`
  (`flash-card-game.customDecks.v1`); export them as JSON for a portable backup.
- Gameplay progress is session-only and memory-resident; reloading the tab resets it.
- CORS is configured with the `CORS_ORIGINS` env var (comma-separated; `*` allows all).
- Full design, API contract and the Tkinter migration record: `docs/architecture.md`.
