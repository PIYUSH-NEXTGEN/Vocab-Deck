import { useCallback, useMemo, useEffect, useRef, useState } from "react";
import type { PlayableDeck, VocabularyEntry } from "../../api/types";
import { MAX_QUIZ_ROUNDS, buildQuizRounds } from "../engine";
import {
  formatDistractorReasons,
  getConfusableEntryIds,
  getPairConfusionCount,
  getTopConfusedPairs,
  type ConfusionMatrix,
  type QuizDifficulty,
} from "../distractors";
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
import { SegmentedControl } from "../../components/SegmentedControl";

const DIFFICULTY_OPTIONS: { value: QuizDifficulty; label: string; hint: string }[] = [
  { value: "standard", label: "Standard", hint: "broad contrast" },
  { value: "adaptive", label: "Adaptive", hint: "matched to mastery" },
  { value: "challenging", label: "Challenging", hint: "close lookalikes" },
];

type ReviewScope = "mistakes" | "confusions";

/**
 * Multiple choice: one correct translation among distinct smartly ranked options
 * built by the engine (never fabricated). Supports adaptive/standard/challenging
 * distractor difficulty, confusion-aware feedback, keyboard shortcuts (1-4 to
 * choose, Enter to submit/advance), and targeted mistake/confusion review.
 * Submissions are locked after the first submit, so a round scores once.
 */
