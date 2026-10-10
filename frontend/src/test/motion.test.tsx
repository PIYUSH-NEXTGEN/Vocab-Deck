/**
 * Motion and accessibility behavior across all four game modes, run with
 * animations enabled and with prefers-reduced-motion. Scoring, announcements
 * and interactions must be identical in both; animation only ever accents.
 */

import { describe, expect, test, vi, afterEach, beforeEach } from "vitest";
import { fireEvent, render, screen, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MemoryRouter } from "react-router-dom";
import type { PlayableDeck } from "../api/types";
import { SessionProvider } from "../session/SessionProvider";
import { SessionStatsBar } from "../components/SessionStatsBar";
import { FlashcardsMode, AUTO_REVEAL_MS } from "../game/modes/FlashcardsMode";
import { QuizMode } from "../game/modes/QuizMode";
import { TypingMode } from "../game/modes/TypingMode";
import { MatchingMode } from "../game/modes/MatchingMode";
import { buildFlashcardOrder, buildQuizRounds, seededRng } from "../game/engine";
import { setReducedMotion } from "./setup";

const DECK: PlayableDeck = {
  id: "custom-motion",
  name: "Motion deck",
  description: "",
  sourceLanguage: "fr",
  targetLanguage: "en",
  entryCount: 3,
  origin: "custom",
  entries: [
    { id: "chien", source: "chien", target: "dog", alternatives: [], tags: [] },
    { id: "chat", source: "chat", target: "cat", alternatives: ["kitten"], tags: [] },
    { id: "cafe", source: "café", target: "coffee shop", alternatives: [], tags: [] },
  ],
};

afterEach(() => {
  vi.useRealTimers();
});

function renderMode(mode: React.ReactElement) {
  return render(
    <MemoryRouter>
      <SessionProvider>
        {mode}
        <SessionStatsBar />
      </SessionProvider>
    </MemoryRouter>,
  );
}

function sessionText() {
  return screen.getByLabelText("Session statistics").textContent ?? "";
}

