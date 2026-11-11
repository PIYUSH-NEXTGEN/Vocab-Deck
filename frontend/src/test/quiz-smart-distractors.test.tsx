import { useState } from "react";
import { describe, expect, test } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { PlayableDeck } from "../api/types";
import { SessionProvider } from "../session/SessionProvider";
import { useSession } from "../session/useSession";
import { SessionStatsBar } from "../components/SessionStatsBar";
import { QuizMode } from "../game/modes/QuizMode";
import { MatchingMode } from "../game/modes/MatchingMode";
import { buildQuizRounds, seededRng } from "../game/engine";
import { getPairConfusionCount } from "../game/distractors";

const SMART_DECK: PlayableDeck = {
  id: "smart-quiz-test",
  name: "Smart Quiz Deck",
  description: "Test deck with phonetic/orthographic lookalikes and distinct distractors",
  sourceLanguage: "de",
  targetLanguage: "en",
  entryCount: 6,
  origin: "custom",
  entries: [
    { id: "haus", source: "das Haus", target: "house", alternatives: [], tags: ["noun"] },
    { id: "maus", source: "die Maus", target: "mouse", alternatives: [], tags: ["noun"] },
    { id: "laus", source: "die Laus", target: "louse", alternatives: [], tags: ["noun"] },
    { id: "hose", source: "die Hose", target: "trouser", alternatives: [], tags: ["noun"] },
    {
      id: "kuhlschrank",
      source: "der Kühlschrank",
      target: "refrigerator appliance",
      alternatives: [],
      tags: ["noun"],
    },
    {
      id: "spazieren",
      source: "spazieren gehen",
      target: "to go out for a long evening walk",
      alternatives: [],
      tags: ["verb"],
    },
  ],
};

function renderInSession(ui: React.ReactElement) {
  return render(
    <MemoryRouter>
      <SessionProvider>
        {ui}
        <SessionStatsBar />
      </SessionProvider>
    </MemoryRouter>,
  );
}

