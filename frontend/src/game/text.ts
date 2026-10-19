/**
 * Text normalization and answer matching for the typing mode.
 *
 * Deliberate rules:
 * - NFC normalization: "cafe" + combining acute equals "café" (Unicode-aware).
 * - Casefold and whitespace collapsing: "  HolA  " equals "hola".
 * - Accent handling is a deliberate, opt-in setting (see ignoreAccents).
 * - Typo tolerance uses Damerau-Levenshtein distance to detect minor slips (see typoTolerance).
 * - Alternative translations configured on an entry are accepted answers.
 * - Empty or whitespace-only input is never a valid submission.
 */

import type { VocabularyEntry } from "../api/types";
import {
  alignStrings,
  damerauLevenshtein,
  isTypoMatch,
  similarityScore,
  type AlignmentResult,
  type CharacterHighlight,
} from "./levenshtein";

export {
  alignStrings,
  damerauLevenshtein,
  isTypoMatch,
  similarityScore,
  type AlignmentResult,
  type CharacterHighlight,
};

export type TypoToleranceSetting = boolean | "forgiving" | "strict";

export interface TypingOptions {
  /** When true, diacritics are ignored when comparing answers. */
  ignoreAccents?: boolean;
  /** When true or "forgiving", accepts minor slips based on Damerau-Levenshtein distance. When false or "strict", requires exact match. */
  typoTolerance?: TypoToleranceSetting;
}

export type AnswerVerdict = "exact" | "typo" | "incorrect";

export interface EvaluationResult {
  verdict: AnswerVerdict;
  /** The submitted user answer */
  submittedAnswer: string;
  /** Raw user input (alias for submittedAnswer) */
  input: string;
  /** Best matched candidate translation (primary target or alternative) */
  correctAnswer: string;
  /** Best matched candidate translation (alias for correctAnswer) */
  matchedTarget?: string;
  /** Damerau-Levenshtein distance to the closest candidate */
  editDistance: number;
  /** Alias for editDistance */
  distance: number;
  /** Normalized similarity score (0.0 to 1.0) */
  similarity: number;
  /** List of edit operations from alignment traceback */
  editOperations: AlignmentResult["operations"];
  /** Detailed character alignment, highlighting, and operations */
  alignment?: AlignmentResult;
  /** Short explanation of the typo or error */
  explanation: string;
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

/**
 * Evaluates a user submission against an entry's accepted translations,
 * categorizing it as exact match, typo near-miss, or incorrect.
 */
export function evaluateTranslation(
  input: string,
  entry: VocabularyEntry,
  options: TypingOptions = {},
): EvaluationResult {
  const normalizedInput = normalizeForTyping(input, options);
  if (normalizedInput.length === 0) {
    return {
      verdict: "incorrect",
      submittedAnswer: input,
      input,
      correctAnswer: entry.target,
      matchedTarget: entry.target,
      editDistance: Infinity,
      distance: Infinity,
      similarity: 0,
      editOperations: [],
      explanation: "Empty submission",
    };
  }

  const candidates = [entry.target, ...entry.alternatives];
  let bestCandidate = candidates[0];
  let minDistance = Infinity;
  let maxSimilarity = 0;

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeForTyping(candidate, options);
    if (normalizedInput === normalizedCandidate) {
      const alignment = alignStrings(normalizedInput, normalizedCandidate);
      return {
        verdict: "exact",
        submittedAnswer: input,
        input,
        correctAnswer: candidate,
        matchedTarget: candidate,
        editDistance: 0,
        distance: 0,
        similarity: 1.0,
        editOperations: alignment.operations,
        alignment,
        explanation: "Exact match",
      };
    }

    const dist = damerauLevenshtein(normalizedInput, normalizedCandidate);
    const sim = similarityScore(normalizedInput, normalizedCandidate);
    if (dist < minDistance) {
      minDistance = dist;
      maxSimilarity = sim;
      bestCandidate = candidate;
    }
  }

  const normalizedBest = normalizeForTyping(bestCandidate, options);
  const isForgiving = options.typoTolerance === true || options.typoTolerance === "forgiving";

  // Check if eligible for near-miss typo tolerance
  if (isForgiving) {
    // If strict accents are requested (!ignoreAccents), do not forgive an accent-only error as a typo
    const isAccentOnlyError =
      options.ignoreAccents === false &&
      stripAccents(normalizedInput) === stripAccents(normalizedBest);

    if (!isAccentOnlyError && isTypoMatch(normalizedInput, normalizedBest)) {
      const alignment = alignStrings(normalizedInput, normalizedBest);
      return {
        verdict: "typo",
        submittedAnswer: input,
        input,
        correctAnswer: bestCandidate,
        matchedTarget: bestCandidate,
        editDistance: minDistance,
        distance: minDistance,
        similarity: maxSimilarity,
        editOperations: alignment.operations,
        alignment,
        explanation: alignment.explanation,
      };
    }
  }

  const alignment = alignStrings(normalizedInput, normalizedBest);
  return {
    verdict: "incorrect",
    submittedAnswer: input,
    input,
    correctAnswer: bestCandidate,
    matchedTarget: bestCandidate,
    editDistance: minDistance,
    distance: minDistance,
    similarity: maxSimilarity,
    editOperations: alignment.operations,
    alignment,
    explanation: alignment.explanation,
  };
}

/** True when the input matches the entry's translation (or is accepted with typo tolerance). */
export function matchesTranslation(
  input: string,
  entry: VocabularyEntry,
  options: TypingOptions = {},
): boolean {
  const evaluation = evaluateTranslation(input, entry, options);
  return evaluation.verdict !== "incorrect";
}

/** Every answer accepted for an entry, for feedback display. */
export function acceptedAnswers(entry: VocabularyEntry): string[] {
  return [entry.target, ...entry.alternatives];
}
