import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { PlayableDeck } from "../api/types";
import { SessionProvider } from "../session/SessionProvider";
import { FlashcardsMode } from "../game/modes/FlashcardsMode";
import { QuizMode } from "../game/modes/QuizMode";
import { TypingMode } from "../game/modes/TypingMode";

const TEST_DECK: PlayableDeck = {
  id: "test-deck",
  name: "Vocabulary Test Deck",
  description: "Testing spaced repetition and mistakes queue",
  sourceLanguage: "en",
  targetLanguage: "fr",
  entryCount: 2,
  origin: "builtin",
  entries: [
    { id: "dog", source: "dog", target: "chien", alternatives: [], tags: [] },
    { id: "cat", source: "cat", target: "chat", alternatives: [], tags: [] },
  ],
};

function renderWithSession(ui: React.ReactElement) {
  return render(<SessionProvider>{ui}</SessionProvider>);
}

describe("FlashcardsMode spaced repetition & mistake review", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("tracks missed cards and enables dedicated mistake review round", () => {
    renderWithSession(<FlashcardsMode deck={TEST_DECK} seed={1} />);

    // Card 1: Reveal and mark as needs practice
    fireEvent.click(screen.getByRole("button", { name: /reveal translation/i }));
    fireEvent.click(screen.getByRole("button", { name: /needs practice/i }));

    // Card 2: Reveal and mark as known
    fireEvent.click(screen.getByRole("button", { name: /reveal translation/i }));
    fireEvent.click(screen.getByRole("button", { name: /known/i }));

    // Round should now be finished
    expect(screen.getByRole("heading", { name: /deck finished/i })).toBeInTheDocument();
    expect(screen.getByText(/1 marked known, 1 needing practice/i)).toBeInTheDocument();
    expect(screen.getByText(/words needing practice \(1\)/i)).toBeInTheDocument();

    // Verify Review Missed Words button is present and starts a focused round
    const reviewBtn = screen.getByRole("button", { name: /review missed words \(1\)/i });
    expect(reviewBtn).toBeInTheDocument();
    fireEvent.click(reviewBtn);

    // Now in review round with only 1 card
    expect(screen.getByText(/reviewing card 1 of 1/i)).toBeInTheDocument();

    // Review card: Reveal and mark known
    fireEvent.click(screen.getByRole("button", { name: /reveal translation/i }));
    fireEvent.click(screen.getByRole("button", { name: /known/i }));

    // Review round completed with all known
    expect(screen.getByRole("heading", { name: /review round finished/i })).toBeInTheDocument();
    expect(screen.getByText(/all reviewed cards were marked as known/i)).toBeInTheDocument();
  });

  test("keyboard navigation: space reveals card and number keys assess", () => {
    renderWithSession(<FlashcardsMode deck={TEST_DECK} seed={1} />);

    // Space key to reveal
    fireEvent.keyDown(window, { key: " " });
    expect(screen.getByRole("button", { name: /needs practice/i })).toBeInTheDocument();

    // Key '1' to assess needs practice
    fireEvent.keyDown(window, { key: "1" });

    // Next card should now be unrevealed
    expect(screen.getByRole("button", { name: /reveal translation/i })).toBeInTheDocument();

    // Enter key to reveal
    fireEvent.keyDown(window, { key: "Enter" });
    expect(screen.getByRole("button", { name: /known/i })).toBeInTheDocument();

    // Key '2' to assess known
    fireEvent.keyDown(window, { key: "2" });

    // Round finished
    expect(screen.getByRole("heading", { name: /deck finished/i })).toBeInTheDocument();
  });

  test("toggles spaced repetition adaptive ordering button", () => {
    renderWithSession(<FlashcardsMode deck={TEST_DECK} seed={1} />);
    const orderToggle = screen.getByRole("button", { name: /random order/i });
    expect(orderToggle).toBeInTheDocument();

    fireEvent.click(orderToggle);
    expect(screen.getByRole("button", { name: /spaced repetition/i })).toBeInTheDocument();
  });
});

describe("QuizMode mistake review & keyboard selection", () => {
  test("allows reviewing missed quiz questions", () => {
    const { container } = renderWithSession(<QuizMode deck={TEST_DECK} seed={2} />);

    // Question 1: Select wrong option and submit
    const options = container.querySelectorAll<HTMLButtonElement>(".option");
    const wrongOption = Array.from(options).find((btn) => !btn.textContent?.includes("chien")) ?? options[0];
    fireEvent.click(wrongOption);
    fireEvent.click(screen.getByRole("button", { name: /submit answer/i }));
    fireEvent.click(screen.getByRole("button", { name: /next question/i }));

    // Question 2: Select any option and submit to finish
    const options2 = container.querySelectorAll<HTMLButtonElement>(".option");
    fireEvent.click(options2[0]);
    fireEvent.click(screen.getByRole("button", { name: /submit answer/i }));
    fireEvent.click(screen.getByRole("button", { name: /see results/i }));

    // Summary screen
    expect(screen.getByRole("heading", { name: /quiz complete/i })).toBeInTheDocument();
    const reviewBtn = screen.queryByRole("button", { name: /review missed questions/i });
    if (reviewBtn) {
      fireEvent.click(reviewBtn);
      expect(screen.getByText(/review question 1 of/i)).toBeInTheDocument();
    }
  });

  test("keyboard shortcuts 1-2 select quiz options and Enter submits/advances", () => {
    const { container } = renderWithSession(<QuizMode deck={TEST_DECK} seed={3} />);

    // Press '1' to select first option
    fireEvent.keyDown(window, { key: "1" });
    const option1 = container.querySelectorAll(".option")[0];
    expect(option1).toHaveClass("is-selected");

    // Press Enter to submit
    fireEvent.keyDown(window, { key: "Enter" });
    expect(screen.getByRole("button", { name: /next question/i })).toBeInTheDocument();

    // Press Enter to advance
    fireEvent.keyDown(window, { key: "Enter" });
    expect(screen.getByText(/question 2 of 2/i)).toBeInTheDocument();
  });
});

describe("TypingMode mistake review", () => {
  test("tracks mistakes and offers targeted review round", () => {
    renderWithSession(<TypingMode deck={TEST_DECK} seed={4} />);

    // Entry 1: Type wrong answer
    const input = screen.getByPlaceholderText(/type the translation/i);
    fireEvent.change(input, { target: { value: "incorrect_word" } });
    fireEvent.click(screen.getByRole("button", { name: /check answer/i }));
    fireEvent.click(screen.getByRole("button", { name: /next entry/i }));

    // Entry 2: Type wrong answer to finish
    const input2 = screen.getByPlaceholderText(/type the translation/i);
    fireEvent.change(input2, { target: { value: "wrong_again" } });
    fireEvent.click(screen.getByRole("button", { name: /check answer/i }));
    fireEvent.click(screen.getByRole("button", { name: /see results/i }));

    // Finished screen
    expect(screen.getByRole("heading", { name: /typing complete/i })).toBeInTheDocument();
    const reviewBtn = screen.getByRole("button", { name: /review missed words \(2\)/i });
    expect(reviewBtn).toBeInTheDocument();

    fireEvent.click(reviewBtn);
    expect(screen.getByText(/review entry 1 of 2/i)).toBeInTheDocument();
  });
});
