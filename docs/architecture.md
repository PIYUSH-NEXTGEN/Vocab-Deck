# Vocab Deck — Architecture & Migration Plan

Status: approved. Scope of this document: audit of the Tkinter app, target data model, API
contract, error behavior, and migration rules. Implementation in this stage covers the
FastAPI backend and vocabulary data layer only.

## 1. Audit of the existing repository

### Source (`main.py`)
- Single-file Tkinter app. Loads `words_to_learn.csv`, falls back to `known_words`, then
  `french_words.csv`; converts to a list of dicts with pandas; shows random cards, flips
  after 3 s; ✅ removes the card and rewrites `words_to_learn.csv`, ❌ skips.
- Tightly couples progress persistence with the working file: gameplay progress and
  canonical vocabulary are mixed (progress is written over the deck file).
- Hardcodes `French`/`English` column names and a single language pair.

### Assets
- `card_front.png` / `card_back.png` (canvas, 800x526 design) — reusable in the React card
  component and flip animation.
- `wrong.png` / `right.png` (button icons) — reusable as feedback-button icons.
- Background color `#B1DDC6` and the 3-second auto-flip are reusable design tokens.

### Vocabulary files
| File | Rows | Role | Verdict |
|---|---|---|---|
| `french_words.csv` | 101 | tutorial/starting vocabulary, clean, UTF-8 (no BOM) | **canonical source of the built-in deck** |
| `words_to_learn.csv` | 97 | leftover in-progress study list (missing 4 words: `cause`, `jouer`, `plûtot`, `venu`) | gameplay-progress artifact — **not** migrated |
| `known_words` | 89 | earlier progress snapshot; malformed header (stray unnamed pandas index column) | gameplay-progress artifact — **not** migrated |

> **Post-migration cleanup:** after this audit and the migration, `main.py`, the three
> vocabulary files above and the four PNG assets were removed from the working tree
> (recoverable from git history). The deck data now lives only in
> `backend/app/data/decks/`; the PNGs were not used because the approved visual
> direction for the React app is typographic rather than image-based.

### Data quality findings (canonical file)
- 0 blank cells, 0 duplicate source words — structurally sound.
- 5 duplicate translations, each a legitimate pair of distinct French words
  (`parlé`/`parle`→speak, `demande`/`demandé`→request, `arrivé`/`venez`→come,
  `donné`/`donne`→given, `premier`/`première`→first). Kept as separate entries; do not
  de-duplicate — quiz mode must still discriminate them.
- Flagged, left unchanged: `place`→"square" vs `endroit`→"place" (the source word `place`
  is ambiguous; subtitle-derived glosses differ by context).
- 4 inconsistently capitalized English glosses (`Warning`, `Wait`, `Stop`, `Earth`) —
  corrected (documented below) to match the rest of the data.
- All accents/Unicode preserved; backend must validate and store UTF-8 text verbatim
  (NFC-normalized on write only, to keep IDs stable).

### Migration risks
- Overwriting the user's remaining progress file: progress becomes session-only and
  memory-resident, so no user data is lost by ignoring `words_to_learn.csv` (documented
  as a correction rather than silently dropped).
- Slug-derived entry IDs must stay stable across re-runs; any source-text edit requires a
  documented ID-stability rule (additive suffixes, never renumber existing IDs).
- `known_words` has no extension and a broken header — any tooling that globs `*.csv` will
  miss it; nothing should depend on it.

## 2. Target architecture

```
flash-card-game/
  main.py, *.png            # legacy Tkinter app (kept for reference, not deployed)
  docs/architecture.md      # this document
  backend/                  # Python + FastAPI (this stage)
    app/
      main.py               # app factory, CORS from env, error handlers, routes
      config.py             # pydantic-settings: CORS_ORIGINS, APP_ENV
      schemas.py            # request/response models (pydantic)
      errors.py             # domain errors -> HTTP responses
      loader.py             # deck discovery + validation (JSON and CSV decks)
      data/decks/           # version-controlled built-in decks
        fr-en-common.csv + fr-en-common.meta.json
        de-ja-starter.json
    tests/                  # pytest + httpx (TestClient); includes the migrated-vocabulary
                             # regression fixture (test_migration_fidelity.py)
    pyproject.toml
```

