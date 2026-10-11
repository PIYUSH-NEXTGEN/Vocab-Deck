/** React binding for custom-deck storage, separate from session progress. */

import { useCallback, useEffect, useState } from "react";
import type { CustomDeckDocument, CustomDeckSummary } from "../api/types";
import {
  deleteCustomDeck,
  duplicateCustomDeck,
  listCustomDecks,
  renameCustomDeck,
  saveCustomDeck,
  subscribeToCustomDecks,
  type RenameResult,
} from "../storage/customDecks";

export interface UseCustomDecks {
  decks: CustomDeckSummary[];
  /** Create or update a deck in place (id decides which). */
  save: (doc: CustomDeckDocument) => void;
  /** Copy a deck; returns the new deck or null when the id is unknown. */
  duplicate: (id: string) => CustomDeckDocument | null;
  rename: (id: string, name: string) => RenameResult;
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
    duplicate: useCallback(
      (id: string) => {
        const copy = duplicateCustomDeck(id);
        if (copy) refresh();
        return copy;
      },
      [refresh],
    ),
    rename: useCallback(
      (id: string, name: string) => {
        const result = renameCustomDeck(id, name);
        if (result.ok) refresh();
        return result;
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
