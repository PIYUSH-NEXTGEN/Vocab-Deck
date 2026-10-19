import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { PlayableDeck } from "../api/types";
import { SessionProvider } from "../session/SessionProvider";
import { TypingMode } from "../game/modes/TypingMode";

const TEST_DECK: PlayableDeck = {
  id: "typing-test-deck",
  name: "Typing Test Deck",
  description: "Testing typo tolerance and Damerau-Levenshtein engine",
  sourceLanguage: "en",
  targetLanguage: "fr",
  entryCount: 2,
  origin: "builtin",
  entries: [
    { id: "apple", source: "apple", target: "pomme", alternatives: [], tags: [] },
    { id: "dog", source: "dog", target: "chien", alternatives: [], tags: [] },
  ],
};

function renderWithSession(ui: React.ReactElement) {
  return render(<SessionProvider>{ui}</SessionProvider>);
}

describe("TypingMode typo tolerance with Damerau-Levenshtein", () => {
  test("renders typo tolerance checkbox checked by default", () => {
    renderWithSession(<TypingMode deck={TEST_DECK} seed={42} />);
    const checkbox = screen.getByRole("checkbox", { name: /typo tolerance/i });
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).toBeChecked();
  });

  test("accepts a near-miss typo when typo tolerance is enabled and displays helpful notice", () => {
    renderWithSession(<TypingMode deck={TEST_DECK} seed={42} />);

    const input = screen.getByPlaceholderText("Type the translation");
    // "pome" has distance 1 from "pomme" (length 5 >= 4)
    fireEvent.change(input, { target: { value: "pome" } });
    fireEvent.click(screen.getByRole("button", { name: /check answer/i }));

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(/Almost! Accepted with typo: you typed "pome", correct spelling is "pomme"/i);
  });

  test("rejects the same near-miss typo when typo tolerance is toggled off (strict mode)", () => {
    renderWithSession(<TypingMode deck={TEST_DECK} seed={42} />);

    // Uncheck typo tolerance
    const toleranceCheckbox = screen.getByRole("checkbox", { name: /typo tolerance/i });
    fireEvent.click(toleranceCheckbox);
    expect(toleranceCheckbox).not.toBeChecked();

    const input = screen.getByPlaceholderText("Type the translation");
    fireEvent.change(input, { target: { value: "pome" } });
    fireEvent.click(screen.getByRole("button", { name: /check answer/i }));

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(/Not quite\. Accepted: pomme/i);
  });

  test("displays accepted typos in round summary breakdown", () => {
    renderWithSession(<TypingMode deck={TEST_DECK} seed={42} />);

    // Word 1: type with near-miss "pome" -> accepted with typo
    const input1 = screen.getByPlaceholderText("Type the translation");
    fireEvent.change(input1, { target: { value: "pome" } });
    fireEvent.click(screen.getByRole("button", { name: /check answer/i }));
    fireEvent.click(screen.getByRole("button", { name: /next entry/i }));

    // Word 2: type with exact match "chien"
    const input2 = screen.getByPlaceholderText("Type the translation");
    fireEvent.change(input2, { target: { value: "chien" } });
    fireEvent.click(screen.getByRole("button", { name: /check answer/i }));
    fireEvent.click(screen.getByRole("button", { name: /see results/i }));

    // Summary screen
    expect(screen.getByRole("heading", { name: /typing complete/i })).toBeInTheDocument();
    expect(screen.getByText(/Minor typos accepted \(1\):/i)).toBeInTheDocument();
    expect(screen.getByText(/apple/i)).toBeInTheDocument();
    expect(screen.getByText(/"pome"/i)).toBeInTheDocument();
    expect(screen.getByText(/Exact matches \(1\):/i)).toBeInTheDocument();
    expect(screen.getByText(/dog/i)).toBeInTheDocument();
  });

  test("renders character-level traceback diff panel and explanation on near-miss", () => {
    renderWithSession(<TypingMode deck={TEST_DECK} seed={42} />);

    const input = screen.getByPlaceholderText("Type the translation");
    // "pome" has missing letter "m" compared to "pomme"
    fireEvent.change(input, { target: { value: "pome" } });
    fireEvent.click(screen.getByRole("button", { name: /check answer/i }));

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(/Almost! Accepted with typo/i);
    expect(status).toHaveTextContent(/Missing letter 'm'/i);
    expect(status).toHaveTextContent(/You typed:/i);
    expect(status).toHaveTextContent(/Expected:/i);
  });

  test("displays separate session stat counts for exact, near-miss, and incorrect answers", () => {
    renderWithSession(<TypingMode deck={TEST_DECK} seed={42} />);

    // Word 1: near-miss typo "pome"
    const input1 = screen.getByPlaceholderText("Type the translation");
    fireEvent.change(input1, { target: { value: "pome" } });
    fireEvent.click(screen.getByRole("button", { name: /check answer/i }));
    fireEvent.click(screen.getByRole("button", { name: /next entry/i }));

    // Word 2: completely wrong "chat"
    const input2 = screen.getByPlaceholderText("Type the translation");
    fireEvent.change(input2, { target: { value: "chat" } });
    fireEvent.click(screen.getByRole("button", { name: /check answer/i }));
    fireEvent.click(screen.getByRole("button", { name: /see results/i }));

    // Summary screen stats
    expect(screen.getByText(/^Exact Matches$/i)).toBeInTheDocument();
    expect(screen.getByText(/^Near-Misses$/i)).toBeInTheDocument();
    expect(screen.getByText(/^Incorrect$/i)).toBeInTheDocument();
    expect(screen.getByText(/You typed 2 translations this round: 0 exact matches, 1 near-misses, 1 incorrect\./i)).toBeInTheDocument();
  });

  test("toggles between Forgiving and Strict modes via SegmentedControl buttons", () => {
    renderWithSession(<TypingMode deck={TEST_DECK} seed={42} />);

    const strictBtn = screen.getByRole("button", { name: /^Strict/i });
    const forgivingBtn = screen.getByRole("button", { name: /^Forgiving/i });

    expect(forgivingBtn).toHaveAttribute("aria-pressed", "true");
    expect(strictBtn).toHaveAttribute("aria-pressed", "false");

    // Click Strict button
    fireEvent.click(strictBtn);
    expect(strictBtn).toHaveAttribute("aria-pressed", "true");
    expect(forgivingBtn).toHaveAttribute("aria-pressed", "false");

    // In Strict mode, typos are rejected
    const input = screen.getByPlaceholderText("Type the translation");
    fireEvent.change(input, { target: { value: "pome" } });
    fireEvent.click(screen.getByRole("button", { name: /check answer/i }));

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(/Not quite\. Accepted: pomme/i);
  });

  test("maintains session results strictly in memory without writing to localStorage", () => {
    window.localStorage.clear();
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

    renderWithSession(<TypingMode deck={TEST_DECK} seed={42} />);

    const input1 = screen.getByPlaceholderText("Type the translation");
    fireEvent.change(input1, { target: { value: "pomme" } });
    fireEvent.click(screen.getByRole("button", { name: /check answer/i }));
    fireEvent.click(screen.getByRole("button", { name: /next entry/i }));

    const input2 = screen.getByPlaceholderText("Type the translation");
    fireEvent.change(input2, { target: { value: "chien" } });
    fireEvent.click(screen.getByRole("button", { name: /check answer/i }));
    fireEvent.click(screen.getByRole("button", { name: /see results/i }));

    expect(screen.getByRole("heading", { name: /typing complete/i })).toBeInTheDocument();

    // No local storage items were written for typing session state
    const savedKeys = Object.keys(window.localStorage);
    expect(savedKeys.filter((k) => k.includes("typing") || k.includes("evaluation"))).toHaveLength(0);

    setItemSpy.mockRestore();
  });
});

