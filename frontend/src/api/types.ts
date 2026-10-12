/**
 * Wire types (snake_case, exactly as documented in the API contract) and the
 * domain types the UI consumes (camelCase). Mapping happens in ./client.
 */

export interface VocabularyEntryDto {
  id: string;
  source: string;
  target: string;
  alternatives: string[];
  tags: string[];
}

export interface DeckSummaryDto {
  id: string;
  name: string;
  description: string;
  source_language: string;
  target_language: string;
  entry_count: number;
}

export interface EntryPageDto {
  entries: VocabularyEntryDto[];
  total: number;
  limit: number | null;
  offset: number;
}

export interface DeckListResponseDto {
  decks: DeckSummaryDto[];
  total: number;
}

/* ---------- Domain types ---------- */

export interface VocabularyEntry {
  id: string;
  source: string;
  target: string;
  alternatives: string[];
  tags: string[];
}

export interface DeckSummary {
  id: string;
  name: string;
  description: string;
  sourceLanguage: string;
  targetLanguage: string;
  entryCount: number;
}

export interface EntryPage {
  entries: VocabularyEntry[];
  total: number;
  limit: number | null;
  offset: number;
}

/** A deck ready for play: metadata plus its full vocabulary list. */
export interface PlayableDeck {
  id: string;
  name: string;
  description: string;
  sourceLanguage: string;
  targetLanguage: string;
  entryCount: number;
  entries: VocabularyEntry[];
  origin: "builtin" | "custom";
}

/** Portable backup format for custom decks. */
export interface CustomDeckDocument {
  version: 1;
  deck: {
    id: string;
    name: string;
    description: string;
    sourceLanguage: string;
    targetLanguage: string;
    entryCount: number;
  };
  entries: VocabularyEntry[];
  exportedAt: string;
}

/** Summary of a custom deck as stored in the browser (no entries attached). */
export interface CustomDeckSummary {
  id: string;
  name: string;
  description: string;
  sourceLanguage: string;
  targetLanguage: string;
  entryCount: number;
}
