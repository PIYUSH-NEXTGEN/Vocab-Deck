import { describe, expect, test, vi, afterEach, beforeEach } from "vitest";
import { fireEvent, render, screen, within, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { PlayableDeck } from "../api/types";
import { SessionProvider } from "../session/SessionProvider";
import { useSession } from "../session/useSession";
import { SessionStatsBar } from "../components/SessionStatsBar";
import { FlashcardsMode, AUTO_REVEAL_MS } from "../game/modes/FlashcardsMode";
import { QuizMode } from "../game/modes/QuizMode";
import { TypingMode } from "../game/modes/TypingMode";
import { MatchingMode } from "../game/modes/MatchingMode";
import { buildFlashcardOrder, buildQuizRounds, seededRng } from "../game/engine";

const DECK: PlayableDeck = {
  id: "fr-en-test",
  name: "Test deck",
  description: "",
  sourceLanguage: "fr",
  targetLanguage: "en",
  entryCount: 3,
  origin: "builtin",
  entries: [
    { id: "chien", source: "chien", target: "dog", alternatives: [], tags: [] },
    { id: "chat", source: "chat", target: "cat", alternatives: ["kitten"], tags: [] },
    { id: "cafe", source: "espresso", target: "café", alternatives: ["coffee shop"], tags: [] },
  ],
};

const JP_DECK: PlayableDeck = {
  id: "de-ja-test",
  name: "Test deck",
  description: "",
  sourceLanguage: "de",
  targetLanguage: "ja",
  entryCount: 3,
  origin: "builtin",
  entries: [
    { id: "hund", source: "Hund", target: "犬", alternatives: ["いぬ"], tags: [] },
    { id: "katze", source: "Katze", target: "猫", alternatives: [], tags: [] },
    { id: "brot", source: "Brot", target: "パン", alternatives: [], tags: [] },
  ],
};

const DUP_DECK: PlayableDeck = {
  ...DECK,
  id: "dup",
  entries: [
    { id: "parle", source: "parle", target: "speak", alternatives: [], tags: [] },
    { id: "parle-a", source: "parlé", target: "speak", alternatives: [], tags: [] },
    { id: "chien", source: "chien", target: "dog", alternatives: [], tags: [] },
    { id: "chat", source: "chat", target: "cat", alternatives: [], tags: [] },
  ],
};

const PRISTINE = /no session activity|session activity will appear here/i;

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

/** Reads the live session stats (the bar renders them). */
function sessionText() {
  return screen.getByLabelText("Session statistics").textContent ?? "";
}

afterEach(() => {
  vi.useRealTimers();
});

/* ---------------- Flashcards ---------------- */

describe("FlashcardsMode", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  test("shows the source word and auto-reveals the translation after 3s", () => {
    const order = buildFlashcardOrder(DECK.entries, seededRng(1));
    const { container } = renderMode(<FlashcardsMode deck={DECK} seed={1} />);

    expect(screen.getByText(order[0].source)).toBeInTheDocument();
    const flip = container.querySelector(".flashcard-flip")!;
    expect(flip).not.toHaveClass("is-revealed");

    act(() => {
      vi.advanceTimersByTime(AUTO_REVEAL_MS);
    });

    expect(flip).toHaveClass("is-revealed");
    expect(screen.getByText(order[0].target)).toBeInTheDocument();
  });

  test("manual reveal shows the translation immediately", () => {
    const order = buildFlashcardOrder(DECK.entries, seededRng(2));
    const { container } = renderMode(<FlashcardsMode deck={DECK} seed={2} />);

    fireEvent.click(screen.getByRole("button", { name: /reveal translation/i }));
    const flip = container.querySelector(".flashcard-flip")!;
    expect(flip).toHaveClass("is-revealed");
    expect(screen.getByText(order[0].target)).toBeInTheDocument();
  });

  test("known / needs practice buttons advance and are tallied in the session", () => {
    const order = buildFlashcardOrder(DECK.entries, seededRng(3));
    renderMode(<FlashcardsMode deck={DECK} seed={3} />);

    fireEvent.click(screen.getByRole("button", { name: /reveal translation/i }));
    fireEvent.click(screen.getByRole("button", { name: /^known$/i }));
    expect(sessionText()).toContain("1 known / 0 practice");
    expect(screen.getByText(order[1].source)).toBeInTheDocument();
    expect(screen.getByText(/card 2 of 3/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /reveal translation/i }));
    fireEvent.click(screen.getByRole("button", { name: /needs practice/i }));
    expect(sessionText()).toContain("1 known / 1 practice");
  });

  test("the auto-reveal timer is cleaned up on unmount (mode switch)", () => {
    const clearSpy = vi.spyOn(window, "clearTimeout");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = renderMode(<FlashcardsMode deck={DECK} seed={4} />);

    unmount();
    act(() => {
      vi.advanceTimersByTime(AUTO_REVEAL_MS * 2);
    });

    expect(clearSpy).toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test("round size can be chosen from 1 to the deck length (max 25)", async () => {
    const big: PlayableDeck = {
      ...DECK,
      entryCount: 30,
      entries: Array.from({ length: 30 }, (_, i) => ({
        id: `w${i}`,
        source: `word${i}`,
        target: `translation${i}`,
        alternatives: [],
        tags: [],
      })),
    };
    renderMode(<FlashcardsMode deck={big} seed={1} />);

    const input = screen.getByLabelText(/cards this round/i) as HTMLInputElement;
    // Capped at 25, defaulting to the cap.
    expect(input.value).toBe("25");
    expect(input.max).toBe("25");
    expect(screen.getByText(/card 1 of 25/i)).toBeInTheDocument();

    // A valid number inside the range starts a new round.
    fireEvent.change(input, { target: { value: "3" } });
    fireEvent.blur(input);
    expect(input.value).toBe("3");
    expect(screen.getByText(/card 1 of 3/i)).toBeInTheDocument();

    // Out-of-range values revert to the previous size instead of breaking.
    fireEvent.change(input, { target: { value: "26" } });
    fireEvent.blur(input);
    expect(input.value).toBe("3");

    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.blur(input);
    expect(input.value).toBe("3");

    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.blur(input);
    expect(input.value).toBe("3");
  });

  test("finishing the deck shows a summary and allows restarting", () => {
    renderMode(<FlashcardsMode deck={DECK} seed={5} />);
    for (let i = 0; i < DECK.entries.length; i += 1) {
      fireEvent.click(screen.getByRole("button", { name: /reveal translation/i }));
      fireEvent.click(screen.getByRole("button", { name: /^known$/i }));
    }
    expect(screen.getByRole("heading", { name: /deck finished/i })).toBeInTheDocument();
    expect(sessionText()).toContain("3 known / 0 practice");

    fireEvent.click(screen.getByRole("button", { name: /study again/i }));
    expect(screen.getByText(/card 1 of 3/i)).toBeInTheDocument();
  });
});

/* ---------------- Quiz ---------------- */

describe("QuizMode", () => {
  function firstRound() {
    return buildQuizRounds(DECK.entries, seededRng(0))[0];
  }

  test("submit is guarded until an option is selected", () => {
    renderMode(<QuizMode deck={DECK} seed={0} />);
    expect(screen.getByRole("button", { name: /submit answer/i })).toBeDisabled();
  });

  test("a correct answer is scored once and cannot be submitted twice", () => {
    const round = firstRound();
    renderMode(<QuizMode deck={DECK} seed={0} />);

    fireEvent.click(screen.getByRole("button", { name: round.answer }));
    fireEvent.click(screen.getByRole("button", { name: /submit answer/i }));

    expect(sessionText()).toContain("1/1");
    expect(screen.getByText(/^correct\.$/i)).toBeInTheDocument();
    // Options are locked after submission.
    for (const option of round.options) {
      expect(screen.getByRole("button", { name: option })).toBeDisabled();
    }
    // The next button replaces submit: no path to a duplicate score.
    expect(screen.queryByRole("button", { name: /submit answer/i })).not.toBeInTheDocument();
  });

  test("a wrong answer scores zero and reveals the correct option", () => {
    const round = firstRound();
    const wrong = round.options.find((option) => option !== round.answer)!;
    renderMode(<QuizMode deck={DECK} seed={0} />);

    fireEvent.click(screen.getByRole("button", { name: wrong }));
    fireEvent.click(screen.getByRole("button", { name: /submit answer/i }));

    expect(sessionText()).toContain("0/1");
    expect(screen.getByText(new RegExp(`not quite.*${round.answer}`, "i"))).toBeInTheDocument();
  });

  test("walks through all rounds and shows the session score", () => {
    const rounds = buildQuizRounds(DECK.entries, seededRng(0));
    renderMode(<QuizMode deck={DECK} seed={0} />);

    for (const round of rounds) {
      fireEvent.click(screen.getByRole("button", { name: round.answer }));
      fireEvent.click(screen.getByRole("button", { name: /submit answer/i }));
      fireEvent.click(screen.getByRole("button", { name: /next question|see results/i }));
    }

    expect(screen.getByRole("heading", { name: /quiz complete/i })).toBeInTheDocument();
    expect(sessionText()).toContain(`${rounds.length}/${rounds.length}`);

    fireEvent.click(screen.getByRole("button", { name: /play again/i }));
    expect(screen.getByText(/question 1 of 3/i)).toBeInTheDocument();
  });

  test("question count can be set to any number from 1 to the available rounds", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      id: `e${i}`,
      source: `w${i}`,
      target: `t${i}`,
      alternatives: [],
      tags: [],
    }));
    const deck: PlayableDeck = { ...DECK, entries: many };
    renderMode(<QuizMode deck={deck} seed={0} />);

    const input = screen.getByLabelText(/^questions$/i) as HTMLInputElement;
    // Rounds are capped at 20, so the default and max are 20.
    expect(input.value).toBe("20");
    expect(input.max).toBe("20");

    fireEvent.change(input, { target: { value: "5" } });
    fireEvent.blur(input);
    expect(input.value).toBe("5");
    expect(screen.getByText(/question 1 of 5/i)).toBeInTheDocument();

    // Out-of-range and non-numeric entries revert to the previous count.
    for (const bad of ["21", "0", "", "abc"]) {
      fireEvent.change(input, { target: { value: bad } });
      fireEvent.blur(input);
      expect(input.value).toBe("5");
    }
  });

  test("explains itself when a deck has no distinct translations", () => {
    const single: PlayableDeck = { ...DECK, entries: [DECK.entries[0]] };
    renderMode(<QuizMode deck={single} />);
    expect(screen.getByRole("heading", { name: /not enough distinct translations/i })).toBeInTheDocument();
  });

  test("labels use the deck's languages, not hardcoded ones", () => {
    const round = buildQuizRounds(JP_DECK.entries, seededRng(0))[0];
    renderMode(<QuizMode deck={JP_DECK} seed={0} />);
    const prompt = screen.getByText(round.entry.source).closest(".panel")!;
    expect(within(prompt as HTMLElement).getByText("German")).toBeInTheDocument();
    expect(screen.getByText(/choose the japanese translation/i)).toBeInTheDocument();
  });
});