Frontend (React + TypeScript + Vite, later stage) consumes the API below, owns custom
decks in `localStorage`, and owns all gameplay progress in memory.

### Separation of concerns
- **Vocabulary data layer** (`backend/app/data/decks` + `loader.py`): immutable deck files,
  discovery, parse, validation. No game concepts.
- **Deck management** (`loader.py` + deck endpoints): list/detail, entry lookup.
- **Game logic**: frontend-only (four modes: flashcards, multiple-choice, typing,
  matching). The backend is a vocabulary service and never sees scores or answers.
- **Session progress**: in-memory only on the client, discarded on reload. Custom decks
  persist in `localStorage` (portable via JSON export/import) — never on the server.
- No accounts, no database, no ORM, no cloud saves.

## 3. Data model

```ts
// Frontend types (mirror the API schemas exactly);
// the React layer may re-map to camelCase internally.
export interface VocabularyEntry {
  id: string;            // stable, unique within a deck
  source: string;        // source-language text, NFC UTF-8
  target: string;        // primary target translation
  alternatives: string[]; // optional alternative translations
  tags: string[];         // optional tags ("noun", "verb", ...)
}

export interface DeckSummary {
  id: string;             // stable, unique across built-in decks
  name: string;
  description: string;
  source_language: string; // BCP-47 primary tag, e.g. "fr"
  target_language: string;
  entry_count: number;
}

export interface EntryPage {
  entries: VocabularyEntry[];
  total: number;
  limit: number | null;  // null when unpaginated
  offset: number;
}

export interface Health {
  status: "ok";
  version: string;
  deck_count: number;
}
```

Custom decks (client-side) use the same `DeckSummary` + entries shape; import/export
file is a single JSON document: `{ "version": 1, "deck": DeckSummary, "entries": [...] }`.

### Deck file formats (both validated by the same loader)

1. **JSON**: `backend/app/data/decks/<deck-id>.json` — full deck document
   (`id`, `name`, `description`, `source_language`, `target_language`, `entries`).
2. **CSV + sidecar**: `backend/app/data/decks/<deck-id>.csv` with header
   `source,target[,alternatives,tags]` (alternatives/tags are `|`-separated lists) plus
   `<deck-id>.meta.json` holding `id`, `name`, `description`, `source_language`,
   `target_language`. Used for the migrated French deck to keep the original CSV data
   version-controlled and diffable.

### ID rules
- Deck IDs: `^[a-z0-9][a-z0-9_-]{0,63}$`, unique across built-in decks.
- Entry IDs: same pattern, unique within a deck. Migration derives them
  from a slug of the source text (`aujourd'hui` → `aujourdhui`); collisions get `-2`,
  `-3`, ... suffixes appended, never renumbering existing IDs.
- Languages: `^[a-z]{2,3}(-[A-Za-z]{2,4})?$` (e.g. `fr`, `de`, `ja`, `zh-Hans`).

### Validation rules
- Empty/whitespace-only `source` or `target` → invalid.
- Duplicate entry ID (or duplicate un-slugged source text) within a deck → invalid.
- Duplicate deck ID → invalid (fail fast at startup).
- Malformed file (bad JSON/CSV, missing columns, bad sidecar) → invalid.
- Invalid language code → invalid.
- Unicode: text preserved verbatim; empty-after-NFC check; IDs must be ASCII.
- Empty entry list is allowed at load but a deck detail response carries the flag; the
  loader rejects empty decks by default unless explicitly allowed.

## 4. API contract

All routes under `/api`. All responses are JSON (UTF-8 by JSON spec).

| Method | Path | Success | Errors |
|---|---|---|---|
| GET | `/api/health` | 200 `Health` | — |
| GET | `/api/decks` | 200 `{ decks: DeckSummary[], total: number }` | — |
| GET | `/api/decks/{deckId}` | 200 `DeckSummary` (deck detail) | 404 deck not found |
| GET | `/api/decks/{deckId}/entries` | 200 `EntryPage` (query: `limit` 1–500, `offset` ≥ 0) | 404, 422 bad query |
| GET | `/api/decks/{deckId}/entries/{entryId}` | 200 `VocabularyEntry` | 404 entry not found |

