/** React binding for custom-deck storage, separate from session progress. */

import { useCallback, useEffect, useState } from "react";
import type { CustomDeckSummary } from "../api/types";
import {
  deleteCustomDeck,
  listCustomDecks,
  saveCustomDeck,
  subscribeToCustomDecks,
} from "../storage/customDecks";
import type { CustomDeckDocument } from "../api/types";
import { validateCustomDeck } from "../decks/validate";

export interface UseCustomDecks {
  decks: CustomDeckSummary[];
  importDocument: (raw: unknown) => { ok: true } | { ok: false; errors: string[] };
  remove: (id: string) => void;
  save: (doc: CustomDeckDocument) => void;
}

export function useCustomDecks(): UseCustomDecks {
  const [decks, setDecks] = useState<CustomDeckSummary[]>(() => listCustomDecks());

  const refresh = useCallback(() => setDecks(listCustomDecks()), []);

  useEffect(() => subscribeToCustomDecks(refresh), [refresh]);

  return {
    decks,
    importDocument: useCallback((raw: unknown) => {
      const result = validateCustomDeck(raw);
      if (!result.ok) return { ok: false as const, errors: result.errors };
      saveCustomDeck(result.deck);
      refresh();
      return { ok: true as const };
    }, [refresh]),
    remove: useCallback(
      (id: string) => {
        deleteCustomDeck(id);
        refresh();
      },
      [refresh],
    ),
    save: useCallback(
      (doc: CustomDeckDocument) => {
        saveCustomDeck(doc);
        refresh();
      },
      [refresh],
    ),
  };
}