export function QuizMode({ deck, seed }: { deck: PlayableDeck; seed?: number }) {
  const { confusionMatrix, recordQuizAnswer, retention } = useSession();
  const register = useAnimationRegistry();
  const feedbackRef = useRef<HTMLDivElement | null>(null);
  const summaryRef = useRef<HTMLDivElement | null>(null);
  const { rng, reshuffle } = useSessionSeed(seed);
  const [difficulty, setDifficulty] = useState<QuizDifficulty>("adaptive");
  const [reviewState, setReviewState] = useState<{
    scope: ReviewScope;
    entries: VocabularyEntry[];
  } | null>(null);

  // Snapshot confusion & retention at round boundaries so in-flight questions remain stable
  // while live feedback & the next round reflect every newly recorded mistake.
  const [roundConfusionSnapshot, setRoundConfusionSnapshot] = useState<ConfusionMatrix>(
    () => confusionMatrix,
  );
  const [roundRetentionSnapshot, setRoundRetentionSnapshot] = useState(() => retention);

  const allRounds = useMemo(() => {
    const buildOptions = {
      difficulty: reviewState?.scope === "confusions" ? "challenging" : difficulty,
      deckId: deck.id,
      confusionMatrix: roundConfusionSnapshot,
      retention: roundRetentionSnapshot,
      prioritizeConfused: reviewState?.scope === "confusions",
    };
    if (reviewState && reviewState.entries.length > 0) {
      return buildQuizRounds(
        deck.entries,
        rng,
        reviewState.entries.length,
        reviewState.entries,
        buildOptions,
      );
    }
    return buildQuizRounds(deck.entries, rng, MAX_QUIZ_ROUNDS, undefined, buildOptions);
  }, [
    deck.entries,
    deck.id,
    difficulty,
    reviewState,
    rng,
    roundConfusionSnapshot,
    roundRetentionSnapshot,
  ]);

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

  const resetRound = useCallback(
    (
      nextReview: { scope: ReviewScope; entries: VocabularyEntry[] } | null,
      countOverride?: number,
    ) => {
      reshuffle();
      setReviewState(nextReview);
      if (countOverride !== undefined) {
        setQuestionCount(countOverride);
        setCountInput(String(countOverride));
      }
      setRoundConfusionSnapshot(confusionMatrix);
      setRoundRetentionSnapshot(retention);
      setRoundEvaluations(new Map());
      setIndex(0);
      setSelected(null);
      setSubmitted(false);
    },
    [confusionMatrix, reshuffle, retention],
  );

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
      resetRound(null, parsed);
    },
    [maxQuestions, questionCount, resetRound],
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
    const chosenEntryId = isCorrect ? undefined : round.distractorInsights?.[selected]?.entryId;
    setSubmitted(true);
    recordQuizAnswer(isCorrect, round.entry.id, chosenEntryId, deck.id);
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
  }, [deck.id, recordQuizAnswer, round, selected, submitted]);

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
    resetRound(null);
  }, [resetRound]);

  const handleDifficultyChange = useCallback(
    (nextDifficulty: QuizDifficulty) => {
      if (nextDifficulty === difficulty) return;
      setDifficulty(nextDifficulty);
      resetRound(reviewState);
    },
    [difficulty, resetRound, reviewState],
  );

  const missedItems = useMemo(
    () => Array.from(roundEvaluations.values()).filter((item) => !item.correct),
    [roundEvaluations],
  );

  const correctCount = useMemo(
    () => Array.from(roundEvaluations.values()).filter((item) => item.correct).length,
    [roundEvaluations],
  );

  const topConfusedPairs = useMemo(
    () => getTopConfusedPairs(confusionMatrix, deck.id, deck.entries, 5),
    [confusionMatrix, deck.id, deck.entries],
  );

  const confusableEntries = useMemo(() => {
    const ids = getConfusableEntryIds(confusionMatrix, deck.id);
    if (ids.length === 0) return [];
    const byId = new Map(deck.entries.map((entry) => [entry.id, entry]));
    return ids
      .map((id) => byId.get(id))
      .filter((entry): entry is VocabularyEntry => entry !== undefined);
  }, [confusionMatrix, deck.id, deck.entries]);

  const startMistakeReview = useCallback(() => {
    if (missedItems.length === 0) return;
    const mistakesToReview = missedItems.map((m) => m.entry);
    resetRound({ scope: "mistakes", entries: mistakesToReview }, mistakesToReview.length);
  }, [missedItems, resetRound]);

  const startConfusionReview = useCallback(() => {
    if (confusableEntries.length === 0) return;
    setDifficulty("challenging");
    resetRound({ scope: "confusions", entries: confusableEntries }, confusableEntries.length);
  }, [confusableEntries, resetRound]);

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
          <h3>
            {reviewState?.scope === "confusions"
              ? "Confusion practice complete"
              : reviewState
                ? "Review quiz complete"
                : "Quiz complete"}
          </h3>
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

          {topConfusedPairs.length > 0 ? (
            <div className="stack-tight confusion-section">
              <span className="label">
                Confusable word pairs this session ({topConfusedPairs.length}):
              </span>
              <ul className="confusion-list">
                {topConfusedPairs.map((pair) => {
                  const modes: string[] = [];
                  if (pair.sources.quiz > 0) modes.push("Quiz");
                  if (pair.sources.matching > 0) modes.push("Matching");
                  return (
                    <li
                      key={`${pair.entryA.id}-${pair.entryB.id}`}
                      className="confusion-item"
                    >
                      <span>
                        <strong>{pair.entryA.source}</strong> ({pair.entryA.target}) ↔{" "}
                        <strong>{pair.entryB.source}</strong> ({pair.entryB.target})
                      </span>
                      <span className="confusion-meta faint">
                        {pair.total}×{modes.length > 0 ? ` (${modes.join(" & ")})` : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          <div className="row">
            {missedItems.length > 0 ? (
              <Button variant="primary" onClick={startMistakeReview}>
                Review Missed Questions ({missedItems.length})
              </Button>
            ) : null}
            {confusableEntries.length > 0 ? (
              <Button
                variant={missedItems.length === 0 ? "primary" : "secondary"}
                onClick={startConfusionReview}
              >
                Practice Confused Words ({confusableEntries.length})
              </Button>
            ) : null}
            <Button
              variant={
                missedItems.length > 0 || confusableEntries.length > 0 ? "secondary" : "primary"
              }
              onClick={playAgain}
            >
              {reviewState ? "Back to full deck" : "Play again"}
            </Button>
          </div>
        </Panel>
      </div>
    );
  }

  const selectedInsight =
    submitted && selected && round && selected !== round.answer
      ? round.distractorInsights?.[selected]
      : undefined;
  const livePairConfusionCount = selectedInsight
    ? getPairConfusionCount(confusionMatrix, deck.id, round.entry.id, selectedInsight.entryId)
    : 0;

  return (
    <div className="stack">
      <div className="row row-space round-controls">
        <span className="label">
          {reviewState ? "Review Question" : "Question"} {index + 1} of {rounds.length}
        </span>
        {!reviewState ? (
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
            {selectedInsight ? (
              <p className="quiz-confusion-insight">
                You chose <strong>{selectedInsight.target}</strong> ({selectedInsight.source})
                {livePairConfusionCount > 0 ? ` — confused ${livePairConfusionCount}× this session` : ""}
                {selectedInsight.reasons.length > 0 ? (
                  <span className="faint"> · {formatDistractorReasons(selectedInsight.reasons)}</span>
                ) : null}
              </p>
            ) : null}
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

      <div className="quiz-settings stack-tight">
        <span className="label">Distractor difficulty</span>
        <SegmentedControl<QuizDifficulty>
          ariaLabel="Distractor difficulty"
          value={difficulty}
          onChange={handleDifficultyChange}
          options={DIFFICULTY_OPTIONS}
        />
      </div>
    </div>
  );
}