/* ---------------- Typing ---------------- */

describe("TypingMode", () => {
  function firstEntry() {
    return buildFlashcardOrder(DECK.entries, seededRng(0))[0];
  }

  test("rejects empty input before scoring", () => {
    renderMode(<TypingMode deck={DECK} seed={0} />);
    fireEvent.click(screen.getByRole("button", { name: /check answer/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/enter a english translation/i);
    // Pristine session: nothing was recorded.
    expect(sessionText()).toMatch(PRISTINE);
  });

  test("accepts case-, whitespace- and accent-insensitive answers", () => {
    const entry = firstEntry();
    renderMode(<TypingMode deck={DECK} seed={0} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: `  ${entry.target.toUpperCase()}  ` } });
    fireEvent.click(screen.getByRole("button", { name: /check answer/i }));
    expect(sessionText()).toContain("1/1");
  });

  test("accepts configured alternative translations", () => {
    const withAlt: PlayableDeck = {
      ...DECK,
      entries: [{ id: "chat", source: "chat", target: "cat", alternatives: ["kitten"], tags: [] }],
    };
    renderMode(<TypingMode deck={withAlt} seed={0} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "kitten" } });
    fireEvent.click(screen.getByRole("button", { name: /check answer/i }));
    expect(sessionText()).toContain("1/1");
  });

  test("accent handling is deliberate: disabling it rejects unaccented input", () => {
    const ACCENT_DECK: PlayableDeck = {
      ...DECK,
      entries: [{ id: "cafe", source: "café", target: "café", alternatives: ["coffee shop"], tags: [] }],
    };
    renderMode(<TypingMode deck={ACCENT_DECK} seed={0} />);
    fireEvent.click(screen.getByLabelText(/ignore accents/i)); // turn strict checking on
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "cafe" } });
    fireEvent.click(screen.getByRole("button", { name: /check answer/i }));
    expect(sessionText()).toContain("0/1");
    expect(screen.getByText(/accepted:/i)).toBeInTheDocument();
  });

  test("accent-insensitive checking accepts the unaccented spelling by default", () => {
    const ACCENT_DECK: PlayableDeck = {
      ...DECK,
      entries: [{ id: "cafe", source: "café", target: "café", alternatives: [], tags: [] }],
    };
    renderMode(<TypingMode deck={ACCENT_DECK} seed={0} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "cafe" } });
    fireEvent.click(screen.getByRole("button", { name: /check answer/i }));
    expect(sessionText()).toContain("1/1");
  });
  test("non-Latin decks are checked with the same rules", () => {
    renderMode(<TypingMode deck={JP_DECK} seed={0} />);
    const entry = buildFlashcardOrder(JP_DECK.entries, seededRng(0))[0];
    fireEvent.change(screen.getByRole("textbox"), { target: { value: entry.target } });
    fireEvent.click(screen.getByRole("button", { name: /check answer/i }));
    expect(sessionText()).toContain("1/1");
  });

  test("finishing all entries shows the session score", () => {
    renderMode(<TypingMode deck={DECK} seed={0} />);
    const entries = buildFlashcardOrder(DECK.entries, seededRng(0));
    for (const entry of entries) {
      fireEvent.change(screen.getByRole("textbox"), { target: { value: entry.target } });
      fireEvent.click(screen.getByRole("button", { name: /check answer/i }));
      fireEvent.click(screen.getByRole("button", { name: /next entry|see results/i }));
    }
    expect(screen.getByRole("heading", { name: /typing complete/i })).toBeInTheDocument();
  });
});

