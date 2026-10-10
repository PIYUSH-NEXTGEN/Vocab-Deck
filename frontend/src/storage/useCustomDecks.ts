/** React binding for custom-deck storage, separate from session progress. */

import { useCallback, useEffect, useState } from "react";
import type { CustomDeckDocument, CustomDeckSummary } from "../api/types";
import {
  deleteCustomDeck,
  listCustomDecks,
  saveCustomDeck,
  subscribeToCustomDecks,
} from "../storage/customDecks";

export interface UseCustomDecks {
  decks: CustomDeckSummary[];
  /** Create or update a deck in place (id decides which). */
  save: (doc: CustomDeckDocument) => void;
  remove: (id: string) => void;
}

export function useCustomDecks(): UseCustomDecks {
  const [decks, setDecks] = useState<CustomDeckSummary[]>(() => listCustomDecks());

  const refresh = useCallback(() => setDecks(listCustomDecks()), []);

  useEffect(() => subscribeToCustomDecks(refresh), [refresh]);

  return {
    decks,
    save: useCallback(
      (doc: CustomDeckDocument) => {
        saveCustomDeck(doc);
        refresh();
      },
      [refresh],
    ),
    remove: useCallback(
      (id: string) => {
        deleteCustomDeck(id);
        refresh();
      },
      [refresh],
    ),
  };
}
