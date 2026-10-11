import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { GAME_MODES } from "../game/modes";
import { listDecks } from "../api/client";
import { useAsync } from "../api/useAsync";
import { useCustomDecks } from "../storage/useCustomDecks";
import { builtInDeckItem, customDeckItem, distinctLanguagePairs, playHref } from "../lib/deckItems";
import type { DeckListItem } from "../lib/deckItems";
import { DeckCard } from "../components/DeckCard";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { Spinner } from "../components/Spinner";
import { LanguageChip } from "../components/Chip";
import { languagePairLabel } from "../lang/display";
import { useReducedMotion } from "../lib/motion";

const ALL_PAIRS = "all";

/** Space kept between the sticky header and the scrolled-to section. */
const SCROLL_CLEARANCE = 24;

/**
 * Bring the expanded practice section into view once it has rendered. Runs only
 * when the selected deck actually changes, and respects reduced motion.
 */
function scrollPracticeSectionIntoView(section: HTMLElement | null, reducedMotion: boolean): void {
  if (!section || typeof window.scrollTo !== "function") return;
  const header = document.querySelector(".app-header");
  const headerHeight = header?.getBoundingClientRect().height ?? 0;
  const top =
    section.getBoundingClientRect().top + window.scrollY - headerHeight - SCROLL_CLEARANCE;
  window.scrollTo({ top: Math.max(top, 0), behavior: reducedMotion ? "auto" : "smooth" });
}

export function HomePage() {
  const builtIn = useAsync((signal) => listDecks(signal), []);
  const custom = useCustomDecks();
  const [pairFilter, setPairFilter] = useState<string>(ALL_PAIRS);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [reversed, setReversed] = useState(false);
  const practiceRef = useRef<HTMLElement | null>(null);
  const scrolledForId = useRef<string | null>(null);
  const reducedMotion = useReducedMotion();

  const decks: DeckListItem[] = useMemo(() => {
    const items: DeckListItem[] = [];
    if (builtIn.state.status === "success") {
      items.push(...builtIn.state.data.map(builtInDeckItem));
    }
    items.push(...custom.decks.map(customDeckItem));
    return items;
  }, [builtIn.state, custom.decks]);

  const pairs = useMemo(() => distinctLanguagePairs(decks), [decks]);
  const visible = decks.filter(
    (deck) =>
      pairFilter === ALL_PAIRS || `${deck.sourceLanguage}->${deck.targetLanguage}` === pairFilter,
  );
  const selected = decks.find((deck) => deck.id === selectedDeckId) ?? null;

  // Scroll to the expanded section only when a (new) deck is selected — never on
  // unrelated re-renders, and never when the selection is cleared.
  useEffect(() => {
    if (!selected) {
      scrolledForId.current = null;
      return;
    }
    if (scrolledForId.current === selected.id) return;
    scrolledForId.current = selected.id;
    scrollPracticeSectionIntoView(practiceRef.current, reducedMotion);
  }, [selected, reducedMotion]);

  return (
    <div className="shell page">
      <header className="hero stack">
        <h1 className="hero-title">Vocab Deck</h1>
        <p className="muted hero-description">
          Practice any language pair with flashcards, quizzes, typing and matching.
          Built-in decks come from the API; your own stay in this browser.
        </p>
      </header>

      <hr className="rule" />

      <section className="section" id="decks" aria-labelledby="deck-selection-heading">
        <div className="section-head">
          <h2 id="deck-selection-heading">Choose a deck</h2>
          <label className="row pair-filter">
            <span className="label">Language pair</span>
            <select
              value={pairFilter}
              onChange={(event) => setPairFilter(event.target.value)}
              aria-label="Filter decks by language pair"
            >
              <option value={ALL_PAIRS}>All pairs</option>
              {pairs.map((pair) => {
                const [source, target] = pair.split("->");
                return (
                  <option key={pair} value={pair}>
                    {languagePairLabel(source, target)}
                  </option>
                );
              })}
            </select>
          </label>
        </div>

        {builtIn.state.status === "loading" && decks.length === 0 ? (
          <Spinner label="Loading built-in decks" />
        ) : builtIn.state.status === "error" && decks.length === 0 ? (
          <ErrorState error={builtIn.state.error} onRetry={builtIn.reload} />
        ) : visible.length === 0 ? (
          <EmptyState
            title="No decks for this language pair"
            description="Import a deck in the library, or choose a different language pair."
            action={
              <Link className="link-button" to="/library">
                Open deck library
              </Link>
            }
          />
        ) : (
          <ul className="deck-grid">
            {visible.map((deck) => (
              <DeckCard
                key={`${deck.origin}:${deck.id}`}
                deck={deck}
                selected={deck.id === selectedDeckId}
                onSelect={(item) =>
                  setSelectedDeckId((current) => (current === item.id ? null : item.id))
                }
              />
            ))}
          </ul>
        )}
      </section>

      {selected ? (
        <section
          className="practice-panel"
          id="modes"
          aria-labelledby="mode-selection-heading"
          ref={practiceRef}
          tabIndex={-1}
        >
          <header className="practice-head">
            <div className="stack-tight">
              <p className="label">Practice mode</p>
              <h2 id="mode-selection-heading">Practice {selected.name}</h2>
            </div>
            <p className="faint row practice-meta">
              {reversed ? (
                <>
                  <LanguageChip code={selected.targetLanguage} />
                  <span aria-hidden="true">→</span>
                  <LanguageChip code={selected.sourceLanguage} />
                </>
              ) : (
                <>
                  <LanguageChip code={selected.sourceLanguage} />
                  <span aria-hidden="true">→</span>
                  <LanguageChip code={selected.targetLanguage} />
                </>
              )}
              <span className="section-note">· {selected.entryCount} entries</span>
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
            </p>
          </header>

          <p className="muted practice-intro">
            Pick how you want to study this deck. Each mode works with any language
            pair, and your session progress appears next to the results as you play.
          </p>

          <ul className="mode-grid">
            {GAME_MODES.map((mode) => (
              <li key={mode.id}>
                <Link
                  className="mode-card"
                  to={`${playHref(mode.id, selected.id)}${reversed ? "?dir=reverse" : ""}`}
                >
                  <span className="mode-name">{mode.label}</span>
                  <span className="muted mode-blurb">{mode.blurb}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
