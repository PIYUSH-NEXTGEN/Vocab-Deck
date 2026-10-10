import { useMemo, useState } from "react";
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

const ALL_PAIRS = "all";

export function HomePage() {
  const builtIn = useAsync((signal) => listDecks(signal), []);
  const custom = useCustomDecks();
  const [pairFilter, setPairFilter] = useState<string>(ALL_PAIRS);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);

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

  return (
    <div className="shell page">
      <header className="home-intro stack">
        <p className="label">Vocabulary practice</p>
        <h1>Study a deck, your way.</h1>
        <p className="muted measure">
          Pick a built-in deck or one of your own, choose a language pair, then train with
          flashcards, a multiple-choice quiz, typing, or matching. Progress during a session is
          remembered in this tab only.
        </p>
      </header>

      <section className="stack" aria-labelledby="deck-selection-heading">
        <div className="row row-space">
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
        <section className="stack mode-selection" aria-labelledby="mode-selection-heading">
          <div className="stack-tight">
            <h2 id="mode-selection-heading">Practice {selected.name}</h2>
            <p className="faint row">
              <LanguageChip code={selected.sourceLanguage} />
              <span aria-hidden="true">→</span>
              <LanguageChip code={selected.targetLanguage} />
              <span>· {selected.entryCount} entries</span>
            </p>
          </div>
          <ul className="mode-grid">
            {GAME_MODES.map((mode) => (
              <li key={mode.id}>
                <Link className="mode-card" to={playHref(mode.id, selected.id)}>
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
