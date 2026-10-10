/**
 * Custom-deck storage in the browser. Deliberately separate from gameplay
 * progress: session stats live only in memory (SessionContext), while custom
 * decks persist in localStorage so they survive reloads and can be exported as
 * a portable backup. Nothing is ever written to the server.
 */

import type { CustomDeckDocument, CustomDeckSummary } from "../api/types";
import { validateCustomDeck } from "../decks/validate";

const STORAGE_KEY = "flash-card-game.customDecks.v1";

type Listener = () => void;
const listeners = new Set<Listener>();

function safeParse(raw: string | null): CustomDeckDocument[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid: CustomDeckDocument[] = [];
    for (const item of parsed) {
      const result = validateCustomDeck(item);
      if (result.ok) valid.push(result.deck);
    }
    return valid;
  } catch {
    return [];
  }
}

function readAll(): CustomDeckDocument[] {
  try {
    return safeParse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

function writeAll(decks: CustomDeckDocument[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(decks));
  } catch {
    // Storage full or unavailable: keep the in-memory session working anyway.
  }
  listeners.forEach((listener) => listener());
}

export function listCustomDecks(): CustomDeckSummary[] {
  return readAll().map((doc) => ({ ...doc.deck }));
}

export function getCustomDeck(id: string): CustomDeckDocument | null {
  return readAll().find((doc) => doc.deck.id === id) ?? null;
}

export function saveCustomDeck(doc: CustomDeckDocument): void {
  const decks = readAll().filter((existing) => existing.deck.id !== doc.deck.id);
  decks.push(doc);
  writeAll(decks);
}

export function deleteCustomDeck(id: string): void {
  writeAll(readAll().filter((doc) => doc.deck.id !== id));
}

/** Portable backup document for a deck (created from a parsed custom deck). */
export function toExportDocument(doc: CustomDeckDocument): string {
  return JSON.stringify(doc, null, 2);
}

export function downloadDeck(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Subscribe to changes (e.g. imports performed in another tab). */
export function subscribeToCustomDecks(listener: Listener): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}
