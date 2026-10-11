# Vocab Deck — Deployment & Operations Guide

This document covers repository structure, local development, the API contract,
deck data formats, persistence behaviour, deployment steps, and known
limitations. Every command and test listed here was executed on Windows with
Python 3.14 and Node.js 24; results are reported in the last section.

---

## 1. Repository structure

```
Vocab-Deck/
├── backend/                     # FastAPI vocabulary service (Python)
│   ├── app/
│   │   ├── main.py              # app factory, routes, CORS, error handlers
│   │   ├── config.py            # settings read from environment variables
│   │   ├── schemas.py           # pydantic models = the API contract
│   │   ├── loader.py            # deck discovery + validation (JSON, CSV+meta)
│   │   ├── errors.py            # domain errors → HTTP error JSON
│   │   └── data/decks/          # version-controlled built-in decks
│   │       ├── en-de.json       # English → German (25 entries)
│   │       ├── en-fr.json       # English → French (25 entries)
│   │       └── en-ja.json       # English → Japanese (25 entries)
│   ├── tests/                   # pytest + FastAPI TestClient
│   └── pyproject.toml
├── frontend/                    # React + TypeScript + Vite SPA
│   ├── e2e/                     # Playwright end-to-end tests
│   ├── src/
│   │   ├── api/                 # typed API client + async resource hook
│   │   ├── game/                # engine (rng, text rules, builders) + 4 modes
│   │   ├── session/             # in-memory session stats + restart
│   │   ├── storage/             # custom decks in localStorage
│   │   ├── theme/               # light/dark theme provider
│   │   ├── components/          # shell, nav, footer, cards, buttons, toggle
│   │   ├── pages/               # Home, Library, Editor, About, Play
│   │   └── styles/              # tokens → global → components → motion
│   ├── playwright.config.ts
│   └── package.json
└── docs/
    ├── architecture.md          # audit, data model, API contract, design system
    └── deployment.md            # this document
```

### Architecture at a glance

- **Frontend** (static SPA): talks to the backend over `/api` through either the
  Vite dev/preview proxy (`VITE_API_TARGET`) or an absolute base URL
  (`VITE_API_URL`). All gameplay state lives in memory; custom decks live in
  `localStorage`; the theme choice lives in `localStorage`.
- **Backend** (stateless API): loads and validates deck files at startup, serves
  deck/entry data and a health check. No database, no authentication, no
  gameplay endpoints.
- **Deployment is two independent pieces**: a static bundle for the frontend and
  a Python process for the backend.

---

## 2. Local setup and development

### Backend

```
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install fastapi uvicorn pydantic
uvicorn app.main:app --reload --port 8000
```

Run the API tests (no services required):

```
cd backend && python -m pytest        # 76 tests
```

### Frontend

```
cd frontend
npm install
npm run dev                          # http://localhost:5173 (proxies /api to :8000)
```

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with API proxy |
| `npm run build` | `tsc --noEmit` + production bundle into `dist/` |
| `npm run preview` | Serve the production build (honours the same proxy) |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit/component tests (146 tests) |
| `npm run test:e2e` | Playwright end-to-end tests (25 tests) |

The Playwright config boots the backend on port 8010 and a preview build on
port 4173 automatically; browsers are installed once with
`npx playwright install chromium`.

---

## 3. API endpoints and environment variables

### Endpoints (all under `/api`)

| Method | Path | Success | Errors |
|---|---|---|---|
| GET | `/api/health` | 200 `{status, version, deck_count}` | — |
| GET | `/api/decks` | 200 `{decks: [...], total}` | — |
| GET | `/api/decks/{deckId}` | 200 deck summary | 404 `deck_not_found` |
| GET | `/api/decks/{deckId}/entries` | 200 `{entries, total, limit, offset}` (query: `limit` 1–500, `offset` ≥ 0) | 404, 422 `validation_error` |
| GET | `/api/decks/{deckId}/entries/{entryId}` | 200 entry | 404 `entry_not_found` |

Error bodies are always `{ "error": { "code", "message" } }`. CORS preflight is
answered for configured origins.

### Environment variables

| Variable | Used by | Default | Purpose |
|---|---|---|---|
| `CORS_ORIGINS` | backend | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated browser origins allowed to call the API; `*` allows all |
| `APP_ENV` | backend | `development` | Informational only |
| `VITE_API_TARGET` | frontend dev/preview | `http://127.0.0.1:8000` | Where the `/api` proxy forwards requests |
| `VITE_API_URL` | frontend | `/api` | Absolute API base URL; when set, requests bypass the proxy entirely |

For production, set `CORS_ORIGINS` to the deployed frontend origin (for example
`https://vocab-deck.example.com`) and either proxy `/api` on the frontend host
or build with `VITE_API_URL=https://api.example.com/api`.

---

## 4. Vocabulary data formats

### Built-in decks (backend)

Built-in decks are JSON documents in `backend/app/data/decks/`:

```json
{
  "id": "en-fr",
  "name": "English to French",
  "description": "25 everyday English words with French translations.",
  "source_language": "en",
  "target_language": "fr",
  "entries": [
    { "id": "water", "source": "water", "target": "eau", "alternatives": [], "tags": ["noun"] }
  ]
}
```

Rules (validated at startup; the app refuses to start on violation):

