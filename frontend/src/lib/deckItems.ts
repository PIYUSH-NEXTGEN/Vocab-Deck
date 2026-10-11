/** Deck list helpers shared by the home screen and the library. */

import type { PlayableDeck } from "../api/types";
import { languageName } from "../lang/display";

export interface DeckListItem {
  id: string;
  name: string;
  description: string;
  sourceLanguage: string;
  targetLanguage: string;
  entryCount: number;
  origin: "builtin" | "custom";
}

export function builtInDeckItem(deck: Omit<DeckListItem, "origin">): DeckListItem {
  return { ...deck, origin: "builtin" };
}

export function customDeckItem(deck: Omit<DeckListItem, "origin">): DeckListItem {
  return { ...deck, origin: "custom" };
}

export function playHref(modeId: string, deckId: string): string {
  return `/play/${modeId}/${encodeURIComponent(deckId)}`;
}

/** Distinct source→target language pairs, preserving first-seen order. */
export function distinctLanguagePairs(decks: DeckListItem[]): string[] {
  const seen = new Set<string>();
  const pairs: string[] = [];
  for (const deck of decks) {
    const key = `${deck.sourceLanguage}->${deck.targetLanguage}`;
    if (!seen.has(key)) {
      seen.add(key);
      pairs.push(key);
    }
  }
  return pairs;
}

/**
 * Flip a deck's study direction (German→English becomes English→German).
 *
 * Entry ids stay stable and texts swap sides. Alternative translations are
 * dropped: they are answers for the original target, so keeping them would
 * accept wrong answers once the direction is reversed. The description has its
 * language names swapped so it keeps describing the deck being studied.
 */
export function reverseDeck(deck: PlayableDeck): PlayableDeck {
  return {
    ...deck,
    sourceLanguage: deck.targetLanguage,
    targetLanguage: deck.sourceLanguage,
    description: swapLanguageNames(
      deck.description,
      languageName(deck.sourceLanguage),
      languageName(deck.targetLanguage),
    ),
    entries: deck.entries.map((entry) => ({
      ...entry,
      source: entry.target,
      target: entry.source,
      alternatives: [],
    })),
  };
}

/** Swap every occurrence of two language names inside a text. */
function swapLanguageNames(text: string, nameA: string, nameB: string): string {
  if (!text || !nameA || !nameB || nameA === nameB) return text;
  const placeholder = "\u0000";
  return text
    .split(nameB)
    .join(placeholder)
    .split(nameA)
    .join(nameB)
    .split(placeholder)
    .join(nameA);
}
