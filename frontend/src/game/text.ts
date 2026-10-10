/**
 * Text normalization and answer matching for the typing mode.
 *
 * Deliberate rules:
 * - NFC normalization: "cafe" + combining acute equals "café" (Unicode-aware).
 * - Casefold and whitespace collapsing: "  HolA  " equals "hola".
 * - Accent handling is a deliberate, opt-in setting (see ignoreAccents).
 * - Alternative translations configured on an entry are accepted answers.
 * - Empty or whitespace-only input is never a valid submission.
 */

import type { VocabularyEntry } from "../api/types";

export interface TypingOptions {
  /** When true, diacritics are ignored when comparing answers. */
  ignoreAccents?: boolean;
}

export function normalizeComparable(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function stripAccents(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .normalize("NFC");
}

export function normalizeForTyping(value: string, options: TypingOptions = {}): string {
  const normalized = normalizeComparable(value);
  return options.ignoreAccents ? stripAccents(normalized) : normalized;
}

/** True when the input matches the entry's translation or one of its alternatives. */
export function matchesTranslation(
  input: string,
  entry: VocabularyEntry,
  options: TypingOptions = {},
): boolean {
  const answer = normalizeForTyping(input, options);
  if (answer.length === 0) return false;
  const accepted = [entry.target, ...entry.alternatives].map((candidate) =>
    normalizeForTyping(candidate, options),
  );
  return accepted.includes(answer);
}

/** Every answer accepted for an entry, for feedback display. */
export function acceptedAnswers(entry: VocabularyEntry): string[] {
  return [entry.target, ...entry.alternatives];
}