### Error schema (all errors)
```json
{ "error": { "code": "deck_not_found", "message": "Deck 'xx' does not exist." } }
```
Codes: `deck_not_found`, `entry_not_found`, `validation_error` (422, FastAPI/pydantic
detail flattened into this shape), `invalid_request`.

### CORS
Configured via env var `CORS_ORIGINS` (comma-separated; `*` allowed; default
`http://localhost:5173,http://127.0.0.1:5173`). `APP_ENV=development|production` only
toggles logging. No other env-required config; backend boots with zero config.

### Deliberately out of scope (this stage)
Authentication, database, ORM, gameplay/progress endpoints, server-side custom-deck
import/export (client owns it), and the React frontend.

## 5. Migration of the existing vocabulary (completed)

The Tkinter app, its four PNG canvas/button assets and the three repo-root vocabulary
files were removed after this migration; they remain in git history and the migrated data
is version-controlled in `backend/app/data/decks/`, guarded by
`backend/tests/test_migration_fidelity.py`.

1. Canonical source `french_words.csv` (101 entries) → built-in deck `fr-en-common`
   ("French → English Common Words"), shipped as `data/decks/fr-en-common.csv` +
   `.meta.json` (the migration ran once via a now-removed one-shot script; its report and
   rules are below).
2. Entry IDs = ASCII slug of the French word (`frère` → `frere`); collisions suffixed.
3. **Documented corrections** (recorded in the migration report and asserted by tests):
   - `Warning` → `warning`, `Wait` → `wait`, `Stop` → `stop`, `Earth` → `earth`
     (capitalization consistency).
   - No translations altered otherwise; no alternative translations invented (the source
     data has none, so `alternatives` starts empty on all 101 entries). Duplicate-target
     pairs (`parle`/`parlé`, `premier`/`première`, ...) are preserved as distinct entries.
4. **Documented exclusions**: `words_to_learn.csv` and `known_words` were progress
   artifacts from the Tkinter app and were intentionally not migrated; progress is
   session-only in the redesign.
5. Second built-in deck `de-ja-starter` (German → Japanese, JSON format) proves
   arbitrary/non-Latin pairs and exercises Unicode validation.

## 6. Frontend (React + TypeScript + Vite) — implemented stages

```
frontend/src/
  api/        typed client (DTO→domain mapping, ApiError with server codes), useAsync
  session/    SessionProvider + useSession (in-memory stats; never persisted)
  storage/    custom decks in localStorage (separate from gameplay progress), import/export
  decks/      client-side custom-deck validation mirroring the backend rules
  game/       rng (seeded), text (NFC/case/whitespace/accents), engine (pure builders),
              modes/ (FlashcardsMode, QuizMode, TypingMode, MatchingMode)
  components/ Button, Panel, Chip, DeckCard, SessionStatsBar, AppShell, states, ...
  pages/      HomePage (deck + language-pair selection), LibraryPage (built-in vs custom,
              import/export/create), PlayPage (deck resolution + mode routing)
  styles/     tokens.css (warm neutrals, restrained accents, editorial type scale)
```

Gameplay decisions: objective quiz/typing scores, flashcard self-assessments and matching
statistics are tracked separately in the session; mode switches preserve them; only
"Restart session" resets. Quiz options exclude the answer's alternatives so each question
has exactly one correct option; duplicate translations are never fabricated. Matching drops
entries whose translation is ambiguous in the deck and reports how many. Typing is
NFC/case/whitespace-insensitive with an explicit ignore-accents toggle. No language is
hardcoded; all labels use the selected deck's language codes.

Checks: `npm run typecheck` (tsc --noEmit), `npm run lint` (eslint), `npm run build`
(tsc + vite), `npm test` (vitest + @testing-library/react).

## 7. Custom decks: creation, editing, import, export

Custom decks are managed entirely in the browser. Nothing is sent to the server,
and gameplay progress is never written to storage (it stays session-only in
`SessionProvider`).

### Management UI

- **Library → New custom deck** (`/editor`): name, description, source/target
  language codes and an entry editor (add / edit / remove rows; alternatives and
  tags are comma-separated).
- **Edit** (`/editor/:deckId`): loads a stored deck; the deck id and existing
  entry ids are preserved when saving (documented id-stability rule).
