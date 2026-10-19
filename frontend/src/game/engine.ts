/**
 * Shared game engine: pure, language-agnostic setup builders for every mode.
 *
 * Rules enforced here:
 * - Vocabulary is never invented or padded to fill a board or a quiz.
 * - Multiple-choice options are distinct strings and exclude the answer's
 *   alternatives, so every question has exactly one correct option.
 * - Matching boards drop entries whose translation is ambiguous (appears in
 *   more than one entry of the same deck) and report how many were excluded.
 * - Small decks produce small-but-valid setups; impossible setups produce
 *   empty results the UI explains instead of fabricating content.
 * - Spaced repetition and mistake reviews prioritize low-retention vocabulary
 *   while maintaining deterministic shuffling via the provided RNG.
 */

import type { VocabularyEntry } from "../api/types";
import { createRng, shuffle, type Rng } from "./rng";

export const MAX_QUIZ_ROUNDS = 50;
export const MAX_MATCH_PAIRS = 50;

/* ---------- Flashcards ---------- */

export function buildFlashcardOrder(entries: readonly VocabularyEntry[], rng: Rng): VocabularyEntry[] {
  return shuffle(entries, rng);
}

/* ---------- Leitner Spaced Repetition & Mistake Queue ---------- */

export type LeitnerBox = 0 | 1 | 2 | 3;

export interface RetentionRecord {
  /**
   * Leitner box (0 to 3).
   * Box 0: Unlearned / Needs Immediate Practice.
   * Box 1: Learning (1 consecutive correct).
   * Box 2: Review (2 consecutive correct).
   * Box 3: Mastered (3+ consecutive correct).
   */
  box: LeitnerBox;
  consecutiveCorrect: number;
  totalAttempts: number;
  lastAttemptCorrect: boolean;
}

/**
 * Pure state transition function for the Leitner spaced repetition model.
 * Correct answers advance the entry up to Box 3.
 * Incorrect answers reset the entry back to Box 0 for immediate reinforcement.
 */
export function updateRetention(
  current: RetentionRecord | undefined,
  correct: boolean,
): RetentionRecord {
  const totalAttempts = (current?.totalAttempts ?? 0) + 1;
  if (correct) {
    const consecutiveCorrect = (current?.consecutiveCorrect ?? 0) + 1;
    const box = Math.min(3, (current?.box ?? 0) + 1) as LeitnerBox;
    return {
      box,
      consecutiveCorrect,
      totalAttempts,
      lastAttemptCorrect: true,
    };
  }
  return {
    box: 0,
    consecutiveCorrect: 0,
    totalAttempts,
    lastAttemptCorrect: false,
  };
}

/**
 * Builds an adaptive study order where vocabulary with low retention (Box 0)
 * is prioritized ahead of well-memorized words (Box 3), while shuffling
 * within each box tier using the provided RNG to maintain variety.
 * Never pads or fabricates entries.
 */
export function buildAdaptiveFlashcardOrder(
  entries: readonly VocabularyEntry[],
  retentionMap: ReadonlyMap<string, RetentionRecord>,
  rng: Rng,
): VocabularyEntry[] {
  const boxes: Record<LeitnerBox, VocabularyEntry[]> = {
    0: [],
    1: [],
    2: [],
    3: [],
  };

  for (const entry of entries) {
    const record = retentionMap.get(entry.id);
    const box = record?.box ?? 0;
    boxes[box].push(entry);
  }

  return [
    ...shuffle(boxes[0], rng),
    ...shuffle(boxes[1], rng),
    ...shuffle(boxes[2], rng),
    ...shuffle(boxes[3], rng),
  ];
}

/**
 * Builds a focused mistake-review queue for entries that were missed or
 * marked "needs practice" during a round.
 */
export function buildMistakeReviewOrder(
  missedEntries: readonly VocabularyEntry[],
  rng: Rng,
): VocabularyEntry[] {
  return shuffle(missedEntries, rng);
}

/* ---------- Quiz ---------- */

