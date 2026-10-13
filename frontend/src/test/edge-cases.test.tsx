import { describe, expect, test } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SessionProvider } from "../session/SessionProvider";
import { FlashcardsMode } from "../game/modes/FlashcardsMode";
import { TypingMode } from "../game/modes/TypingMode";
import { MatchingMode } from "../game/modes/MatchingMode";
import { buildMatchBoard, buildQuizRounds } from "../game/engine";
import { createRng } from "../game/rng";
import type { PlayableDeck } from "../api/types";
import {
  getCustomDeck,
  listCustomDecks,
  saveCustomDeck,
} from "../storage/customDecks";
import { validateCustomDeck } from "../decks/validate";
import { confirmImport } from "../decks/importPipeline";
import { deckToCsv } from "../decks/csvFormat";
import { App } from "../App";
import { renderApp, stubDeckList, DECK_DTOS } from "./utils";

const STORAGE_KEY = "flash-card-game.customDecks.v1";

const SINGLE: PlayableDeck = {
  id: "single",
  name: "Single",
  description: "",
  sourceLanguage: "english",
  targetLanguage: "french",
  entryCount: 1,
  origin: "custom",
  entries: [{ id: "solo", source: "hello", target: "bonjour", alternatives: [], tags: [] }],
};

function renderMode(mode: React.ReactElement) {
  return render(
    <MemoryRouter>
      <SessionProvider>{mode}</SessionProvider>
    </MemoryRouter>,
  );
}

describe("single-entry decks", () => {
  test("flashcards finishes a one-card round", () => {
    renderMode(<FlashcardsMode deck={SINGLE} seed={1} />);
    expect(screen.getByText("Card 1 of 1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /reveal translation/i }));
    fireEvent.click(screen.getByRole("button", { name: /known/i }));
    expect(screen.getByRole("heading", { name: /deck finished/i })).toBeInTheDocument();
  });

  test("typing finishes a one-entry round with a correct answer", () => {
    const { container } = renderMode(<TypingMode deck={SINGLE} seed={1} />);
    expect(container.querySelector(".typing-prompt .flashcard-word")!.textContent).toBe("hello");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "bonjour" } });
    fireEvent.click(screen.getByRole("button", { name: /check answer/i }));
    expect(screen.getByText("Correct.")).toBeInTheDocument();
  });

  test("matching explains itself with fewer than two pairs", () => {
    renderMode(<MatchingMode deck={SINGLE} seed={1} />);
    expect(
      screen.getByRole("heading", { name: /not enough pairs to match/i }),
    ).toBeInTheDocument();
  });
});

describe("large decks", () => {
  const entries = Array.from({ length: 1000 }, (_, i) => ({
    id: `e-${i}`,
    source: `source-${i}`,
    target: `target-${i}`,
    alternatives: [] as string[],
    tags: [] as string[],
  }));

  test("quiz builds valid rounds without inventing vocabulary", () => {
    const rounds = buildQuizRounds(entries, createRng(7));
    expect(rounds).toHaveLength(20);
    for (const round of rounds) {
      expect(round.options).toContain(round.answer);
      expect(new Set(round.options).size).toBe(round.options.length);
      expect(round.options.length).toBeGreaterThanOrEqual(2);
    }
  });

  test("matching builds a full board", () => {
    const board = buildMatchBoard(entries, createRng(7));
    expect(board.pairs).toHaveLength(12);
    expect(board.excludedCount).toBe(0);
  });
});

describe("export/import round trip", () => {
  const doc = {
    version: 1,
    deck: {
      id: "round-trip",
      name: "Round trip",
      description: "Everyday, words",
      sourceLanguage: "english",
      targetLanguage: "french",
      entryCount: 2,
    },
    entries: [
      {
        id: "a",
        source: "hello",
        target: "thank you, thanks",
        alternatives: ["say, hi", "yo"],
        tags: ["greeting"],
      },
      { id: "b", source: "bye", target: "au revoir", alternatives: [], tags: [] },
    ],
    exportedAt: "2026-01-01T00:00:00.000Z",
  };

  test("CSV export re-imports with content intact", () => {
    const validated = validateCustomDeck(doc);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    const result = confirmImport(deckToCsv(validated.deck), []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deck.entries.map((e) => [e.source, e.target])).toEqual([
      ["hello", "thank you, thanks"],
      ["bye", "au revoir"],
    ]);
    expect(result.deck.entries[0].alternatives).toEqual(["say, hi", "yo"]);
    expect(result.deck.deck.description).toBe("Everyday, words");
  });
});

describe("corrupted browser storage", () => {
  test("garbage in localStorage yields empty decks, not a crash", () => {
    window.localStorage.setItem(STORAGE_KEY, "{definitely not json");
    expect(listCustomDecks()).toEqual([]);
    expect(getCustomDeck("anything")).toBeNull();
  });

  test("non-array JSON in localStorage is ignored", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1 }));
    expect(listCustomDecks()).toEqual([]);
  });

  test("the home page still renders with corrupted storage", async () => {
    window.localStorage.setItem(STORAGE_KEY, "[broken");
    stubDeckList(DECK_DTOS);
    renderApp(<App />, "/");
    const decks = await screen.findAllByRole("button", { name: /select deck/i });
    expect(decks.length).toBeGreaterThan(0);
  });

  test("saving recovers after corruption", () => {
    window.localStorage.setItem(STORAGE_KEY, "garbage");
    saveCustomDeck({
      version: 1,
      deck: {
        id: "recovered",
        name: "Recovered",
        description: "",
        sourceLanguage: "en",
        targetLanguage: "fr",
        entryCount: 1,
      },
      entries: [{ id: "a", source: "a", target: "b", alternatives: [], tags: [] }],
      exportedAt: new Date(0).toISOString(),
    });
    expect(listCustomDecks().map((d) => d.id)).toEqual(["recovered"]);
  });
});
