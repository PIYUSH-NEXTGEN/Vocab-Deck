import { useEffect, useMemo, useRef, useState } from "react";
import type { PlayableDeck } from "../../api/types";
import { buildFlashcardOrder, seededRng } from "../engine";
import { acceptedAnswers, matchesTranslation } from "../text";
import { pulse, rise, shake, useAnimationRegistry } from "../../lib/motion";
import { useSession } from "../../session/useSession";
import { languageName } from "../../lang/display";
import { Button } from "../../components/Button";
import { Panel } from "../../components/Panel";
import { ProgressBar } from "../../components/ProgressBar";

type Result = "correct" | "incorrect" | null;

/**
 * Typing: type the translation. Comparison is Unicode-aware (NFC), case- and
 * whitespace-insensitive, accent handling is an explicit setting, and an entry's
 * configured alternative translations are accepted. Empty input is rejected
 * before any scoring happens.
 */
export function TypingMode({ deck, seed }: { deck: PlayableDeck; seed?: number }) {
  const { recordTypingAttempt, stats } = useSession();
  const register = useAnimationRegistry();
  const feedbackRef = useRef<HTMLDivElement | null>(null);
  const summaryRef = useRef<HTMLDivElement | null>(null);
  const [attempt, setAttempt] = useState(0);
  const order = useMemo(
    () => buildFlashcardOrder(deck.entries, seededRng(seed ?? attempt)),
    [deck.entries, seed, attempt],
  );
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result>(null);
  const [ignoreAccents, setIgnoreAccents] = useState(true);

  const entry = order[Math.min(index, order.length - 1)];
  const finished = index >= order.length;

  // Feedback accent mirrors scoring; it can never delay or block the next step.
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

  function submit() {
    if (input.trim().length === 0) {
      setError(`Enter a ${languageName(deck.targetLanguage)} translation before submitting.`);
      setResult(null);
      return;
    }
    setError(null);
    const correct = matchesTranslation(input, entry, { ignoreAccents });
    recordTypingAttempt(correct);
    setResult(correct ? "correct" : "incorrect");
  }

  function next() {
    setIndex((value) => value + 1);
  }

  function playAgain() {
    setAttempt((value) => value + 1);
    setIndex(0);
  }

  if (finished) {
    return (
      <div ref={summaryRef}>
        <Panel className="stack summary">
          <h3>Typing complete</h3>
          <p className="muted">
            You typed {stats.typing.attempted} translations this session, {stats.typing.correct}{" "}
            of them correctly.
          </p>
          <div className="row">
            <Button variant="primary" onClick={playAgain}>
              Practice again
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
          Entry {index + 1} of {order.length}
        </span>
        <ProgressBar value={index} max={order.length} label={`${index} typed`} />
      </div>

      <Panel className="stack typing-prompt">
        <span className="label">{languageName(deck.sourceLanguage)}</span>
        <p className="flashcard-word">{entry.source}</p>
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
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            disabled={result !== null}
            aria-invalid={error !== null}
            autoComplete="off"
            spellCheck={false}
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

        {error ? (
          <p className="notice notice-error" role="alert">
            {error}
          </p>
        ) : null}

      {result !== null ? (
        <div className="stack" role="status" ref={feedbackRef}>
          <p className={result === "correct" ? "notice" : "notice notice-error"}>
              {result === "correct"
                ? "Correct."
                : `Not quite — accepted: ${acceptedAnswers(entry).join(", ")}`}
            </p>
            <div className="row">
              <Button variant="primary" type="submit">
                {index + 1 >= order.length ? "See results" : "Next entry"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="row">
            <Button variant="primary" onClick={submit}>
              Check answer
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
