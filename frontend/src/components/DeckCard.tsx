import { languagePairLabel } from "../lang/display";
import { Chip } from "./Chip";
import type { DeckListItem } from "../lib/deckItems";

/**
 * Deck card: the entire surface is the control, so clicking anywhere on the
 * card opens/selects the deck. Selection state is exposed with aria-pressed.
 */
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
    <li className="deck-card-item">
      <button
        type="button"
        className={`deck-card panel${selected ? " is-selected" : ""}`}
        aria-pressed={onSelect ? selected : undefined}
        aria-label={`${selected ? "Deselect" : "Select"} deck ${deck.name}`}
        onClick={() => onSelect?.(deck)}
      >
        <span className="stack-tight deck-card-body">
          <span className="row row-space">
            <span className="deck-title">{deck.name}</span>
            <Chip tone={deck.origin === "builtin" ? "neutral" : "accent"}>
              {deck.origin === "builtin" ? "Built-in" : "Custom"}
            </Chip>
          </span>
          <span className="faint">{languagePairLabel(deck.sourceLanguage, deck.targetLanguage)}</span>
          {deck.description ? (
            <span className="muted deck-description">{deck.description}</span>
          ) : null}
        </span>
        <span className="row row-space deck-meta">
          <span className="label">{deck.entryCount} entries</span>
          <span className="row">
            {readOnly ? <Chip>Read-only</Chip> : null}
            {selected ? <Chip tone="accent">Selected</Chip> : null}
          </span>
        </span>
      </button>
    </li>
  );
}
