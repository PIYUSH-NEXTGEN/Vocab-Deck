import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { listDecks } from "../api/client";
import { useAsync } from "../api/useAsync";
import { useCustomDecks } from "../storage/useCustomDecks";
import { builtInDeckItem, customDeckItem, playHref } from "../lib/deckItems";
import type { DeckListItem } from "../lib/deckItems";
import { Button } from "../components/Button";
import { DeckCard } from "../components/DeckCard";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { ImportDeckPanel } from "../components/ImportDeckPanel";
import { SegmentedControl } from "../components/SegmentedControl";
import { Spinner } from "../components/Spinner";
import { downloadDeck, getCustomDeck, toExportDocument } from "../storage/customDecks";
import { deckToCsv } from "../decks/csvFormat";

type Tab = "builtin" | "custom";

export function LibraryPage() {
  const builtIn = useAsync((signal) => listDecks(signal), []);
  const custom = useCustomDecks();
  const location = useLocation();
  const [tab, setTab] = useState<Tab>(
    () => (location.state as { tab?: Tab } | null)?.tab ?? "builtin",
  );
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
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
          Built-in decks come from the vocabulary API and are read-only. Custom decks live
          in this browser only — export them as JSON or CSV to keep a portable backup.
        </p>
        <div className="row">
          <Button variant="primary" onClick={() => navigate("/editor")}>
            New custom deck
          </Button>
        </div>
      </header>

      <SegmentedControl<Tab>
        ariaLabel="Deck origin filter"
        value={tab}
        onChange={setTab}
        options={[
          { value: "builtin", label: "Built-in", hint: "from the API" },
          { value: "custom", label: "Custom", hint: "in this browser" },
        ]}
      />

      {tab === "builtin" ? (
        <section className="section" aria-label="Built-in decks">
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
              {builtIn.state.data.map((deck) => (
                <DeckCard
                  key={deck.id}
                  deck={builtInDeckItem(deck)}
                  readOnly
                  onSelect={() => navigate(playHref("flashcards", deck.id))}
                />
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section className="section" aria-label="Custom decks">
          <ImportDeckPanel
            existingIds={custom.decks.map((deck) => deck.id)}
            onImported={custom.save}
          />

          {customItems.length === 0 ? (
            <EmptyState
              title="No custom decks yet"
              description="Create a deck above, or import one from a JSON or CSV file."
            />
          ) : (
            <>
              <ul className="deck-grid">
                {customItems.map((item) => (
                  <DeckCard
                    key={item.id}
                    deck={item}
                    onSelect={() => navigate(playHref("flashcards", item.id))}
                  />
                ))}
              </ul>

              <div className="stack-tight">
                <h2 className="manage-heading">Manage decks</h2>
                <ul className="manage-list">
                  {customItems.map((item) => {
                    const doc = getCustomDeck(item.id);
                    return (
                      <li key={item.id} className="deck-action-row">
                        <span className="manage-name">
                          {item.name}{" "}
                          <span className="faint">
                            · {item.entryCount} entries ·{" "}
                            {item.sourceLanguage} → {item.targetLanguage}
                          </span>
                        </span>
                        <span className="row">
                          <Button size="small" onClick={() => navigate(`/editor/${item.id}`)}>
                            Edit
                          </Button>
                          <Button
                            size="small"
                            variant="secondary"
                            onClick={() =>
                              doc && downloadDeck(`${item.id}.json`, toExportDocument(doc))
                            }
                          >
                            Export JSON
                          </Button>
                          <Button
                            size="small"
                            variant="secondary"
                            onClick={() => doc && downloadDeck(`${item.id}.csv`, deckToCsv(doc))}
                          >
                            Export CSV
                          </Button>
                          {pendingDelete === item.id ? (
                            <>
                              <Button
                                size="small"
                                variant="primary"
                                onClick={() => {
                                  custom.remove(item.id);
                                  setPendingDelete(null);
                                }}
                              >
                                Confirm delete
                              </Button>
                              <Button
                                size="small"
                                variant="ghost"
                                onClick={() => setPendingDelete(null)}
                              >
                                Keep
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="small"
                              variant="ghost"
                              onClick={() => setPendingDelete(item.id)}
                            >
                              Delete
                            </Button>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </>
          )}
        </section>
      )}

      <p className="faint">
        Looking for something to study? <Link to="/">Choose a deck on the home screen</Link>.
      </p>
    </div>
  );
}
