import { useCallback, useMemo, useEffect, useRef, useState } from "react";
import type { PlayableDeck, VocabularyEntry } from "../../api/types";
import { MAX_QUIZ_ROUNDS, buildQuizRounds } from "../engine";
import { parseBoundedCount } from "../roundSize";
import { useSessionSeed } from "../useSessionSeed";
import { pulse, rise, shake, useAnimationRegistry } from "../../lib/motion";
import { useSession } from "../../session/useSession";
import { languageName } from "../../lang/display";
import { fullTranslation, nativeScript } from "../translationDisplay";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { Panel } from "../../components/Panel";
import { ProgressBar } from "../../components/ProgressBar";
import { RoundSizeField } from "../../components/RoundSizeField";

/**
 * Multiple choice: one correct translation among distinct options built by the
 * engine (never fabricated). Supports keyboard shortcuts (1-4 to choose, Enter to
 * submit/advance) and targeted mistake review. Submissions are locked after the
 * first submit, so a round can be scored exactly once.
 */
export function QuizMode({ deck, seed }: { deck: PlayableDeck; seed?: number }) {
  const { recordQuizAnswer } = useSession();
  const register = useAnimationRegistry();
  const feedbackRef = useRef<HTMLDivElement | null>(null);
  const summaryRef = useRef<HTMLDivElement | null>(null);
  const { rng, reshuffle } = useSessionSeed(seed);
  const [reviewMistakes, setReviewMistakes] = useState<VocabularyEntry[] | null>(null);

  const allRounds = useMemo(
    () => {
      if (reviewMistakes && reviewMistakes.length > 0) {
        return buildQuizRounds(deck.entries, rng, reviewMistakes.length, reviewMistakes);
      }
      return buildQuizRounds(deck.entries, rng, MAX_QUIZ_ROUNDS);
    },
    [deck.entries, reviewMistakes, rng],
  );

  const maxQuestions = allRounds.length;
  const [questionCount, setQuestionCount] = useState(maxQuestions);
  const [countInput, setCountInput] = useState(() => String(maxQuestions));

  const rounds = useMemo(
    () => allRounds.slice(0, Math.min(questionCount, maxQuestions)),
    [allRounds, questionCount, maxQuestions],
  );

  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [roundEvaluations, setRoundEvaluations] = useState<
    Map<string, { entry: VocabularyEntry; correct: boolean; chosen: string; answer: string }>
  >(() => new Map());

  // Derived before early returns so effects remain unconditional
  const activeRound = rounds.length > 0 ? rounds[Math.min(index, rounds.length - 1)] : null;

  // Map each option string back to its entry for Japanese script
  const optionScript = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const e of deck.entries) {
      const script = nativeScript(e);
      if (script.length > 0 && !map.has(e.target)) map.set(e.target, script);
    }
    return map;
  }, [deck.entries]);

  const commitQuestionCount = useCallback(
    (raw: string) => {
      const parsed = parseBoundedCount(raw, maxQuestions);
      const current = Math.min(questionCount, maxQuestions);
      if (parsed === null) {
        setCountInput(String(current));
        return;
      }
      if (parsed === current) {
        setCountInput(String(parsed));
        return;
      }
      setQuestionCount(parsed);
      setCountInput(String(parsed));
      setReviewMistakes(null);
      setRoundEvaluations(new Map());
      reshuffle();
      setIndex(0);
      setSelected(null);
      setSubmitted(false);
    },
    [maxQuestions, questionCount, reshuffle],
  );

  useEffect(() => {
    if (!submitted || !activeRound) return;
    if (selected === activeRound.answer) {
      register(pulse(feedbackRef.current));
    } else {
      register(shake(feedbackRef.current));
    }
  }, [submitted, selected, activeRound, register]);

  useEffect(() => {
    if (rounds.length > 0 && index >= rounds.length) register(rise(summaryRef.current));
  }, [index, rounds.length, register]);

  const finished = index >= rounds.length;
  const round = rounds[Math.min(index, rounds.length - 1)];

  const submit = useCallback(() => {
    if (submitted || selected === null || !round) return;
    const isCorrect = selected === round.answer;
    setSubmitted(true);
    recordQuizAnswer(isCorrect, round.entry.id);
    setRoundEvaluations((prev) => {
      const next = new Map(prev);
      next.set(round.entry.id, {
        entry: round.entry,
        correct: isCorrect,
        chosen: selected,
        answer: round.answer,
      });
      return next;
    });
  }, [recordQuizAnswer, round, selected, submitted]);

  const next = useCallback(() => {
    setSelected(null);
    setSubmitted(false);
    setIndex((value) => value + 1);
  }, []);

  // Keyboard navigation: 1-4 chooses options, Enter submits or advances
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (finished || !round) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }

      if (!submitted) {
        const keyNum = parseInt(event.key, 10);
        if (keyNum >= 1 && keyNum <= round.options.length) {
          event.preventDefault();
          setSelected(round.options[keyNum - 1]);
        } else if (event.key === "Enter" && selected !== null) {
          event.preventDefault();
          submit();
        }
      } else {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          next();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [finished, next, round, selected, submit, submitted]);

  const playAgain = useCallback(() => {
    reshuffle();
    setReviewMistakes(null);
    setRoundEvaluations(new Map());
    setIndex(0);
    setSelected(null);
    setSubmitted(false);
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
    setQuestionCount(mistakesToReview.length);
    setCountInput(String(mistakesToReview.length));
    setRoundEvaluations(new Map());
    setIndex(0);
    setSelected(null);
    setSubmitted(false);
  }, [missedItems, reshuffle]);

  if (maxQuestions === 0) {
    return (
      <EmptyState
        title="Not enough distinct translations"
        description="A multiple-choice quiz needs a deck with at least two different translations, so every question has exactly one correct option. Add more entries or try another mode."
      />
    );
  }

  if (finished) {
    return (
      <div ref={summaryRef}>
        <Panel className="stack summary">
          <h3>{reviewMistakes ? "Review quiz complete" : "Quiz complete"}</h3>
          <p className="muted">
            You answered {roundEvaluations.size} questions this round: {correctCount} correct
            {missedItems.length > 0 ? `, ${missedItems.length} incorrect` : ""}.
          </p>

          {missedItems.length > 0 ? (
            <div className="stack-tight mistake-section">
              <span className="label">Questions missed ({missedItems.length}):</span>
              <ul className="mistake-list">
                {missedItems.map((item) => (
                  <li key={item.entry.id} className="mistake-item">
                    <span className="mistake-word">
                      <strong>{item.entry.source}</strong>: You picked{" "}
                      <em>{item.chosen}</em> (Correct:{" "}
                      <span className="mistake-correct">{item.answer}</span>)
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
              🎉 Perfect score! Every question in this round was answered correctly.
            </p>
          )}

          <div className="row">
            {missedItems.length > 0 ? (
              <Button variant="primary" onClick={startMistakeReview}>
                Review Missed Questions ({missedItems.length})
              </Button>
            ) : null}
            <Button
              variant={missedItems.length > 0 ? "secondary" : "primary"}
              onClick={playAgain}
            >
              {reviewMistakes ? "Back to full deck" : "Play again"}
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
          {reviewMistakes ? "Review Question" : "Question"} {index + 1} of {rounds.length}
        </span>
        {!reviewMistakes ? (
          <RoundSizeField
            id="quiz-question-count"
            label="Questions"
            max={maxQuestions}
            value={countInput}
            onChange={setCountInput}
            onCommit={commitQuestionCount}
          />
        ) : null}
        <ProgressBar value={index} max={rounds.length} label={`${index} answered`} />
      </div>

      <Panel className="stack quiz-prompt">
        <span className="label">{languageName(deck.sourceLanguage)}</span>
        <p className="flashcard-word lang-text" lang={deck.sourceLanguage}>
          {round.entry.source}
        </p>
        <span className="label">
          Choose the {languageName(deck.targetLanguage)} translation
        </span>
        <p className="faint">Press 1–{round.options.length} to select, Enter to submit</p>
      </Panel>

      <ul className="option-list">
        {round.options.map((option, optIdx) => {
          const isAnswer = option === round.answer;
          const isChosen = option === selected;
          const tone = !submitted
            ? ""
            : isAnswer
              ? " option-correct"
              : isChosen
                ? " option-incorrect"
                : "";
          return (
            <li key={option}>
              <button
                type="button"
                className={`option${isChosen ? " is-selected" : ""}${tone}`}
                aria-pressed={isChosen}
                disabled={submitted}
                onClick={() => setSelected(option)}
                title={`Option ${optIdx + 1}: Press ${optIdx + 1}`}
              >
                <span className="option-text lang-text" lang={deck.targetLanguage}>
                  {option}
                </span>
                {optionScript.get(option) ? (
                  <span className="option-script lang-text" lang="ja">
                    {optionScript.get(option)!.join(" · ")}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="quiz-feedback stack">
        {submitted ? (
          <div className="stack" role="status" ref={feedbackRef}>
            <p className={selected === round.answer ? "notice" : "notice notice-error"}>
              {selected === round.answer
                ? `Correct. ${fullTranslation(round.entry)}`
                : `Not quite. "${fullTranslation(round.entry)}" is the translation.`}
            </p>
            <div className="row">
              <Button variant="primary" onClick={next}>
                {index + 1 >= rounds.length ? "See results" : "Next question"}{" "}
                <span aria-hidden="true" className="kbd-hint">[Enter]</span>
              </Button>
            </div>
          </div>
        ) : (
          <div className="row quiz-submit-row">
            <Button variant="primary" onClick={submit} disabled={selected === null}>
              Submit answer {selected !== null ? <span aria-hidden="true" className="kbd-hint">[Enter]</span> : null}
            </Button>
            {selected === null ? <span className="faint">Select an option (or press 1-{round.options.length}).</span> : null}
          </div>
        )}
      </div>
    </div>
  );
}
