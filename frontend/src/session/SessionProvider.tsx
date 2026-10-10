import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import {
  SessionContext,
  emptyStats,
  isPristineStats,
  type SessionApi,
} from "./sessionContext";

/** Provides the session-only, in-memory gameplay state to the app. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const startedAtRef = useRef(Date.now());
  const [stats, setStats] = useState(() => emptyStats(startedAtRef.current));

  const recordFlashcardAssessment = useCallback((assessment: "known" | "needsPractice") => {
    setStats((prev) => ({
      ...prev,
      flashcards: {
        ...prev.flashcards,
        [assessment]: prev.flashcards[assessment] + 1,
      },
    }));
  }, []);

  const recordQuizAnswer = useCallback((correct: boolean) => {
    setStats((prev) => ({
      ...prev,
      quiz: {
        correct: prev.quiz.correct + (correct ? 1 : 0),
        answered: prev.quiz.answered + 1,
      },
    }));
  }, []);

  const recordTypingAttempt = useCallback((correct: boolean) => {
    setStats((prev) => ({
      ...prev,
      typing: {
        correct: prev.typing.correct + (correct ? 1 : 0),
        attempted: prev.typing.attempted + 1,
      },
    }));
  }, []);

  const recordMatchAttempt = useCallback((correct: boolean) => {
    setStats((prev) => ({
      ...prev,
      matching: {
        attempts: prev.matching.attempts + 1,
        pairsCompleted: prev.matching.pairsCompleted + (correct ? 1 : 0),
      },
    }));
  }, []);

  const restart = useCallback(() => {
    startedAtRef.current = Date.now();
    setStats(emptyStats(startedAtRef.current));
  }, []);

  const value = useMemo<SessionApi>(
    () => ({
      stats,
      isPristine: isPristineStats(stats),
      recordFlashcardAssessment,
      recordQuizAnswer,
      recordTypingAttempt,
      recordMatchAttempt,
      restart,
    }),
    [
      stats,
      recordFlashcardAssessment,
      recordQuizAnswer,
      recordTypingAttempt,
      recordMatchAttempt,
      restart,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