describe.each([
  ["animations enabled", false],
  ["reduced motion", true],
])("game modes with %s", (_label, reduced) => {
  beforeEach(() => {
    setReducedMotion(reduced);
  });

  test("flashcards reveal, self-assess and announce accurately", async () => {
    const order = buildFlashcardOrder(DECK.entries, seededRng(1));
    renderMode(<FlashcardsMode deck={DECK} seed={1} />);

    expect(screen.getByText(order[0].source)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/translation hidden/i);

    fireEvent.click(screen.getByRole("button", { name: /reveal translation/i }));

    expect(screen.getByText(order[0].target)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      new RegExp(`translation of ${order[0].source}: ${order[0].target}`, "i"),
    );

    fireEvent.click(screen.getByRole("button", { name: /^known$/i }));
    expect(sessionText()).toContain("1 known / 0 practice");
  });

  test("flashcards auto-reveal timer is cleaned up on unmount", () => {
    vi.useFakeTimers();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = renderMode(<FlashcardsMode deck={DECK} seed={2} />);
    unmount();
    act(() => {
      vi.advanceTimersByTime(AUTO_REVEAL_MS * 3);
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test("quiz answers score once, announce feedback and work from the keyboard", async () => {
    const rounds = buildQuizRounds(DECK.entries, seededRng(0));
    renderMode(<QuizMode deck={DECK} seed={0} />);

    // Keyboard: tab to the first option, activate with Enter.
    const user = userEvent.setup();
    await user.tab();
    const firstOption = screen.getAllByRole("button", { name: rounds[0].options[0] })[0];
    expect(firstOption).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(firstOption).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: /submit answer/i }));
    // Feedback is announced.
    expect(screen.getByRole("status")).toHaveTextContent(/correct\.|not quite/i);

    // Submitting again is impossible: the submit control is gone.
    expect(screen.queryByRole("button", { name: /submit answer/i })).not.toBeInTheDocument();
    expect(sessionText()).toMatch(/1\/1|0\/1/);

    // Answering correctly scores exactly once.
    fireEvent.click(screen.getByRole("button", { name: /next question|see results/i }));
    const answer = rounds[1].answer;
    fireEvent.click(screen.getByRole("button", { name: answer }));
    fireEvent.click(screen.getByRole("button", { name: /submit answer/i }));
    expect(sessionText()).toMatch(/^Quiz\d\/\d/);
    const answered = Number(sessionText().match(/Quiz(\d)\/(\d)/)![2]);
    expect(answered).toBe(2);
  });

  test("quiz interaction is never blocked by feedback animation", async () => {
    renderMode(<QuizMode deck={DECK} seed={0} />);
    const user = userEvent.setup();
    const firstOption = screen.getAllByRole("button")[0];
    fireEvent.click(firstOption);
    // Immediately submit and advance without waiting for any animation.
    fireEvent.click(screen.getByRole("button", { name: /submit answer/i }));
    fireEvent.click(screen.getByRole("button", { name: /next question|see results/i }));
    expect(await screen.findByText(/question 2 of 3/i)).toBeInTheDocument();
    void user;
  });

  test("typing validates empty input, accepts alternatives and announces results", () => {
    renderMode(<TypingMode deck={DECK} seed={0} />);

    fireEvent.click(screen.getByRole("button", { name: /check answer/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/enter a english translation/i);
    expect(sessionText()).toMatch(/no session activity|session activity will appear/i);

    const entry = buildFlashcardOrder(DECK.entries, seededRng(0))[0];
    fireEvent.change(screen.getByRole("textbox"), { target: { value: entry.target } });
    fireEvent.click(screen.getByRole("button", { name: /check answer/i }));
    expect(screen.getByRole("status")).toHaveTextContent(/correct\./i);
    expect(sessionText()).toContain("1/1");
  });

  test("matching selections, completed pairs and announcements behave", () => {
    renderMode(<MatchingMode deck={DECK} seed={0} />);

    const columns = screen.getAllByRole("list");
    const left = within(columns[0]).getAllByRole("button");
    const right = within(columns[1]).getAllByRole("button");
    const first = left[0];
    const correctTarget = DECK.entries.find((e) => e.source === first.textContent)!.target;
    const correct = right.find((b) => b.textContent === correctTarget)!;
    const wrong = right.find((b) => b.textContent !== correctTarget)!;

    // Selection is visible and reversible.
    fireEvent.click(first);
    expect(first).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(first);
    expect(first).toHaveAttribute("aria-pressed", "false");

    // Wrong pair: scored, not completed, announced.
    fireEvent.click(first);
    fireEvent.click(wrong);
    expect(screen.getByText(/not a pair/i)).toBeInTheDocument();
    expect(sessionText()).toContain("0 pairs / 1 attempts");

    // Correct pair: completed and locked.
    fireEvent.click(first);
    fireEvent.click(correct);
    expect(screen.getByText(/paired\./i)).toBeInTheDocument();
    expect(sessionText()).toContain("1 pairs / 2 attempts");
    expect(first).toBeDisabled();
    fireEvent.click(first); // locked: no further scoring
    expect(sessionText()).toContain("1 pairs / 2 attempts");
    expect(screen.getByText(/pairs completed: 1 of 3/i)).toBeInTheDocument();
  });

  test("session completion renders for every mode", () => {
    const single: PlayableDeck = { ...DECK, entries: [DECK.entries[0]] };
    const views = renderMode(<FlashcardsMode deck={single} seed={0} />);
    fireEvent.click(screen.getByRole("button", { name: /reveal translation/i }));
    fireEvent.click(screen.getByRole("button", { name: /^known$/i }));
    expect(screen.getByRole("heading", { name: /deck finished/i })).toBeInTheDocument();
    views.unmount();

    const quiz = renderMode(<QuizMode deck={single} />);
    expect(screen.getByRole("heading", { name: /not enough distinct translations/i })).toBeInTheDocument();
    quiz.unmount();

    const typing = renderMode(<TypingMode deck={single} seed={0} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "dog" } });
    fireEvent.click(screen.getByRole("button", { name: /check answer/i }));
    fireEvent.click(screen.getByRole("button", { name: /see results/i }));
    expect(screen.getByRole("heading", { name: /typing complete/i })).toBeInTheDocument();
    typing.unmount();

    const twoEntry: PlayableDeck = { ...DECK, entries: DECK.entries.slice(0, 2) };
    renderMode(<MatchingMode deck={twoEntry} seed={0} />);
    const columns = screen.getAllByRole("list");
    for (const source of within(columns[0]).getAllByRole("button")) {
      const targetText = DECK.entries.find((e) => e.source === source.textContent)!.target;
      const target = within(columns[1])
        .getAllByRole("button")
        .find((b) => b.textContent === targetText)!;
      fireEvent.click(source);
      fireEvent.click(target);
    }
    expect(screen.getByRole("heading", { name: /all pairs matched/i })).toBeInTheDocument();
  });
});

test("the reduced-motion stylesheet disables transforms and animations", () => {
  const css = readFileSync(resolve(process.cwd(), "src/styles/motion.css"), "utf8");
  expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  expect(css).toMatch(/transform: none/);
  expect(css).toMatch(/animation: none/);
});