- Deck ids match `^[a-z0-9][a-z0-9_-]{0,63}$` and are unique.
- Entry ids match the same pattern and are unique within a deck.
- Source/target/alternatives/tags must be non-empty after NFC normalization;
  no duplicate `(source, target)` pairs within a deck.
- Languages match `^[a-z]{2,3}(-[A-Za-z]{2,4})?$` (`fr`, `ja`, `zh-Hans`, ...).
- A deck needs at least one entry.

A CSV variant is also supported: `<id>.csv` with a `source,target[,alternatives,tags]`
header (`|`-separated lists) plus an `<id>.meta.json` sidecar carrying
`id`, `name`, `description`, `source_language`, `target_language`. CSV decks
derive entry ids from slugs of the source text (`-2`, `-3` suffixes on
collisions).

### Custom decks (browser)

The import/export format is a single JSON document:

```json
{
  "version": 1,
  "deck": { "id": "custom-spanish-basics", "name": "...", "description": "...",
            "sourceLanguage": "es", "targetLanguage": "en", "entryCount": 2 },
  "entries": [ { "id": "hola", "source": "hola", "target": "hello",
                 "alternatives": [], "tags": [] } ],
  "exportedAt": "2026-01-01T00:00:00.000Z"
}
```

The library also exports **CSV** in the comment-header format:

```
# deck: Spanish basics
# description: Everyday words
# sourceLanguage: es
# targetLanguage: en
source,target,alternatives,tags
hola,hello,hi,greeting
```

CSV import derives ids from the source text and keeps alternatives/tags. Import
is validated before anything is stored, previewed, and must be confirmed; a
document whose deck id already exists in the browser is rejected.

---

## 5. Persistence and backups

| Data | Where | Survives reload | Backup |
|---|---|---|---|
| Built-in decks | Git (`backend/app/data/decks/`) | yes | version control |
| Custom decks | `localStorage["flash-card-game.customDeks.v1"]` | yes, same browser | **Export JSON/CSV** from the library |
| Theme choice | `localStorage["vocabdeck.theme"]` | yes | re-selectable |
| Gameplay progress | memory only | **no** — restarting the tab clears it | none (by design) |

To move custom decks to another browser or device: library → *Export JSON* (or
*Export CSV*) → on the other device, library → import the file. Deleting browser
data deletes custom decks, so export before doing so.

---

## 6. Deployment steps

### Backend (any Python host)

```
cd backend
pip install fastapi uvicorn pydantic
CORS_ORIGINS=https://your-frontend.example.com uvicorn app.main:app --host 0.0.0.0 --port 8000
```

- Deck files are read at startup, so redeploy (or restart) after changing them.
- Put it behind any reverse proxy that terminates TLS. Health check:
  `GET /api/health` → `{"status":"ok","deck_count":3}`.
- No database or migrations are required.

### Frontend (any static host)

```
cd frontend
npm ci
npm run build                     # produces dist/
```

Serve `dist/` from any static host (Netlify, Vercel, Cloudflare Pages, S3,
GitHub Pages, nginx). Then either:

- **Proxy `/api`** on the static host to the backend (recommended): keep the
  default `VITE_API_URL=/api`, e.g. nginx `location /api { proxy_pass http://backend:8000; }`.
- **Or** point directly at the API: build with
  `VITE_API_URL=https://api.example.com/api` and set `CORS_ORIGINS` on the
  backend to the frontend origin.

Caveat: a static host cannot rewrite paths for a single-page app automatically —
configure it to serve `index.html` for unknown routes (the app uses
`/library`, `/editor/:id`, `/play/:mode/:deckId`, `/about`).

---

## 7. Known limitations and unverified steps

- **Not verified on a real hosting provider.** Deployment was validated locally:
  the production bundle builds, `vite preview` serves it and the Playwright suite
  runs against that preview build with the real backend. No cloud host, custom
  domain, or TLS certificate was exercised.
- **Playwright browsers** are installed locally (`chromium` headless shell);
  other browsers are not configured.
- **Fonts load from Google Fonts.** Offline or restricted networks fall back to
  the system mono stack; consider self-hosting for production.
- **localStorage limits** apply to custom decks (typically ~5 MB per origin);
  the import preview guards against absurd payloads but very large libraries are
  untested.
- **The flip animation's back face** is absolutely positioned; an unusually long
  translation can extend past the front face's height (reduced-motion mode flows
  naturally instead).
- **CORS with credentials** is enabled only for explicit origins (never with `*`).
- **`reuseExistingServer`** in the Playwright config reuses locally running
  servers when not in CI; set `CI=1` for strict behaviour.

---

## 8. Verification record (this pass)

Executed on the committed tree:

| Check | Result |
|---|---|
| Backend tests (`python -m pytest`) | **76 passed** |
| Frontend unit/component tests (`npm test`) | **146 passed** (15 files) |
| TypeScript type-check (`npm run typecheck`) | clean |
| ESLint (`npm run lint`) | clean |
| Production build (`npm run build`) | **succeeded** (27.6 kB CSS, 363 kB JS / 116 kB gzip) |
| Playwright E2E (`npm run test:e2e`) | **25 passed** — all four modes, three language pairs, built-in + custom decks, import/export round-trip, malformed-import rejection, session reset, storage isolation, responsive layouts (390 px and 1280 px), theme toggle with persistence |

One regression was found and fixed during this pass: `MatchingMode.tsx`
contained an unused ref that broke `tsc --noEmit` and therefore the production
build; it is removed and the build passes again.
