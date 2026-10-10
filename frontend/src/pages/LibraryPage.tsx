import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listDecks } from "../api/client";
import { useAsync } from "../api/useAsync";
import { useCustomDecks } from "../storage/useCustomDecks";
import { builtInDeckItem, customDeckItem, playHref } from "../lib/deckItems";
import type { DeckListItem } from "../lib/deckItems";
import { DeckCard } from "../components/DeckCard";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { Spinner } from "../components/Spinner";
import { SegmentedControl } from "../components/SegmentedControl";
import { Button } from "../components/Button";
import { CustomDeckEditor } from "../components/CustomDeckEditor";
import { ImportDeckPanel } from "../components/ImportDeckPanel";
import { downloadDeck, getCustomDeck, toExportDocument } from "../storage/customDecks";

type Tab = "builtin" | "custom";

export function LibraryPage() {
  const builtIn = useAsync((signal) => listDecks(signal), []);
  const custom = useCustomDecks();
  const [tab, setTab] = useState<Tab>("builtin");
  const navigate = useNavigate();

  const customItems: DeckListItem[] = useMemo(
    () => custom.decks.map(customDeckItem),
    [custom.decks],
  );

  return (
    <div className="shell page">
      <header className="stack">
        <p className="label">Deck library</p>
        <h1>Your decks</h1>
        <p className="muted measure">
          Built-in decks come from the vocabulary API and are read-only. Custom decks live in this
          browser only — export them as JSON to keep a portable backup.
        </p>
      </header>

      <SegmentedControl<Tab>
        ariaLabel="Deck origin filter"
        value={tab}
        onChange={setTab}
        options={[
          { value: "builtin", label: `Built-in`, hint: "from the API" },
          { value: "custom", label: `Custom`, hint: "in this browser" },
        ]}
      />

      {tab === "builtin" ? (
        <section className="stack" aria-label="Built-in decks">
          {builtIn.state.status === "loading" ? (
            <Spinner label="Loading built-in decks" />
          ) : builtIn.state.status === "error" ? (
            <ErrorState error={builtIn.state.error} onRetry={builtIn.reload} />
          ) : builtIn.state.data.length === 0 ? (
            <EmptyState
              title="No built-in decks"
              description="The API is up but is not serving any built-in decks."
            />
          ) : (
            <ul className="deck-grid">
              {builtIn.state.data.map((deck) => {
                const item = builtInDeckItem(deck);
                return (
                  <DeckCard
                    key={deck.id}
                    deck={item}
                    selected={false}
                    onSelect={() => navigate(playHref("flashcards", deck.id))}
                  />
                );
              })}
            </ul>
          )}
        </section>
      ) : (
        <section className="stack" aria-label="Custom decks">
          <ImportDeckPanel onImport={custom.importDocument} />

          {customItems.length === 0 ? (
            <EmptyState
              title="No custom decks yet"
              description="Import a JSON deck below, or create one from scratch."
            />
          ) : (
            <ul className="deck-grid">
              {customItems.map((item) => (
                <DeckCard
                  key={item.id}
                  deck={item}
                  selected={false}
                  onSelect={() => navigate(playHref("flashcards", item.id))}
                />
              ))}
            </ul>
          )}

          {customItems.length > 0 ? (
            <ul className="stack custom-deck-actions">
              {customItems.map((item) => {
                const doc = getCustomDeck(item.id);
                return (
                  <li key={item.id} className="row row-space panel panel-inset">
                    <span>
                      {item.name} <span className="faint">· {item.entryCount} entries</span>
                    </span>
                    <span className="row">
                      <Button
                        size="small"
                        variant="secondary"
                        onClick={() => {
                          if (!doc) return;
                          downloadDeck(`${item.id}.json`, toExportDocument(doc));
                        }}
                      >
                        Export
                      </Button>
                      <Button
                        size="small"
                        variant="ghost"
                        onClick={() => custom.remove(item.id)}
                      >
                        Delete
                      </Button>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}

          <CustomDeckEditor onSave={custom.save} existingIds={custom.decks.map((d) => d.id)} />
        </section>
      )}

      <p className="faint">
        Looking for something to study? <Link to="/">Choose a deck on the home screen</Link>.
      </p>
    </div>
  );
}
