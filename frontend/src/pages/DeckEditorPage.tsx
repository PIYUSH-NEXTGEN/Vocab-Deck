import { useNavigate, useParams } from "react-router-dom";
import { listDecks } from "../api/client";
import { useAsync } from "../api/useAsync";
import { getCustomDeck } from "../storage/customDecks";
import { useCustomDecks } from "../storage/useCustomDecks";
import { CustomDeckEditor } from "../components/CustomDeckEditor";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { Spinner } from "../components/Spinner";

/**
 * Create (/editor) or edit (/editor/:deckId) a custom deck. Built-in deck ids
 * are refused here: built-ins are served read-only from the API and can never
 * be edited or deleted.
 */
export function DeckEditorPage() {
  const { deckId } = useParams();
  const navigate = useNavigate();
  const custom = useCustomDecks();
  const builtIn = useAsync((signal) => listDecks(signal), [], { enabled: Boolean(deckId) });
  const existing = deckId ? getCustomDeck(deckId) : null;

  const editorProps = {
    existingIds: custom.decks.map((deck) => deck.id),
    onSave: custom.save,
    // Returning to the library should show the custom tab where the deck lives.
    onDone: () => navigate("/library", { state: { tab: "custom" } }),
  };

  if (!deckId) {
    return (
      <div className="shell page">
        <header className="stack-tight">
          <button type="button" className="link-button play-back" onClick={() => navigate("/library")}>
            ← Deck library
          </button>
          <h1>New custom deck</h1>
          <p className="muted measure">
            Name your deck, pick its language pair, then add entries. It is stored in this
            browser only.
          </p>
        </header>
        <CustomDeckEditor {...editorProps} />
      </div>
    );
  }

  if (existing) {
    return (
      <div className="shell page">
        <header className="stack-tight">
          <button type="button" className="link-button play-back" onClick={() => navigate("/library")}>
            ← Deck library
          </button>
          <h1>Edit deck</h1>
          <p className="muted measure">
            Changes are saved to this browser. The deck id and entry ids are preserved.
          </p>
        </header>
        <CustomDeckEditor deck={existing} {...editorProps} />
      </div>
    );
  }

  if (builtIn.state.status === "loading") {
    return (
      <div className="shell page">
        <Spinner label="Loading deck" />
      </div>
    );
  }
  if (builtIn.state.status === "error") {
    return (
      <div className="shell page">
        <ErrorState error={builtIn.state.error} onRetry={builtIn.reload} />
      </div>
    );
  }
  if (builtIn.state.data.some((deck) => deck.id === deckId)) {
    return (
      <div className="shell page">
        <EmptyState
          title="Built-in decks are read-only"
          description="Built-in decks come from the vocabulary API and cannot be edited or deleted. You can import a JSON export and create your own editable copy instead."
          action={
            <button type="button" className="link-button" onClick={() => navigate("/library")}>
              Back to the library
            </button>
          }
        />
      </div>
    );
  }
  return (
    <div className="shell page">
      <EmptyState
        title="Deck not found"
        description={`No custom deck with id "${deckId}" exists in this browser.`}
        action={
          <button type="button" className="link-button" onClick={() => navigate("/library")}>
            Back to the library
          </button>
        }
      />
    </div>
  );
}