/* ---------------- Matching ---------------- */

describe("MatchingMode", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function columns() {
    const lists = screen.getAllByRole("list");
    return { left: lists[0], right: lists[1] };
  }

  test("a correct pair is completed once and locked against re-matching", () => {
    renderMode(<MatchingMode deck={DECK} seed={0} />);
    const { left, right } = columns();
    const source = within(left).getAllByRole("button")[0];
    const sourceText = source.textContent!;
    const targetText = DECK.entries.find((e) => e.source === sourceText)!.target;
    const target = within(right).getAllByRole("button").find((b) => b.textContent === targetText)!;

    fireEvent.click(source);
    fireEvent.click(target);

    expect(sessionText()).toContain("1 pairs / 1 attempts");
    // The completed pair cannot be selected again.
    const completedSource = within(left).getAllByRole("button")[0];
    expect(completedSource).toBeDisabled();
    fireEvent.click(completedSource);
    expect(sessionText()).toContain("1 pairs / 1 attempts");
  });

  test("an incorrect pair is scored but not completed", () => {
    renderMode(<MatchingMode deck={DECK} seed={0} />);
    const { left, right } = columns();
    const source = within(left).getAllByRole("button")[0];
    const correctTarget = DECK.entries.find((e) => e.source === source.textContent!)!.target;
    const wrongTarget = within(right)
      .getAllByRole("button")
      .find((b) => b.textContent !== correctTarget)!;

    fireEvent.click(source);
    fireEvent.click(wrongTarget);

    expect(sessionText()).toContain("0 pairs / 1 attempts");
    expect(screen.getByText(/not a pair/i)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1500));
    expect(screen.queryByText(/not a pair/i)).not.toBeInTheDocument();
  });

  test("choosing the source twice deselects instead of scoring twice", () => {
    renderMode(<MatchingMode deck={DECK} seed={0} />);
    const { left, right } = columns();
    const source = within(left).getAllByRole("button")[0];

    fireEvent.click(source);
    expect(source).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(source);
    expect(source).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(within(right).getAllByRole("button")[0]); // no source selected: ignored
    expect(sessionText()).toMatch(PRISTINE);
  });

  test("clicking a target without a selected source does nothing", () => {
    renderMode(<MatchingMode deck={DECK} seed={0} />);
    const { right } = columns();
    fireEvent.click(within(right).getAllByRole("button")[0]);
    expect(sessionText()).toMatch(PRISTINE);
  });

  test("finishing all pairs shows the summary", () => {
    renderMode(<MatchingMode deck={DECK} seed={0} />);
    const { left, right } = columns();
    for (const source of within(left).getAllByRole("button")) {
      const targetText = DECK.entries.find((e) => e.source === source.textContent!)!.target;
      const target = within(right).getAllByRole("button").find((b) => b.textContent === targetText)!;
      fireEvent.click(source);
      fireEvent.click(target);
    }
    expect(screen.getByRole("heading", { name: /all pairs matched/i })).toBeInTheDocument();
    expect(sessionText()).toContain("3 pairs / 3 attempts");
  });

  test("ambiguous duplicate translations are excluded, not faked", () => {
    renderMode(<MatchingMode deck={DUP_DECK} seed={0} />);
    expect(screen.getByText(/2 entries with duplicate translations were left out/i)).toBeInTheDocument();
    const { left } = columns();
    expect(within(left).getAllByRole("button")).toHaveLength(2);
  });

  test("columns show the deck's language names", () => {
    renderMode(<MatchingMode deck={JP_DECK} seed={0} />);
    expect(screen.getByText("German")).toBeInTheDocument();
    expect(screen.getByText("Japanese")).toBeInTheDocument();
  });
});

