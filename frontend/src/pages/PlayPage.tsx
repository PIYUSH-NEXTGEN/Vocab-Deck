import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useSession } from "../session/useSession";
import { getDeck, getEntries } from "../api/client";
import type { PlayableDeck } from "../api/types";
import { useAsync } from "../api/useAsync";
import { getCustomDeck } from "../storage/customDecks";
import { toPlayableDeck } from "../decks/validate";
import { GAME_MODES, isGameModeId } from "../game/modes";
import { playHref, reverseDeck } from "../lib/deckItems";
import { FlashcardsMode } from "../game/modes/FlashcardsMode";
import { QuizMode } from "../game/modes/QuizMode";
import { TypingMode } from "../game/modes/TypingMode";
import { MatchingMode } from "../game/modes/MatchingMode";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { SessionStatsBar } from "../components/SessionStatsBar";
import { Spinner } from "../components/Spinner";
import { LanguageChip } from "../components/Chip";

/**
 * Play screen. Resolves the selected deck: custom decks come from browser
 * storage, built-in decks from the API, and renders the active game mode.
 * All gameplay progress lives in the session context (memory only).
 */
export function PlayPage() {
  const { modeId, deckId } = useParams();
  const [searchParams] = useSearchParams();
  // Deck ids are URL-safe (`[a-z0-9_-]`), and react-router already decodes
  // route params: decoding again would throw on malformed input (no error
  // boundary) and corrupt ids containing a literal `%`.
  const deckIdParam = deckId ?? "";
  const mode = modeId && isGameModeId(modeId) ? modeId : null;
  const [reversed, setReversed] = useState(searchParams.get("dir") === "reverse");
  const { epoch } = useSession();

  const customDeck = useMemo(
    () => (deckIdParam && mode ? getCustomDeck(deckIdParam) : null),
    [deckIdParam, mode],
  );

  const builtIn = useAsync<PlayableDeck>(
    async (signal) => {
      // Independent requests: one round trip instead of two sequential ones.
      const [summary, page] = await Promise.all([
        getDeck(deckIdParam, signal),
        getEntries(deckIdParam, {}, signal),
      ]);
      return { ...summary, entries: page.entries, origin: "builtin" as const };
    },
    [deckIdParam, mode !== null],
    { enabled: customDeck === null && mode !== null && deckIdParam.length > 0 },
  );

  // The resolved deck must keep a stable `entries` reference across re-renders:
  // every answer records session stats, which re-renders this page, and the
  // game modes rebuild their round whenever `deck.entries` changes identity.
  // Without memoization, `reverseDeck`/`toPlayableDeck` below allocate a fresh
  // array on each render, so submitting an answer reshuffles the current
  // question (and marks it wrong) whenever study direction is reversed.
  const resolvedDeck: PlayableDeck | null = useMemo(
    () =>
      customDeck !== null
        ? toPlayableDeck(customDeck)
        : builtIn.state.status === "success"
          ? builtIn.state.data
          : null,
    [customDeck, builtIn.state],
  );
  // Study direction is a session-level toggle on top of the resolved deck.
  const deck = useMemo(
    () => (resolvedDeck && reversed ? reverseDeck(resolvedDeck) : resolvedDeck),
    [resolvedDeck, reversed],
  );

  if (mode === null) {
    return (
      <div className="shell page">
        <EmptyState
          title="Unknown game mode"
          description={`"${modeId ?? ""}" is not one of the four practice modes.`}
          action={
            <Link className="link-button" to="/">
              Choose a deck
            </Link>
          }
        />
      </div>
    );
  }

  if (!deckIdParam) {
    return (
      <div className="shell page">
        <EmptyState title="No deck selected" action={<Link className="link-button" to="/">Choose a deck</Link>} />
      </div>
    );
  }

  let body: React.ReactNode;
  if (deck === null) {
    body =
      builtIn.state.status === "error" ? (
        <ErrorState error={builtIn.state.error} onRetry={builtIn.reload} />
      ) : (
        <Spinner label="Loading deck" />
      );
  } else if (deck.entries.length === 0) {
    body = <EmptyState title="This deck has no entries yet" />;
  } else {
    const ModeComponent =
      mode === "flashcards"
        ? FlashcardsMode
        : mode === "quiz"
          ? QuizMode
          : mode === "typing"
            ? TypingMode
            : MatchingMode;
    // Keyed on the session epoch so "Restart session" also restarts the round.
    body = <ModeComponent key={epoch} deck={deck} />;
  }

  return (
    <div className="shell page">
      <header className="stack-tight">
        <Link className="link-button play-back" to="/">
          ← All decks
        </Link>
        <div className="row row-space play-title-row">
          <h1>{deck ? deck.name : "Loading deck"}</h1>
          {deck ? (
            <span className="row play-meta">
              <LanguageChip code={deck.sourceLanguage} />
              <span aria-hidden="true">→</span>
              <LanguageChip code={deck.targetLanguage} />
              <button
                type="button"
                className="swap-button"
                aria-label="Reverse study direction"
                aria-pressed={reversed}
                title="Reverse study direction"
                onClick={() => setReversed((value) => !value)}
              >
                <span aria-hidden="true">⇄</span>
              </button>
            </span>
          ) : null}
        </div>
        {deck ? (
          <p className="faint play-meta-note">
            {deck.origin === "custom" ? "custom deck" : "built-in deck"}
          </p>
        ) : null}
        {deck?.description ? <p className="muted play-description">{deck.description}</p> : null}
      </header>

      <nav className="mode-nav" aria-label="Practice modes">
        {GAME_MODES.map((item) => (
          <Link
            key={item.id}
            to={playHref(item.id, deckIdParam)}
            className={`mode-link${item.id === mode ? " is-active" : ""}`}
            aria-current={item.id === mode ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="practice-column">{body}</div>

      <section className="session-summary stack-tight" aria-label="Session summary">
        <span className="label">Session summary</span>
        <SessionStatsBar />
      </section>
    </div>
  );
}
