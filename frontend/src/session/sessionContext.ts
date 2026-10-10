/**
 * Session-only gameplay state. Lives in memory for the lifetime of the SPA tab;
 * mode switches preserve it, and it is only cleared by an explicit restart.
 * Nothing here ever touches localStorage or the server.
 *
 * The context object and reducer types live here (no components) so the provider
 * component file stays fast-refresh friendly.
 */

import { createContext } from "react";

export interface FlashcardTally {
  known: number;
  needsPractice: number;
}

export interface QuizScore {
  correct: number;
  answered: number;
}

export interface TypingScore {
  correct: number;
  attempted: number;
}

export interface MatchingScore {
  pairsCompleted: number;
  attempts: number;
}

export interface SessionStats {
  startedAt: number;
  flashcards: FlashcardTally;
  quiz: QuizScore;
  typing: TypingScore;
  matching: MatchingScore;
}

export type FlashcardAssessment = keyof FlashcardTally;

export function emptyStats(now: number): SessionStats {
  return {
    startedAt: now,
    flashcards: { known: 0, needsPractice: 0 },
    quiz: { correct: 0, answered: 0 },
    typing: { correct: 0, attempted: 0 },
    matching: { pairsCompleted: 0, attempts: 0 },
  };
}

export function isPristineStats(stats: SessionStats): boolean {
  return (
    stats.flashcards.known === 0 &&
    stats.flashcards.needsPractice === 0 &&
    stats.quiz.answered === 0 &&
    stats.typing.attempted === 0 &&
    stats.matching.attempts === 0
  );
}

export interface SessionApi {
  stats: SessionStats;
  /** True until the first recorded event, so the UI can show a quiet zero state. */
  isPristine: boolean;
  recordFlashcardAssessment: (assessment: FlashcardAssessment) => void;
  recordQuizAnswer: (correct: boolean) => void;
  recordTypingAttempt: (correct: boolean) => void;
  recordMatchAttempt: (correct: boolean) => void;
  restart: () => void;
}

export const SessionContext = createContext<SessionApi | null>(null);
