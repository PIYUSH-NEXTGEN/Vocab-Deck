import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlayableDeck, VocabularyEntry } from "../../api/types";
import { buildFlashcardOrder, buildMistakeReviewOrder } from "../engine";
import { parseBoundedCount } from "../roundSize";
import { useSessionSeed } from "../useSessionSeed";
import {
  acceptedAnswers,
  evaluateTranslation,
  type AlignmentResult,
  type AnswerVerdict,
  type CharacterHighlight,
  type EvaluationResult,
} from "../text";
import { fullTranslation, nativeScript } from "../translationDisplay";
import { pulse, rise, shake, useAnimationRegistry } from "../../lib/motion";
import { useSession } from "../../session/useSession";
import { languageName } from "../../lang/display";
import { Button } from "../../components/Button";
import { Panel } from "../../components/Panel";
import { ProgressBar } from "../../components/ProgressBar";
import { RoundSizeField } from "../../components/RoundSizeField";
import { SegmentedControl } from "../../components/SegmentedControl";

export type TypoToleranceMode = "forgiving" | "strict";

type Result = "correct" | "typo" | "incorrect" | null;

/** Max entries a single typing round can contain (full 50-entry deck). */
const MAX_ROUND = 50;

/**
 * Typing: type the translation. Comparison is Unicode-aware (NFC), case- and
 * whitespace-insensitive, accent handling is an explicit setting, and an entry's
 * configured alternative translations are accepted. Supports targeted review of
 * missed entries. Empty input is rejected before any scoring happens.
 */
