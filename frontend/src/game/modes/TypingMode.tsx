import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlayableDeck, VocabularyEntry } from "../../api/types";
import { buildFlashcardOrder, buildMistakeReviewOrder } from "../engine";
import { parseBoundedCount } from "../roundSize";
import { useSessionSeed } from "../useSessionSeed";
import { acceptedAnswers, matchesTranslation } from "../text";
import { fullTranslation, nativeScript } from "../translationDisplay";
import { pulse, rise, shake, useAnimationRegistry } from "../../lib/motion";
import { useSession } from "../../session/useSession";
import { languageName } from "../../lang/display";
import { Button } from "../../components/Button";
import { Panel } from "../../components/Panel";
import { ProgressBar } from "../../components/ProgressBar";
import { RoundSizeField } from "../../components/RoundSizeField";

type Result = "correct" | "incorrect" | null;

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
  const [roundEvaluations, setRoundEvaluations] = useState<
    Map<string, { entry: VocabularyEntry; correct: boolean; input: string }>
  >(() => new Map());

  const entry = order[Math.min(index, order.length - 1)];
  const finished = index >= order.length;

  useEffect(() => {
    if (result === "correct") register(pulse(feedbackRef.current));
    else if (result === "incorrect") register(shake(feedbackRef.current));
  }, [result, register]);

  useEffect(() => {
    if (finished) register(rise(summaryRef.current));
  }, [finished, register]);

  useEffect(() => {
    setInput("");
    setError(null);
    setResult(null);
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
    const correct = matchesTranslation(input, entry, { ignoreAccents });
    recordTypingAttempt(correct, entry.id);
    setRoundEvaluations((prev) => {
      const next = new Map(prev);
      next.set(entry.id, { entry, correct, input });
      return next;
    });
    setResult(correct ? "correct" : "incorrect");
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
  }, [reshuffle]);

  const missedItems = useMemo(
    () => Array.from(roundEvaluations.values()).filter((item) => !item.correct),
    [roundEvaluations],
  );

  const correctCount = useMemo(
    () => Array.from(roundEvaluations.values()).filter((item) => item.correct).length,
    [roundEvaluations],
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
  }, [missedItems, reshuffle]);

  if (finished) {
    return (
      <div ref={summaryRef}>
        <Panel className="stack summary">
          <h3>{reviewMistakes ? "Review round complete" : "Typing complete"}</h3>
          <p className="muted">
            You typed {roundEvaluations.size} translations this round: {correctCount} correct
            {missedItems.length > 0 ? `, ${missedItems.length} incorrect` : ""}.
          </p>

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
          ) : (
            <p className="notice notice-pill">
              🎉 Flawless typing! Every word this round was typed correctly.
            </p>
          )}

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

        <div className="typing-feedback stack">
          {error ? (
            <p className="notice notice-error" role="alert">
              {error}
            </p>
          ) : null}

          {result !== null ? (
            <div className="stack" role="status" ref={feedbackRef}>
              <p className={result === "correct" ? "notice" : "notice notice-error"}>
                {result === "correct"
                  ? `Correct. ${fullTranslation(entry)}`
                  : `Not quite. Accepted: ${acceptedAnswers(entry).join(", ")}`}
              </p>
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