export interface QuizRound {
  entry: VocabularyEntry;
  /** Distinct option strings; always contains the answer. */
  options: string[];
  answer: string;
}

/**
 * Build multiple-choice rounds. A round exists only when at least two distinct
 * options can be formed without fabricating vocabulary. Distractors are other
 * entries' translations, excluding anything that could pass for an answer.
 * If questionEntries is provided, questions are chosen from that subset
 * while distractors can be drawn from all available entries.
 */
export function buildQuizRounds(
  entries: readonly VocabularyEntry[],
  rng: Rng,
  maxRounds: number = MAX_QUIZ_ROUNDS,
  questionEntries?: readonly VocabularyEntry[],
): QuizRound[] {
  const maxOptions = 4;
  const rounds: QuizRound[] = [];
  const targetQuestions =
    questionEntries && questionEntries.length > 0 ? questionEntries : entries;

  // Distinct target strings (exact match, first-seen order) computed once from all entries:
  // rebuilding this pool per question made large decks unusable (O(n^2) work
  // per question). Filtering by the per-question forbidden set below yields
  // exactly the same pool contents as the old nested loop.
  const distinctTargets: { text: string; key: string }[] = [];
  const seenTargets = new Set<string>();
  for (const entry of entries) {
    if (seenTargets.has(entry.target)) continue;
    seenTargets.add(entry.target);
    distinctTargets.push({
      text: entry.target,
      key: entry.target.normalize("NFC").toLocaleLowerCase(),
    });
  }

  for (const entry of shuffle(targetQuestions, rng)) {
    const answer = entry.target;
    const forbidden = new Set(
      [answer, ...entry.alternatives].map((value) => value.normalize("NFC").toLocaleLowerCase()),
    );

    const distractorPool: string[] = [];
    for (const { text, key } of distinctTargets) {
      if (forbidden.has(key)) continue;
      distractorPool.push(text);
    }

    const distractors = shuffle(distractorPool, rng).slice(0, maxOptions - 1);
    const options = shuffle([answer, ...distractors], rng);
    if (options.length < 2) continue; // not enough distinct options; skip, never fabricate
    rounds.push({ entry, options, answer });

    if (rounds.length >= maxRounds) break;
  }

  return rounds;
}

/* ---------- Matching ---------- */

export interface MatchPair {
  pairId: string;
  source: string;
  target: string;
}

export interface MatchBoard {
  pairs: MatchPair[];
  /** Left and right columns contain the same pairs in different orders. */
  left: MatchPair[];
  right: MatchPair[];
  /** Entries dropped because their translation was ambiguous within the deck. */
  excludedCount: number;
}

/**
 * Build a matching board. Entries whose translation text appears in more than
 * one entry are excluded: with identical right-column text, the puzzle would
 * have two correct answers for the same string. We report the count instead
 * of duplicating or inventing pairs.
 */
export function buildMatchBoard(
  entries: readonly VocabularyEntry[],
  rng: Rng,
  maxPairs: number = MAX_MATCH_PAIRS,
): MatchBoard {
  const targetCounts = new Map<string, number>();
  for (const entry of entries) {
    targetCounts.set(entry.target, (targetCounts.get(entry.target) ?? 0) + 1);
  }
  const unambiguous = entries.filter((entry) => (targetCounts.get(entry.target) ?? 0) === 1);
  const excludedCount = entries.length - unambiguous.length;

  const chosen = shuffle(unambiguous, rng).slice(0, Math.max(maxPairs, 0));
  const pairs: MatchPair[] = chosen.map((entry) => ({
    pairId: entry.id,
    source: entry.source,
    target: entry.target,
  }));

  return {
    pairs,
    left: shuffle(pairs, rng),
    right: shuffle(pairs, rng),
    excludedCount,
  };
}

/* ---------- Convenience ---------- */

export function seededRng(seed?: number): Rng {
  return createRng(seed ?? Math.floor(Math.random() * 2 ** 31));
}
