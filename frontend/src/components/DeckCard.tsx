import type { DeckListItem } from "../lib/deckItems";
import { Panel } from "./Panel";
import { Chip } from "./Chip";
import { languagePairLabel } from "../lang/display";

export function DeckCard({
  deck,
  selected = false,
  readOnly = false,
  onSelect,
}: {
  deck: DeckListItem;
  selected?: boolean;
  readOnly?: boolean;
  onSelect?: (deck: DeckListItem) => void;
}) {
  return (
    <Panel
      as="li"
      className={`deck-card${selected ? " is-selected" : ""}`}
      aria-current={selected ? "true" : undefined}
    >
      <div className="stack-tight">
        <div className="row row-space">
          <h3 className="deck-title">{deck.name}</h3>
          <Chip tone={deck.origin === "builtin" ? "neutral" : "accent"}>
            {deck.origin === "builtin" ? "Built-in" : "Custom"}
          </Chip>
        </div>
        <p className="faint">{languagePairLabel(deck.sourceLanguage, deck.targetLanguage)}</p>
        {deck.description ? <p className="muted deck-description">{deck.description}</p> : null}
      </div>
      <div className="row row-space deck-meta">
        <span className="label">{deck.entryCount} entries</span>
        <span className="row">
          {readOnly ? <Chip>Read-only</Chip> : null}
          {onSelect ? (
            <button
              type="button"
              className="link-button"
              onClick={() => onSelect(deck)}
              aria-pressed={selected}
            >
              {selected ? "Selected" : "Select deck"}
            </button>
          ) : null}
        </span>
      </div>
    </Panel>
  );
}