describe("QuizMode smart distractors & confusion engine", () => {
  test("displays Distractor difficulty control and changes distractors across difficulty tiers", () => {
    renderInSession(<QuizMode deck={SMART_DECK} seed={2} />);

    const group = screen.getByRole("group", { name: "Distractor difficulty" });
    expect(within(group).getByRole("button", { name: /Adaptive/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // Switch to Standard (broad contrast favors distant long translations for short target "house")
    fireEvent.click(within(group).getByRole("button", { name: /Standard/i }));
    expect(within(group).getByRole("button", { name: /Standard/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // Question rounds at challenging difficulty include close lookalikes on house
    const challengingRounds = buildQuizRounds(
      SMART_DECK.entries,
      seededRng(2),
      6,
      [SMART_DECK.entries[0]],
      { difficulty: "challenging" },
    );
    expect(challengingRounds[0].options).toContain("mouse");
    expect(challengingRounds[0].options).toContain("louse");
  });

  test("shows diagnostic confusion insight only after wrong submission and keeps session in memory", () => {
    const initialStorageKeys = Object.keys(localStorage);
    const rounds = buildQuizRounds(SMART_DECK.entries, seededRng(0), 6, undefined, {
      difficulty: "adaptive",
    });

    renderInSession(<QuizMode deck={SMART_DECK} seed={0} />);

    // Insight must not spoil choices prior to submitting
    expect(screen.queryByText(/You chose/i)).not.toBeInTheDocument();

    const wrongOption = rounds[0].options.find((opt) => opt !== rounds[0].answer)!;
    fireEvent.click(screen.getByRole("button", { name: wrongOption }));
    fireEvent.click(screen.getByRole("button", { name: /submit answer/i }));

    expect(screen.getByText(/You chose/i)).toBeInTheDocument();
    expect(screen.getByText(/confused 1× this session/i)).toBeInTheDocument();

    // Verify strictly in-memory state (no localStorage side effects)
    expect(Object.keys(localStorage)).toEqual(initialStorageKeys);
  });

  test("cross-mode confusion from Matching surfaces in Quiz summary and targeted confusion review", () => {
    function CrossModeHarness() {
      const [mode, setMode] = useState<"matching" | "quiz">("matching");
      return (
        <div>
          <button type="button" onClick={() => setMode("quiz")}>
            Switch to Quiz
          </button>
          {mode === "matching" ? (
            <MatchingMode deck={SMART_DECK} seed={1} />
          ) : (
            <QuizMode deck={SMART_DECK} seed={1} />
          )}
        </div>
      );
    }

    renderInSession(<CrossModeHarness />);

    // Cause a deliberate pair mismatch in Matching mode
    const lists = screen.getAllByRole("list");
    const leftButtons = within(lists[0]).getAllByRole("button");
    const rightButtons = within(lists[1]).getAllByRole("button");
    const firstLeft = leftButtons[0];
    const matchedEntry = SMART_DECK.entries.find((e) => e.source === firstLeft.textContent)!;
    const wrongRight = rightButtons.find((b) => b.textContent !== matchedEntry.target)!;

    fireEvent.click(firstLeft);
    fireEvent.click(wrongRight);
    expect(screen.getByText(/not a pair/i)).toBeInTheDocument();

    // Switch to Quiz within the same session
    fireEvent.click(screen.getByRole("button", { name: "Switch to Quiz" }));

    // Complete all 6 questions cleanly so we inspect Quiz summary
    const expectedRounds = buildQuizRounds(SMART_DECK.entries, seededRng(1));
    for (let i = 0; i < expectedRounds.length; i += 1) {
      const answerBtn = screen.getByRole("button", { name: expectedRounds[i].answer });
      fireEvent.click(answerBtn);
      fireEvent.click(screen.getByRole("button", { name: /submit answer/i }));
      fireEvent.click(screen.getByRole("button", { name: /next question|see results/i }));
    }

    expect(screen.getByText(/Confusable word pairs this session \(1\):/i)).toBeInTheDocument();
    expect(screen.getByText(/1× \(Matching\)/i)).toBeInTheDocument();

    // Launch Practice Confused Words from summary
    const practiceBtn = screen.getByRole("button", { name: /Practice Confused Words \(2\)/i });
    fireEvent.click(practiceBtn);

    expect(screen.getByText(/Review Question 1 of 2/i)).toBeInTheDocument();
  });

  test("confusion history is scoped per deck even when entry ids are reused", () => {
    function Probe() {
      const { confusionMatrix, recordQuizAnswer } = useSession();
      return (
        <div>
          <button
            type="button"
            onClick={() => recordQuizAnswer(false, "water", "bread", "en-fr")}
          >
            Record French confusion
          </button>
          <output data-testid="confusions-en-fr">
            {getPairConfusionCount(confusionMatrix, "en-fr", "water", "bread")}
          </output>
          <output data-testid="confusions-en-de">
            {getPairConfusionCount(confusionMatrix, "en-de", "water", "bread")}
          </output>
        </div>
      );
    }

    renderInSession(<Probe />);
    fireEvent.click(screen.getByRole("button", { name: "Record French confusion" }));

    // en-fr and en-de reuse the entry ids "water"/"bread", but only en-fr recorded a mistake.
    expect(screen.getByTestId("confusions-en-fr")).toHaveTextContent("1");
    expect(screen.getByTestId("confusions-en-de")).toHaveTextContent("0");
  });

  test("does not surface another deck's confusions when entry ids are reused", () => {
    const frenchDeck: PlayableDeck = {
      id: "scope-fr",
      name: "French",
      description: "Shared ids, French translations",
      sourceLanguage: "en",
      targetLanguage: "fr",
      entryCount: 2,
      origin: "custom",
      entries: [
        { id: "water", source: "water", target: "eau", alternatives: [], tags: ["noun"] },
        { id: "bread", source: "bread", target: "pain", alternatives: [], tags: ["noun"] },
      ],
    };
    const germanDeck: PlayableDeck = {
      id: "scope-de",
      name: "German",
      description: "The same entry ids with different German translations",
      sourceLanguage: "en",
      targetLanguage: "de",
      entryCount: 2,
      origin: "custom",
      entries: [
        { id: "water", source: "water", target: "Wasser", alternatives: [], tags: ["noun"] },
        { id: "bread", source: "bread", target: "Brot", alternatives: [], tags: ["noun"] },
      ],
    };

    function DeckSwitchHarness() {
      const [deck, setDeck] = useState(frenchDeck);
      return (
        <div>
          <button type="button" onClick={() => setDeck(germanDeck)}>
            Switch deck
          </button>
          <QuizMode key={deck.id} deck={deck} seed={5} />
        </div>
      );
    }

    renderInSession(<DeckSwitchHarness />);

    // Make a mistake in the French deck, recording a confusion for "water"/"bread".
    const frenchRounds = buildQuizRounds(frenchDeck.entries, seededRng(5));
    const wrongFrenchOption = screen
      .getAllByRole("button")
      .find(
        (button) =>
          frenchRounds[0].options.includes(button.textContent ?? "") &&
          button.textContent !== frenchRounds[0].answer,
      );
    expect(wrongFrenchOption).toBeDefined();
    fireEvent.click(wrongFrenchOption!);
    fireEvent.click(screen.getByRole("button", { name: /submit answer/i }));

    // The German deck reuses the same ids; its summary must not inherit that confusion.
    fireEvent.click(screen.getByRole("button", { name: "Switch deck" }));
    const germanRounds = buildQuizRounds(germanDeck.entries, seededRng(5));
    for (let i = 0; i < germanRounds.length; i += 1) {
      fireEvent.click(screen.getByRole("button", { name: germanRounds[i].answer }));
      fireEvent.click(screen.getByRole("button", { name: /submit answer/i }));
      fireEvent.click(screen.getByRole("button", { name: /next question|see results/i }));
    }

    expect(screen.getByRole("heading", { name: "Quiz complete" })).toBeInTheDocument();
    expect(screen.queryByText(/Confusable word pairs this session/i)).not.toBeInTheDocument();
  });

  test("session Restart clears confusion history completely", () => {
    renderInSession(<QuizMode deck={SMART_DECK} seed={3} />);

    const rounds = buildQuizRounds(SMART_DECK.entries, seededRng(3));
    for (let i = 0; i < rounds.length; i += 1) {
      const opt = i === 0 ? rounds[i].options.find((o) => o !== rounds[i].answer)! : rounds[i].answer;
      fireEvent.click(screen.getByRole("button", { name: opt }));
      fireEvent.click(screen.getByRole("button", { name: /submit answer/i }));
      fireEvent.click(screen.getByRole("button", { name: /next question|see results/i }));
    }

    expect(screen.getByText(/Confusable word pairs this session/i)).toBeInTheDocument();

    // Trigger explicit session restart from SessionStatsBar
    fireEvent.click(screen.getByRole("button", { name: /restart session/i }));

    // Session stats reset cleanly; next complete round has no leftover confusable pairs
    expect(screen.queryByText(/Confusable word pairs this session/i)).not.toBeInTheDocument();
  });
});
