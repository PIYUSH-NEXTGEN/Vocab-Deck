import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlayableDeck } from "../../api/types";
import { buildFlashcardOrder } from "../engine";
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
 * configured alternative translations are accepted. Empty input is rejected
 * before any scoring happens.
 */
export function TypingMode({ deck, seed }: { deck: PlayableDeck; seed?: number }) {
  const { recordTypingAttempt, stats } = useSession();
  const register = useAnimationRegistry();
  const feedbackRef = useRef<HTMLDivElement | null>(null);
  const summaryRef = useRef<HTMLDivElement | null>(null);
  const { rng, reshuffle } = useSessionSeed(seed);
  const fullOrder = useMemo(
    () => buildFlashcardOrder(deck.entries, rng),
    [deck.entries, rng],
  );
  const [roundSize, setRoundSize] = useState(() => Math.min(fullOrder.length, MAX_ROUND));
  const [sizeInput, setSizeInput] = useState(() => String(Math.min(fullOrder.length, MAX_ROUND)));
  const maxRound = Math.min(fullOrder.length, MAX_ROUND);
  const order = useMemo(() => fullOrder.slice(0, Math.min(roundSize, maxRound)), [fullOrder, roundSize, maxRound]);
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

  const changeRoundSize = useCallback(
    (next: number) => {
      setRoundSize(next);
      setSizeInput(String(next));
      reshuffle();
      setIndex(0);
      setError(null);
      setResult(null);
    },
    [],
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
    recordTypingAttempt(correct);
    setResult(correct ? "correct" : "incorrect");
  }

  function next() {
    setIndex((value) => value + 1);
  }

  function playAgain() {
    reshuffle();
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
      <div className="row row-space round-controls">
        <span className="label">
          Entry {index + 1} of {order.length}
        </span>
        <RoundSizeField
          id="typing-round-size"
          label="Entries this round"
          max={maxRound}
          value={sizeInput}
          onChange={setSizeInput}
          onCommit={commitRoundSize}
        />
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
        </div>
      </form>
    </div>
  );
}
