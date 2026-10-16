# Contributing to Vocab Deck

Thanks for your interest in contributing. This guide covers how to propose,
implement, and land changes. For product setup, architecture, and test
commands, the [README](README.md) is the source of truth; this file adds the
contribution process on top of it.

## 1. Project overview

Vocab Deck is a vocabulary practice app: a React + TypeScript + Vite single-page
app backed by a FastAPI vocabulary service. Built-in decks (`en-fr`, `en-de`,
`en-ja`) live as version-controlled files in `backend/app/data/decks/` and are
loaded at backend startup. The frontend owns all game logic (Flashcards, Quiz,
Typing, Matching), session stats, theming, and custom decks in `localStorage`.
There are no accounts, no auth, and no server-side storage by design.

Start with the [README](README.md): Features, How It Works, Architecture
(including the mermaid diagrams), Codebase Structure, Getting Started,
Configuration Reference, Testing, Performance, and Security sections.

## 2. Welcome contributions

- **Bug fixes** in any study mode, deck loading, import/export, or theming.
- **Study modes**: improvements to Flashcards, Quiz, Typing, or Matching.
- **Accessibility**: keyboard support, focus management, screen-reader labels,
  `prefers-reduced-motion` handling, color contrast.
- **UI**: layout, responsive behavior, light/dark theme polish.
- **Vocabulary decks**: new built-in language pairs — open a
  **New language deck proposal** issue first and wait for maintainer guidance.
- **Import/export**: custom-deck formats, validation, error messages.
- **Tests**: backend pytest coverage, frontend Vitest coverage, Playwright E2E.
- **Documentation**: README, code comments, error-message wording.
- **Performance**: bundle size, startup time, rendering efficiency.

Out of scope unless a maintainer explicitly accepts it: user accounts/auth,
server-side progress storage, databases, analytics, or paid services.

## 3. Before you open an issue

1. **Search [existing issues](../../issues)** (open and closed) for the same
   bug, feature, or language pair. Comment on the existing thread instead of
   opening a duplicate.
2. Use the matching issue template: **Bug report**, **Feature request**, or
   **New language deck proposal**. Blank issues are disabled.
3. Never include passwords, API keys, tokens, or personal data in issues,
   logs, or screenshots.
4. For **substantial features** (new study mode, API contract change, new deck
   format, dependency addition), discuss the approach in an issue and get
   maintainer agreement **before** writing code. Unsolicited large PRs may be
   closed.

## 4. Installation and local development

Follow [Getting Started in the README](README.md#getting-started) for
prerequisites (Python 3.11+, Node.js 18+), cloning, backend/frontend install,
configuration (`CORS_ORIGINS`, `VITE_API_TARGET`, `VITE_API_URL`), and running
both servers locally.

Backend test dependencies are not in `requirements.txt`; install the `test`
extra from `backend/pyproject.toml` before running pytest:

```bash
cd backend
pip install -e ".[test]"
```

Frontend dependencies install from the committed lockfile:

```bash
cd frontend
npm ci
```

Playwright browsers are needed only for E2E (one-time setup):

```bash
cd frontend
npx playwright install chromium
```

## 5. Test commands

Run the checks relevant to your change; run all of them before opening a PR.

| Command | Scope |
|---|---|
| `cd backend && python -m pytest` | Backend API, schemas, loader, built-in decks |
| `cd frontend && npm run typecheck` | TypeScript `tsc --noEmit` |
| `cd frontend && npm run lint` | ESLint |
| `cd frontend && npm test` | Vitest unit/component |
| `cd frontend && npm run test:e2e` | Playwright E2E (starts its own backend on port 8010 and preview frontend on 4173 — do not start servers manually) |
| `cd frontend && npm run build` | Production build |

CI (`.github/workflows/ci.yml`) runs these same checks on every pull request
and every push to `main`. Only claim a check passed if you actually ran it.

## 6. Branch naming

Create your work on a fork, on a branch named:

- `feat/<short-description>` — new feature
- `fix/<short-description>` — bug fix
- `docs/<short-description>` — documentation only
- `test/<short-description>` — tests only
- `refactor/<short-description>` — behavior-preserving restructure

Examples: `feat/typing-accent-hint`, `fix/quiz-duplicate-distractor`.

## 7. Code quality expectations

- **Focused changes**: one issue per PR, minimal diff, no unrelated refactors.
- **Minimal dependencies**: do not add a dependency when a small local change
  suffices. Any new backend/frontend dependency must be justified in the PR.
- **Validation**: backend changes must keep Pydantic validation strict
  (fail-fast deck loading); frontend custom-deck handling must validate with
  the same rules as built-in decks.
- **Accessibility**: semantic HTML, keyboard operability, visible focus,
  and respect for `prefers-reduced-motion` (see README Accessibility section).
- **Theming**: use CSS custom properties from `frontend/src/styles/tokens.css`;
  verify light and dark modes.
- **Regression tests**: add or update tests covering the changed behavior
  (pytest, Vitest, or Playwright as appropriate).

## 8. Pull request expectations

The [pull request template](.github/pull_request_template.md) prompts for all
of this — fill it in completely:

- Link the related issue (`Closes #NNN`) for bug fixes and features.
- State the change type (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`,
  `chore:` subjects, matching the repo's conventional-commit history).
- Describe implementation details and trade-offs.
- List the exact test commands you ran and their results.
- Add UI screenshots for visual changes (light and dark mode where relevant).
- Note documentation updates (README/CONTRIBUTING) when behavior changes.
- Describe what existing behavior you re-verified (regression testing).
- Confirm no secrets or unnecessary new network/storage surface.
- Respond to review feedback promptly; keep the PR updated with `main`.

## 9. Maintainer review and acceptance criteria

Maintainers review for: fit with project scope, correctness, test coverage,
accessibility, theme compatibility, security (no secrets, validated input),
and consistency with the existing architecture. A PR is accepted when review
comments are resolved, CI is green, and a maintainer merges it. Reviews are
done by humans on a best-effort basis — please be patient.

## 10. Anti-spam policy

To keep the project usable for everyone:

- Duplicate issues/PRs may be closed and pointed at the original thread.
- PRs unrelated to an issue, outside the stated scope, or generated without
  understanding the codebase may be closed without review.
- Low-effort submissions (empty templates, untested changes, placeholder
  content, mass cosmetic edits across files) will be closed.
- Repeated spam after warnings may lead to a report to GitHub.

Quality over quantity: one thoughtful, tested contribution matters more than
several superficial ones.

## 11. No guarantee of acceptance or credit

Opening an issue or submitting a pull request does **not** guarantee that the
change will be accepted, merged, or credited toward any program (including
NSOC or similar contribution programs). Maintainers decide based on quality,
scope fit, and project needs. Program participation rules are set by the
program organizers, not by this repository.
