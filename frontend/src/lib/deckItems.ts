/** Deck list helpers shared by the home screen and the library. */

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
