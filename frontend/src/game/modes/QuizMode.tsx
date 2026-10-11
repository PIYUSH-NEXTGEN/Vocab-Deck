import { useMemo, useEffect, useRef, useState } from "react";
import type { PlayableDeck } from "../../api/types";
import { MAX_QUIZ_ROUNDS, buildQuizRounds, seededRng } from "../engine";
import { pulse, rise, shake, useAnimationRegistry } from "../../lib/motion";
import { useSession } from "../../session/useSession";
import { languageName } from "../../lang/display";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { Panel } from "../../components/Panel";
import { ProgressBar } from "../../components/ProgressBar";

/**
 * Multiple choice: one correct translation among distinct options built by the
 * engine (never fabricated). Submissions are locked after the first submit, so
 * a round can be scored exactly once.
 */
export function QuizMode({ deck, seed }: { deck: PlayableDeck; seed?: number }) {
  const { recordQuizAnswer, stats } = useSession();
  const register = useAnimationRegistry();
  const feedbackRef = useRef<HTMLDivElement | null>(null);
  const summaryRef = useRef<HTMLDivElement | null>(null);
  const [attempt, setAttempt] = useState(0);
  const rounds = useMemo(
    () => buildQuizRounds(deck.entries, seededRng(seed ?? attempt), MAX_QUIZ_ROUNDS),
    [deck.entries, seed, attempt],
  );
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Derived before the early returns so both effects below stay unconditional.
  const activeRound = rounds.length > 0 ? rounds[Math.min(index, rounds.length - 1)] : null;

  // Feedback accent: pulse for correct, gentle shake for incorrect. Scoring is
  // already done by the time it runs, so animation never gates state.
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

  if (rounds.length === 0) {
    return (
      <EmptyState
        title="Not enough distinct translations"
        description="A multiple-choice quiz needs a deck with at least two different translations, so every question has exactly one correct option. Add more entries or try another mode."
      />
    );
  }

  const finished = index >= rounds.length;
  const round = rounds[Math.min(index, rounds.length - 1)];

  function submit() {
    if (submitted || selected === null) return; // duplicate-submission guard
    setSubmitted(true);
    recordQuizAnswer(selected === round.answer);
  }

  function next() {
    setSelected(null);
    setSubmitted(false);
    setIndex((value) => value + 1);
  }

  function playAgain() {
    setAttempt((value) => value + 1);
    setIndex(0);
    setSelected(null);
    setSubmitted(false);
  }

  if (finished) {
    return (
      <div ref={summaryRef}>
        <Panel className="stack summary">
          <h3>Quiz complete</h3>
          <p className="muted">
            You answered {stats.quiz.answered} questions this session, {stats.quiz.correct} of
            them correctly.
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
          Question {index + 1} of {rounds.length}
        </span>
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
      </Panel>

      <ul className="option-list">
        {round.options.map((option) => {
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
              >
                <span className="lang-text" lang={deck.targetLanguage}>
                  {option}
                </span>
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
                ? "Correct."
                : `Not quite — "${round.answer}" is the translation.`}
            </p>
            <div className="row">
              <Button variant="primary" onClick={next}>
                {index + 1 >= rounds.length ? "See results" : "Next question"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="row quiz-submit-row">
            <Button variant="primary" onClick={submit} disabled={selected === null}>
              Submit answer
            </Button>
            {selected === null ? <span className="faint">Select an option first.</span> : null}
          </div>
        )}
      </div>
    </div>
  );
}