- **Delete**: requires an explicit confirm step ("Delete" → "Confirm delete").
- **Built-in decks are read-only**: no edit/delete affordances, and requesting
  `/editor/<built-in-id>` is refused with an explanation.

### JSON file format (export → import round-trip)

```json
{
  "version": 1,
  "deck": {
    "id": "custom-spanish-basics",
    "name": "Spanish basics",
    "description": "Everyday words",
    "sourceLanguage": "es",
    "targetLanguage": "en",
    "entryCount": 2
  },
  "entries": [
    { "id": "hola", "source": "hola", "target": "hello", "alternatives": ["hi"], "tags": ["greeting"] }
  ],
  "exportedAt": "2026-01-01T00:00:00.000Z"
}
```

### CSV file format (comment header + table)

```
# deck: Spanish basics
# description: Everyday words
# sourceLanguage: es
# targetLanguage: en
source,target,alternatives,tags
hola,hello,hi,greeting
gracias,"thank you, thanks",,phrase
```

### Validation rules (shared by imports and the editor)

Same rules as built-in decks (docs §3): non-empty source/target, unique entry ids
and (source, target) pairs within a deck, valid language codes, deck id matching
`^[a-z0-9][a-z0-9_-]{0,63}$`, at least one entry, `version: 1`. Additionally:

- an import whose deck id already exists in the browser is rejected (no silent
  overwrite — an existing deck can never be corrupted or replaced by an import);
- an imported file is fully parsed and validated, then **previewed**, and only
  stored after an explicit "Import deck" confirmation;
- `deck.entryCount` in the file is informational — the entry list is authoritative.

### Limitations

- Custom decks live in this browser's `localStorage` only: no sync across
  devices or browsers. Export JSON/CSV for a backup or to move a deck.
- Browser storage is per-origin; clearing site data deletes custom decks.
- CSV imports do not store entry ids — ids are derived from the source text
  (same slugs as backend CSV decks), so a CSV round-trip keeps entries but may
  produce different ids than the original JSON export.
- Editing a deck does not rename its id; deleting and re-creating does.
- There is no merge/dedup between a custom deck and a built-in deck.

## 8. Design system (reference: `frontend/design.png`)

Adapted from the reference styleguide (a technical/neo-brutalist UI kit) without
reproducing its layout. Design DNA extracted:

- **Palette**: cream paper `#F4F0E4` with a subtle dot grid, ivory surfaces
  `#FFFFF0`, primary text `#333333`, secondary `#666666`, hairline `#CCCCCC`,
  component borders `#141414`, calm sky-blue accent `#8BBDE4` (fills,
  selection, focus halo) with a deep blue `#2F6EA5` for text on paper.
- **Borders/elevation**: 2px solid black component outlines; blur-free offset
  shadows (`2/4/6px 0 #141414`); hover lifts, press sinks. No soft shadows,
  no gradients.
- **Geometry**: square by default (radius 0-4px); no pill controls.
- **Typography**: two families — Pixelify Sans (soft pixel face) for main headings
  (`h1`/`h2` and the brand), Space Mono for everything else with Noto Sans Mono
  JP as the Japanese fallback; only three sizes (`--text-heading`,
  `--text-subheading`, `--text-body`); uppercase tracked labels for metadata,
  natural casing and full Unicode for vocabulary words with `overflow-wrap`.
- **States**: hover (lift), active (press), focus-visible (black outline + green
  halo), disabled (dashed border, sunken), selected (green fill), correct
  (green fill / left border), incorrect (brick red, shake).
- **Micro-details used sparingly**: dot-grid page, dashed dividers, mono
  bracket-style labels, chunky square progress bar.

Where it is implemented: `src/styles/tokens.css` (all tokens), `global.css`
(base), `components.css` (shell, buttons, panels, chips, deck cards, game
screens, forms), `motion.css` (3D card flip + feedback keyframes +
prefers-reduced-motion). Vocabulary card: bordered ivory surface, hard shadow,
dotted language label, word at `--text-word`, translation on a green marker
block; flip is CSS-only, reduced motion swaps faces instead of rotating.

Limitations: webfonts load from Google Fonts (offline falls back to system
mono); the flip's back face is absolutely positioned, so an unusually long
translation can extend past the front face's height (reduced-motion mode flows
naturally instead).
