import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlayableDeck } from "../../api/types";
import { MAX_MATCH_PAIRS, buildMatchBoard } from "../engine";
import { useSessionSeed } from "../useSessionSeed";
import { pop, pulse, rise, shake, useAnimationRegistry } from "../../lib/motion";
import { useSession } from "../../session/useSession";
import { languageName } from "../../lang/display";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { Panel } from "../../components/Panel";
import { ProgressBar } from "../../components/ProgressBar";

const FEEDBACK_MS = 1200;
const PAIRS_PER_BATCH = 6;

type Feedback = { tone: "correct" | "incorrect"; message: string } | null;
type BatchAction = "next" | "results" | null;

/**
 * Matching: pair source words with their translations. Both columns are
 * independently shuffled; completed pairs are locked (no re-matching) and every
 * attempt is scored exactly once. Ambiguous translations were already removed
 * by the engine, so each pair has exactly one correct partner.
 */
export function MatchingMode({ deck, seed }: { deck: PlayableDeck; seed?: number }) {
  const { recordMatchAttempt, stats } = useSession();
  const register = useAnimationRegistry();
  const summaryRef = useRef<HTMLDivElement | null>(null);
  const { rng, reshuffle } = useSessionSeed(seed);
  const board = useMemo(
    () => buildMatchBoard(deck.entries, rng, MAX_MATCH_PAIRS),
    [deck.entries, rng],
  );
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [incorrectTargetId, setIncorrectTargetId] = useState<string | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(() => new Set());
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [finished, setFinished] = useState(false);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [batchAction, setBatchAction] = useState<BatchAction>(null);
  const feedbackTimer = useRef<number | null>(null);
  const feedbackRef = useRef<HTMLDivElement | null>(null);
  const batchActionRef = useRef<HTMLDivElement | null>(null);

  const totalBatches = Math.ceil(board.pairs.length / PAIRS_PER_BATCH);
  const batchStart = currentBatch * PAIRS_PER_BATCH;
  const batchEnd = Math.min(batchStart + PAIRS_PER_BATCH, board.pairs.length);
  const batchPairs = board.pairs.slice(batchStart, batchEnd);
  const batchPairIds = new Set(batchPairs.map((p) => p.pairId));
  const isLastBatch = currentBatch === totalBatches - 1;
  const visibleLeft = board.left.filter((p) => batchPairIds.has(p.pairId));
  const visibleRight = board.right.filter((p) => batchPairIds.has(p.pairId));

  useEffect(() => {
    if (finished) register(rise(summaryRef.current));
  }, [finished, register]);

  useEffect(() => {
    if (feedback && feedbackRef.current && typeof feedbackRef.current.scrollIntoView === "function") {
      feedbackRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [feedback]);

  useEffect(() => {
    if (batchAction && batchActionRef.current && typeof batchActionRef.current.scrollIntoView === "function") {
      batchActionRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [batchAction]);

  const clearFeedbackTimer = useCallback(() => {
    if (feedbackTimer.current !== null) {
      window.clearTimeout(feedbackTimer.current);
      feedbackTimer.current = null;
    }
  }, []);

  useEffect(() => clearFeedbackTimer, [clearFeedbackTimer]);

  const reset = useCallback(() => {
    clearFeedbackTimer();
    setSelectedSourceId(null);
    setSelectedTargetId(null);
    setIncorrectTargetId(null);
    setCompleted(new Set());
    setFeedback(null);
    setFinished(false);
    setCurrentBatch(0);
    setBatchAction(null);
  }, [clearFeedbackTimer]);

  function playAgain() {
    reset();
    reshuffle();
  }

  function handleBatchAction() {
    setBatchAction(null);
    setSelectedSourceId(null);
    setSelectedTargetId(null);
    setIncorrectTargetId(null);
    clearFeedbackTimer();
    setFeedback(null);
    if (batchAction === "next") {
      setCurrentBatch((prev) => prev + 1);
    } else if (batchAction === "results") {
      setFinished(true);
    }
  }

  if (board.pairs.length < 2) {
    return (
      <EmptyState
        title="Not enough pairs to match"
        description={
          board.excludedCount > 0
            ? `This deck has ${board.excludedCount} entries with duplicate translations that were removed to keep pairs unambiguous. Matching needs at least two entries with unique translations.`
            : "Matching needs at least two entries with unique translations. Add more entries or try another mode."
        }
      />
    );
  }

  function selectSource(pairId: string, element: HTMLElement) {
    if (completed.has(pairId)) return;
    clearFeedbackTimer();
    setFeedback(null);
    setSelectedTargetId(null);
    setIncorrectTargetId(null);
    setSelectedSourceId((current) => {
      if (current === pairId) return null;
      register(pop(element));
      return pairId;
    });
  }

  function selectTarget(pairId: string, element: HTMLElement) {
    if (!selectedSourceId || completed.has(pairId)) return;
    setSelectedTargetId(pairId);
    register(pop(element));
    if (pairId === selectedSourceId) {
      recordMatchAttempt(true);
      const nextCompleted = new Set(completed);
      nextCompleted.add(pairId);
      setCompleted(nextCompleted);
      setSelectedSourceId(null);
      setSelectedTargetId(null);
      setIncorrectTargetId(null);
      setFeedback({ tone: "correct", message: "Paired." });
      register(pulse(element));
      if (nextCompleted.size === board.pairs.length) {
        clearFeedbackTimer();
        setFinished(true);
      } else {
        const nextBatchCompleted = [...batchPairIds].filter((id) => nextCompleted.has(id)).length;
        if (nextBatchCompleted === batchPairs.length) {
          setBatchAction(isLastBatch ? "results" : "next");
        }
      }
      return;
    }
    recordMatchAttempt(false);
    setSelectedSourceId(null);
    setIncorrectTargetId(pairId);
    setFeedback({ tone: "incorrect", message: "Not a pair. Try again." });
    register(shake(element));
    feedbackTimer.current = window.setTimeout(() => {
      setFeedback(null);
      setIncorrectTargetId(null);
      setSelectedTargetId(null);
    }, FEEDBACK_MS);
  }

  if (finished) {
    return (
      <div ref={summaryRef}>
        <Panel className="stack summary">
          <h3>All pairs matched</h3>
          <p className="muted">
            You completed {board.pairs.length} pairs this round. Across the session:{" "}
            {stats.matching.pairsCompleted} pairs and {stats.matching.attempts} attempts.
          </p>
          <div className="row">
            <Button variant="primary" onClick={playAgain}>
              Play again
            </Button>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="row row-space">
        <span className="label">
          {completed.size} of {board.pairs.length} pairs
        </span>
        <span className="sr-only" role="status">
          Pairs completed: {completed.size} of {board.pairs.length}.
        </span>
        <ProgressBar
          value={completed.size}
          max={board.pairs.length}
          label={`${board.pairs.length - completed.size} remaining`}
        />
      </div>

      {board.excludedCount > 0 ? (
        <p className="faint">
          {board.excludedCount} entries with duplicate translations were left out to keep pairs
          unambiguous.
        </p>
      ) : null}

      <div className="match-grid">
        <div className="stack-tight">
          <span className="label">{languageName(deck.sourceLanguage)}</span>
          <ul className="match-column">
            {visibleLeft.map((pair) => (
              <li key={pair.pairId}>
                <button
                  type="button"
                  className={`match-item${completed.has(pair.pairId) ? " is-complete" : ""}${
                    selectedSourceId === pair.pairId ? " is-selected" : ""
                  }`}
                  aria-pressed={selectedSourceId === pair.pairId}
                  disabled={completed.has(pair.pairId)}
                  onClick={(event) => selectSource(pair.pairId, event.currentTarget)}
                >
                  <span className="lang-text" lang={deck.sourceLanguage}>
                    {pair.source}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="stack-tight">
          <span className="label">{languageName(deck.targetLanguage)}</span>
          <ul className="match-column">
            {visibleRight.map((pair) => (
              <li key={pair.pairId}>
                <button
                  type="button"
                  className={`match-item${completed.has(pair.pairId) ? " is-complete" : ""}${
                    incorrectTargetId === pair.pairId ? " is-incorrect" : ""
                  }${selectedTargetId === pair.pairId ? " is-selected" : ""}`}
                  aria-pressed={selectedTargetId === pair.pairId}
                  disabled={completed.has(pair.pairId)}
                  onClick={(event) => selectTarget(pair.pairId, event.currentTarget)}
                >
                  <span className="lang-text" lang={deck.targetLanguage}>
                    {pair.target}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div ref={feedbackRef} aria-live="polite" className="match-feedback">
        {feedback ? (
          <p className={feedback.tone === "correct" ? "notice" : "notice notice-error"}>
            {feedback.message}
          </p>
        ) : (
          <p className="faint">
            {selectedSourceId
              ? "Now choose its translation."
              : `Select a ${languageName(deck.sourceLanguage)} word to start.`}
          </p>
        )}
      </div>

      {batchAction && (
        <div
          ref={batchActionRef}
          className="row"
          style={{ justifyContent: "center", marginTop: "var(--space-6)", marginBottom: "var(--space-2)" }}
        >
          <Panel
            className="stack"
            style={{
              padding: "var(--space-6)",
              textAlign: "center",
              maxWidth: "360px",
              width: "100%",
              boxShadow: "var(--shadow-3)",
            }}
          >
            <h3 style={{ marginBottom: "var(--space-3)", fontSize: "var(--text-subheading)" }}>
              {isLastBatch ? "Batch complete" : `Batch ${currentBatch + 1} complete`}
            </h3>
            <p className="muted" style={{ marginBottom: "var(--space-5)", lineHeight: 1.5 }}>
              You completed all {batchPairs.length} pairs in this batch.
            </p>
            <div className="row" style={{ gap: "var(--space-3)", justifyContent: "center", flexWrap: "wrap" }}>
              {isLastBatch ? (
                <Button
                  variant="primary"
                  onClick={handleBatchAction}
                  style={{ minWidth: "150px", padding: "var(--space-3) var(--space-5)" }}
                >
                  See results
                </Button>
              ) : (
                <Button
                  variant="primary"
                  onClick={handleBatchAction}
                  style={{ minWidth: "150px", padding: "var(--space-3) var(--space-5)" }}
                >
                  Next batch
                </Button>
              )}
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