/* ---------------- Session separation ---------------- */

describe("session state", () => {
  test("custom decks live in storage, progress only in memory", () => {
    function Probe() {
      const { stats, isPristine } = useSession();
      return (
        <div>
          <span data-testid="pristine">{String(isPristine)}</span>
          <span data-testid="answered">{stats.quiz.answered}</span>
        </div>
      );
    }
    render(
      <MemoryRouter>
        <SessionProvider>
          <Probe />
        </SessionProvider>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("pristine")).toHaveTextContent("true");
    // No localStorage key related to progress exists.
    expect(localStorage.length).toBe(0);
  });
});

/* ---------------- Matching batches (regression) ---------------- */

describe("MatchingMode batches", () => {
  const BIG_DECK: PlayableDeck = {
    id: "big",
    name: "Big deck",
    description: "",
    sourceLanguage: "en",
    targetLanguage: "fr",
    entryCount: 8,
    origin: "builtin",
    entries: Array.from({ length: 8 }, (_, i) => ({
      id: `e${i}`,
      source: `source-${i}`,
      target: `target-${i}`,
      alternatives: [],
      tags: [],
    })),
  };

  function completeVisibleBatch() {
    const lists = screen.getAllByRole("list");
    const left = lists[0];
    const right = lists[1];
    for (const source of within(left).getAllByRole("button")) {
      if (source.hasAttribute("disabled")) continue;
      const targetText = BIG_DECK.entries.find((e) => e.source === source.textContent!)!.target;
      const target = within(right)
        .getAllByRole("button")
        .find((b) => b.textContent === targetText)!;
      fireEvent.click(source);
      fireEvent.click(target);
    }
  }

  test("completing a batch always offers a way forward (no dead end)", () => {
    renderMode(<MatchingMode deck={BIG_DECK} seed={1} />);
    completeVisibleBatch();
    // The batch is complete: the user must be able to advance.
    expect(screen.queryByRole("button", { name: /stay here/i })).not.toBeInTheDocument();
    const next = screen.getByRole("button", { name: /next batch/i });
    fireEvent.click(next);
    completeVisibleBatch();
    expect(screen.getByRole("heading", { name: /all pairs matched/i })).toBeInTheDocument();
  });
});
