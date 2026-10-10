import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlayableDeck } from "../../api/types";
import { buildFlashcardOrder, seededRng } from "../engine";
import { rise, useAnimationRegistry } from "../../lib/motion";
import { useSession } from "../../session/useSession";
import { languageName } from "../../lang/display";
import { Button } from "../../components/Button";
import { Panel } from "../../components/Panel";
import { ProgressBar } from "../../components/ProgressBar";

export const AUTO_REVEAL_MS = 3000;

/**
 * Flashcards: show the source word, reveal the translation (automatically or on
 * demand), then self-assess. The auto-reveal timer is always cleaned up: on
 * card change, on manual reveal, and on unmount (e.g. mode switches). The card
 * flip is a CSS transform; reduced motion swaps the faces without animating.
 */
export function FlashcardsMode({ deck, seed }: { deck: PlayableDeck; seed?: number }) {
  const { recordFlashcardAssessment } = useSession();
  const register = useAnimationRegistry();
  const [attempt, setAttempt] = useState(0);
  const order = useMemo(
    () => buildFlashcardOrder(deck.entries, seededRng(seed ?? attempt)),
    [deck.entries, seed, attempt],
  );
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [finished, setFinished] = useState(false);
  const timerRef = useRef<number | null>(null);
  const summaryRef = useRef<HTMLDivElement | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Unmount cleanup (also fires on mode switches).
  useEffect(() => clearTimer, [clearTimer]);

  useEffect(() => {
    if (revealed || finished) return;
    timerRef.current = window.setTimeout(() => setRevealed(true), AUTO_REVEAL_MS);
    return clearTimer;
  }, [index, revealed, finished, clearTimer]);

  useEffect(() => {
    if (finished) register(rise(summaryRef.current));
  }, [finished, register]);

  const advance = useCallback(() => {
    clearTimer();
    if (index + 1 >= order.length) {
      setFinished(true);
      return;
    }
    setIndex(index + 1);
    setRevealed(false);
  }, [clearTimer, index, order.length]);

  const assess = useCallback(
    (assessment: "known" | "needsPractice") => {
      recordFlashcardAssessment(assessment);
      advance();
    },
    [advance, recordFlashcardAssessment],
  );

  const restart = useCallback(() => {
    clearTimer();
    setAttempt((value) => value + 1);
    setIndex(0);
    setRevealed(false);
    setFinished(false);
  }, [clearTimer]);

  if (finished) {
    return (
      <div ref={summaryRef}>
        <Panel className="stack summary">
          <h3>Deck finished</h3>
          <p className="muted">
            You reviewed all {order.length} cards. Self-assessments are in the session
            summary above.
          </p>
          <div className="row">
            <Button variant="primary" onClick={restart}>
              Study again
            </Button>
          </div>
        </Panel>
      </div>
    );
  }

  const entry = order[index];

  return (
    <div className="stack">
      <div className="row row-space">
        <span className="label">
          Card {index + 1} of {order.length}
        </span>
        <ProgressBar value={index} max={order.length} label={`${index} reviewed`} />
      </div>

      <Panel className={`stack flashcard flashcard-flip${revealed ? " is-revealed" : ""}`}>
        <div className="flashcard-flipper">
          <div className="flashcard-face flashcard-face-front" aria-hidden="true">
            <span className="label">{languageName(deck.sourceLanguage)}</span>
            <p className="flashcard-word">{entry.source}</p>
            <p className="faint">The translation appears automatically after 3 seconds.</p>
          </div>
          <div className="flashcard-face flashcard-face-back" aria-hidden="true">
            <span className="label">{languageName(deck.targetLanguage)}</span>
            <p className="flashcard-word flashcard-translation">{entry.target}</p>
            {entry.alternatives.length > 0 ? (
              <p className="faint">Also accepted: {entry.alternatives.join(", ")}</p>
            ) : null}
          </div>
        </div>
        {/* Screen-reader announcement; the visual faces are decorative here. */}
        <p className="sr-only" role="status">
          {revealed
            ? `Translation of ${entry.source}: ${entry.target}.`
            : `Card showing ${entry.source}. Translation hidden.`}
        </p>
      </Panel>

      {revealed ? (
        <div className="row">
          <Button variant="primary" onClick={() => assess("known")}>
            Known
          </Button>
          <Button variant="secondary" onClick={() => assess("needsPractice")}>
            Needs practice
          </Button>
        </div>
      ) : (
        <Button
          variant="primary"
          onClick={() => {
            clearTimer();
            setRevealed(true);
          }}
        >
          Reveal translation
        </Button>
      )}
    </div>
  );
}
