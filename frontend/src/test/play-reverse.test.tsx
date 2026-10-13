import { describe, expect, test } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SessionProvider } from "../session/SessionProvider";
import { PlayPage } from "../pages/PlayPage";
import { saveCustomDeck } from "../storage/customDecks";

const DECK_ID = "custom-rev-eight";
const ENTRIES = Array.from({ length: 8 }, (_, i) => ({
  id: `e${i}`,
  source: `src-${i}`,
  target: `tgt-${i}`,
  alternatives: [] as string[],
  tags: [] as string[],
}));

function seedDeck() {
  saveCustomDeck({
    version: 1,
    deck: {
      id: DECK_ID,
      name: "Reversible",
      description: "",
      sourceLanguage: "english",
      targetLanguage: "german",
      entryCount: ENTRIES.length,
    },
    entries: ENTRIES,
    exportedAt: new Date(0).toISOString(),
  });
}

function renderReversedPlay(mode: string) {
  return render(
    <MemoryRouter initialEntries={[`/play/${mode}/${DECK_ID}?dir=reverse`]}>
      <SessionProvider>
        <Routes>
          <Route path="/play/:modeId/:deckId" element={<PlayPage />} />
        </Routes>
      </SessionProvider>
    </MemoryRouter>,
  );
}

/** Reversed deck: prompt shows the original target, answer is the original source. */
function expectedAnswer(prompt: string): string {
  const entry = ENTRIES.find((e) => e.target === prompt);
  expect(entry, `prompt "${prompt}" is not a reversed entry`).toBeDefined();
  return entry!.source;
}

describe("PlayPage with reversed study direction", () => {
  test("quiz keeps the same question after submitting an answer", () => {
    seedDeck();
    const { container } = renderReversedPlay("quiz");
    const prompt = container.querySelector(".quiz-prompt .flashcard-word")!.textContent!;
    const answer = expectedAnswer(prompt);

    fireEvent.click(
      within(container.querySelector(".option-list")!).getByRole("button", { name: answer }),
    );
    fireEvent.click(screen.getByRole("button", { name: /submit answer/i }));

    expect(screen.getByText("Correct.")).toBeInTheDocument();
    expect(container.querySelector(".quiz-prompt .flashcard-word")!.textContent).toBe(prompt);
  });

  test("typing keeps the same prompt after submitting an answer", () => {
    seedDeck();
    const { container } = renderReversedPlay("typing");
    const prompt = container.querySelector(".typing-prompt .flashcard-word")!.textContent!;
    const answer = expectedAnswer(prompt);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: answer } });
    fireEvent.click(screen.getByRole("button", { name: /check answer/i }));

    expect(screen.getByText("Correct.")).toBeInTheDocument();
    expect(container.querySelector(".typing-prompt .flashcard-word")!.textContent).toBe(prompt);
  });

  test("matching keeps the board order after completing a pair", () => {
    seedDeck();
    renderReversedPlay("matching");
    const lists = screen.getAllByRole("list");
    const left = lists[0];
    const right = lists[1];
    const orderBefore = within(left)
      .getAllByRole("button")
      .map((b) => b.textContent);

    const source = within(left).getAllByRole("button")[0];
    const target = within(right)
      .getAllByRole("button")
      .find((b) => b.textContent === expectedAnswer(source.textContent!))!;
    fireEvent.click(source);
    fireEvent.click(target);

    expect(screen.getByText("Paired.")).toBeInTheDocument();
    expect(screen.getByText("1 of 8 pairs")).toBeInTheDocument();
    expect(
      within(screen.getAllByRole("list")[0])
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(orderBefore);
  });
});