export function TypingMode({ deck, seed }: { deck: PlayableDeck; seed?: number }) {
  const { recordTypingAttempt } = useSession();
  const register = useAnimationRegistry();
  const feedbackRef = useRef<HTMLDivElement | null>(null);
  const summaryRef = useRef<HTMLDivElement | null>(null);
  const { rng, reshuffle } = useSessionSeed(seed);
  const [reviewMistakes, setReviewMistakes] = useState<VocabularyEntry[] | null>(null);

  const fullOrder = useMemo(
    () => {
      if (reviewMistakes && reviewMistakes.length > 0) {
        return buildMistakeReviewOrder(reviewMistakes, rng);
      }
      return buildFlashcardOrder(deck.entries, rng);
    },
    [deck.entries, reviewMistakes, rng],
  );

  const [roundSize, setRoundSize] = useState(() => Math.min(fullOrder.length, MAX_ROUND));
  const [sizeInput, setSizeInput] = useState(() => String(Math.min(fullOrder.length, MAX_ROUND)));
  const maxRound = Math.min(fullOrder.length, MAX_ROUND);

  const order = useMemo(() => {
    if (reviewMistakes && reviewMistakes.length > 0) return fullOrder;
    return fullOrder.slice(0, Math.min(roundSize, maxRound));
  }, [fullOrder, reviewMistakes, roundSize, maxRound]);

  const [index, setIndex] = useState(0);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result>(null);
  const [ignoreAccents, setIgnoreAccents] = useState(true);
  const [typoMode, setTypoMode] = useState<TypoToleranceMode>("forgiving");
  const [lastEvaluation, setLastEvaluation] = useState<EvaluationResult | null>(null);
  const [roundEvaluations, setRoundEvaluations] = useState<
    Map<
      string,
      {
        entry: VocabularyEntry;
        correct: boolean;
        input: string;
        verdict: AnswerVerdict;
        matchedTarget?: string;
        explanation?: string;
        alignment?: AlignmentResult;
      }
    >
  >(() => new Map());

  const entry = order[Math.min(index, order.length - 1)];
  const finished = index >= order.length;

  useEffect(() => {
    if (result === "correct" || result === "typo") register(pulse(feedbackRef.current));
    else if (result === "incorrect") register(shake(feedbackRef.current));
  }, [result, register]);

  useEffect(() => {
    if (finished) register(rise(summaryRef.current));
  }, [finished, register]);

  useEffect(() => {
    setInput("");
    setError(null);
    setResult(null);
    setLastEvaluation(null);
  }, [index]);

  const changeRoundSize = useCallback(
    (next: number) => {
      setRoundSize(next);
      setSizeInput(String(next));
      setReviewMistakes(null);
      setRoundEvaluations(new Map());
      reshuffle();
      setIndex(0);
      setError(null);
      setResult(null);
      setLastEvaluation(null);
    },
    [reshuffle],
  );

  const commitRoundSize = useCallback(
    (raw: string) => {
      const parsed = parseBoundedCount(raw, maxRound);
      if (parsed === null) {
        setSizeInput(String(Math.min(roundSize, maxRound)));
        return;
      }
      if (parsed !== roundSize) changeRoundSize(parsed);
      else setSizeInput(String(parsed));
    },
    [changeRoundSize, maxRound, roundSize],
  );

  function submit() {
    if (input.trim().length === 0) {
      setError(`Enter a ${languageName(deck.targetLanguage)} translation before submitting.`);
      setResult(null);
      return;
    }
    setError(null);
    const evaluation = evaluateTranslation(input, entry, { ignoreAccents, typoTolerance: typoMode });
    setLastEvaluation(evaluation);
    const correct = evaluation.verdict !== "incorrect";
    recordTypingAttempt(correct, entry.id, evaluation.verdict);
    setRoundEvaluations((prev) => {
      const next = new Map(prev);
      next.set(entry.id, {
        entry,
        correct,
        input,
        verdict: evaluation.verdict,
        matchedTarget: evaluation.matchedTarget,
        explanation: evaluation.explanation,
        alignment: evaluation.alignment,
      });
      return next;
    });
    setResult(evaluation.verdict === "exact" ? "correct" : evaluation.verdict === "typo" ? "typo" : "incorrect");
  }

  function next() {
    setIndex((value) => value + 1);
  }

  const playAgain = useCallback(() => {
    reshuffle();
    setReviewMistakes(null);
    setRoundEvaluations(new Map());
    setIndex(0);
    setError(null);
    setResult(null);
    setLastEvaluation(null);
  }, [reshuffle]);

  const allEvaluations = useMemo(
    () => Array.from(roundEvaluations.values()),
    [roundEvaluations],
  );

  const exactItems = useMemo(
    () => allEvaluations.filter((item) => item.verdict === "exact"),
    [allEvaluations],
  );

  const typoItems = useMemo(
    () => allEvaluations.filter((item) => item.verdict === "typo"),
    [allEvaluations],
  );

  const missedItems = useMemo(
    () => allEvaluations.filter((item) => item.verdict === "incorrect"),
    [allEvaluations],
  );


  const startMistakeReview = useCallback(() => {
    if (missedItems.length === 0) return;
    const mistakesToReview = missedItems.map((m) => m.entry);
    reshuffle();
    setReviewMistakes(mistakesToReview);
    setRoundEvaluations(new Map());
    setIndex(0);
    setError(null);
    setResult(null);
    setLastEvaluation(null);
  }, [missedItems, reshuffle]);

  if (finished) {
    return (
      <div ref={summaryRef}>
        <Panel className="stack summary">
          <h3>{reviewMistakes ? "Review round complete" : "Typing complete"}</h3>
          <p className="muted">
            You typed {allEvaluations.length} translations this round: {exactItems.length} exact matches
            {typoItems.length > 0 ? `, ${typoItems.length} near-misses` : ""}
            {missedItems.length > 0 ? `, ${missedItems.length} incorrect` : ""}.
          </p>

          <div className="review-stats-grid">
            <div className="review-stat-card">
              <span className="label">Exact Matches</span>
              <div className="review-stat-count">{exactItems.length}</div>
            </div>
            <div className="review-stat-card">
              <span className="label">Near-Misses</span>
              <div className="review-stat-count">{typoItems.length}</div>
            </div>
            <div className="review-stat-card">
              <span className="label">Incorrect</span>
              <div className="review-stat-count">{missedItems.length}</div>
            </div>
          </div>

          {typoItems.length > 0 ? (
            <div className="stack-tight typo-section">
              <span className="label">Minor typos accepted ({typoItems.length}):</span>
              <ul className="typo-list">
                {typoItems.map((item) => (
                  <li key={item.entry.id} className="typo-item">
                    <span>
                      <strong>{item.entry.source}</strong>: You typed <em>"{item.input}"</em>{" "}
                      ➔ <span className="typo-correct">{item.matchedTarget ?? item.entry.target}</span>
                      {item.explanation ? <span className="faint"> ({item.explanation})</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {missedItems.length > 0 ? (
            <div className="stack-tight mistake-section">
              <span className="label">Words needing practice ({missedItems.length}):</span>
              <ul className="mistake-list">
                {missedItems.map((item) => (
                  <li key={item.entry.id} className="mistake-item">
                    <span className="mistake-word">
                      <strong>{item.entry.source}</strong>: You typed <em>"{item.input}"</em>{" "}
                      (Expected: <span className="mistake-correct">{acceptedAnswers(item.entry).join(", ")}</span>)
                    </span>
                    {nativeScript(item.entry).length > 0 ? (
                      <span className="faint mistake-native">
                        ({nativeScript(item.entry).join(", ")})
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : typoItems.length === 0 ? (
            <p className="notice notice-pill">
              🎉 Flawless typing! Every word this round was typed correctly.
            </p>
          ) : null}

          {exactItems.length > 0 && (typoItems.length > 0 || missedItems.length > 0) ? (
            <div className="stack-tight exact-section">
              <span className="label">Exact matches ({exactItems.length}):</span>
              <ul className="typo-list">
                {exactItems.map((item) => (
                  <li key={item.entry.id} className="typo-item">
                    <span>
                      <strong>{item.entry.source}</strong>: You typed <em>"{item.input}"</em>{" "}
                      ➔ <span className="typo-correct">{item.matchedTarget ?? item.entry.target}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="row">
            {missedItems.length > 0 ? (
              <Button variant="primary" onClick={startMistakeReview}>
                Review Missed Words ({missedItems.length})
              </Button>
            ) : null}
            <Button
              variant={missedItems.length > 0 ? "secondary" : "primary"}
              onClick={playAgain}
            >
              {reviewMistakes ? "Back to full deck" : "Practice again"}
            </Button>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="row row-space round-controls">
        <span className="label">
          {reviewMistakes ? "Review Entry" : "Entry"} {index + 1} of {order.length}
        </span>
        {!reviewMistakes ? (
          <RoundSizeField
            id="typing-round-size"
            label="Entries this round"
            max={maxRound}
            value={sizeInput}
            onChange={setSizeInput}
            onCommit={commitRoundSize}
          />
        ) : null}
        <ProgressBar value={index} max={order.length} label={`${index} typed`} />
      </div>

      <Panel className="stack typing-prompt">
        <span className="label">{languageName(deck.sourceLanguage)}</span>
        <p className="flashcard-word lang-text" lang={deck.sourceLanguage}>
          {entry.source}
        </p>
      </Panel>

      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (result !== null) next();
          else submit();
        }}
      >
        <label className="stack-tight">
          <span className="label">Your {languageName(deck.targetLanguage)} translation</span>
          {nativeScript(entry).length > 0 ? (
            <span className="faint">
              Type the romaji in Latin letters — e.g. {entry.target} for {nativeScript(entry)[0]}.
            </span>
          ) : null}
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            disabled={result !== null}
            aria-invalid={error !== null}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            lang={deck.targetLanguage}
            enterKeyHint="done"
            placeholder="Type the translation"
          />
        </label>

        <label className="row">
          <input
            type="checkbox"
            checked={ignoreAccents}
            onChange={(event) => setIgnoreAccents(event.target.checked)}
            className="checkbox"
          />
          <span>Ignore accents and diacritics when checking answers</span>
        </label>

        <div className="stack-tight typo-tolerance-setting">
          <div className="row row-space">
            <span className="label">Typo tolerance</span>
            <label className="visually-hidden">
              <input
                type="checkbox"
                checked={typoMode === "forgiving"}
                onChange={(event) => setTypoMode(event.target.checked ? "forgiving" : "strict")}
                aria-label="Typo tolerance"
              />
              Typo tolerance
            </label>
          </div>
          <SegmentedControl<TypoToleranceMode>
            ariaLabel="Typo tolerance mode"
            value={typoMode}
            onChange={setTypoMode}
            options={[
              { value: "forgiving", label: "Forgiving", hint: "accepts minor slips" },
              { value: "strict", label: "Strict", hint: "exact spelling required" },
            ]}
          />
        </div>

        <div className="typing-feedback stack">
          {error ? (
            <p className="notice notice-error" role="alert">
              {error}
            </p>
          ) : null}

          {result !== null ? (
            <div className="stack" role="status" ref={feedbackRef}>
              <p
                className={
                  result === "correct"
                    ? "notice"
                    : result === "typo"
                      ? "notice notice-warning"
                      : "notice notice-error"
                }
              >
                {result === "correct"
                  ? `Correct. ${fullTranslation(entry)}`
                  : result === "typo"
                    ? `Almost! Accepted with typo: you typed "${input}", correct spelling is "${lastEvaluation?.matchedTarget ?? fullTranslation(entry)}".`
                    : `Not quite. Accepted: ${acceptedAnswers(entry).join(", ")}`}
              </p>
              {(result === "typo" || (result === "incorrect" && lastEvaluation?.alignment && lastEvaluation.alignment.distance < Infinity)) ? (
                <div className="typo-diff-panel" aria-label="Spelling comparison">
                  {lastEvaluation?.explanation && lastEvaluation.explanation !== "Exact match" ? (
                    <div className="typo-diff-explanation">{lastEvaluation.explanation}</div>
                  ) : null}
                  <div className="typo-diff-row">
                    <span className="label" style={{ minWidth: "80px" }}>You typed:</span>
                    <span className="typo-diff-chars" aria-label={`You typed ${lastEvaluation?.submittedAnswer ?? input}`}>
                      {lastEvaluation?.alignment?.userHighlights && lastEvaluation.alignment.userHighlights.length > 0 ? (
                        lastEvaluation.alignment.userHighlights.map((h: CharacterHighlight, idx: number) => (
                          <span key={idx} className={`char-badge char-${h.status}`} title={`${h.char}: ${h.status}`}>
                            {h.char === " " ? "␣" : h.char}
                          </span>
                        ))
                      ) : (
                        <span className="faint">(empty)</span>
                      )}
                    </span>
                  </div>
                  <div className="typo-diff-row">
                    <span className="label" style={{ minWidth: "80px" }}>Expected:</span>
                    <span className="typo-diff-chars" aria-label={`Correct spelling ${lastEvaluation?.correctAnswer ?? entry.target}`}>
                      {lastEvaluation?.alignment?.targetHighlights && lastEvaluation.alignment.targetHighlights.length > 0 ? (
                        lastEvaluation.alignment.targetHighlights.map((h: CharacterHighlight, idx: number) => (
                          <span key={idx} className={`char-badge char-${h.status}`} title={`${h.char}: ${h.status}`}>
                            {h.char === " " ? "␣" : h.char}
                          </span>
                        ))
                      ) : (
                        <span>{lastEvaluation?.correctAnswer ?? entry.target}</span>
                      )}
                    </span>
                  </div>
                </div>
              ) : null}
              <div className="row">
                <Button variant="primary" type="submit">
                  {index + 1 >= order.length ? "See results" : "Next entry"}{" "}
                  <span aria-hidden="true" className="kbd-hint">[Enter]</span>
                </Button>
              </div>
            </div>
          ) : (
            <div className="row">
              <Button variant="primary" onClick={submit}>
                Check answer <span aria-hidden="true" className="kbd-hint">[Enter]</span>
              </Button>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
