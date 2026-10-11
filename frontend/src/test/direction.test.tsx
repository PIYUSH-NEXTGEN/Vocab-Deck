/**
 * Study-direction toggle: decks can be practised in either direction, from the
 * home screen (Reverse direction) or the play screen (Reverse to …).
 */

import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { PlayableDeck } from "../api/types";
import { App } from "../App";
import { SessionProvider } from "../session/SessionProvider";
import { ThemeProvider } from "../theme/ThemeProvider";
import { reverseDeck } from "../lib/deckItems";
import { saveCustomDeck } from "../storage/customDecks";
import type { CustomDeckDocument } from "../api/types";

const CUSTOM_DECK: CustomDeckDocument = {
  version: 1,
  deck: {
    id: "custom-spanish-basics",
    name: "Spanish basics",
    description: "Everyday words",
    sourceLanguage: "es",
    targetLanguage: "en",
    entryCount: 2,
  },
  entries: [
    { id: "hola", source: "hola", target: "hello", alternatives: ["hey"], tags: [] },
    { id: "gracias", source: "gracias", target: "thank you", alternatives: [], tags: [] },
  ],
  exportedAt: "2026-01-01T00:00:00.000Z",
};

function renderAppAt(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <ThemeProvider>
        <SessionProvider>
        <App />
        </SessionProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

/** Language names shown in the play-screen header chips, in order. */
function studyDirectionChips(): (string | null)[] {
  const meta = document.querySelector(".play-meta");
  if (!meta) return [];
  return Array.from(meta.querySelectorAll(".chip-name")).map((node) => node.textContent);
}

function reverseDeckUnit(): PlayableDeck {
  return {
    id: "deck",
    name: "Deck",
    description: "",
    sourceLanguage: "de",
    targetLanguage: "en",
    entryCount: 2,
    origin: "builtin",
    entries: [
      { id: "hund", source: "Hund", target: "dog", alternatives: ["hound"], tags: ["noun"] },
      { id: "katze", source: "Katze", target: "cat", alternatives: [], tags: ["noun"] },
    ],
  };
}

describe("reverseDeck", () => {
  test("swaps languages, entry texts and keeps entry ids", () => {
    const reversed = reverseDeck(reverseDeckUnit());
    expect(reversed.sourceLanguage).toBe("en");
    expect(reversed.targetLanguage).toBe("de");
    expect(reversed.entries.map((e) => [e.id, e.source, e.target])).toEqual([
      ["hund", "dog", "Hund"],
      ["katze", "cat", "Katze"],
    ]);
  });

  test("drops alternatives so reversed study cannot accept wrong answers", () => {
    const reversed = reverseDeck(reverseDeckUnit());
    expect(reversed.entries.every((e) => e.alternatives.length === 0)).toBe(true);
  });

  test("the description swaps language names with the direction", () => {
    const deck: PlayableDeck = {
      ...reverseDeckUnit(),
      description: "25 everyday English words with German translations, including the eszett.",
    };
    const reversed = reverseDeck(deck);
    expect(reversed.description).toBe(
      "25 everyday German words with English translations, including the eszett.",
    );
  });

  test("is its own inverse on the language pair", () => {
    const once = reverseDeck(reverseDeckUnit());
    const twice = reverseDeck(once);
    expect([twice.sourceLanguage, twice.targetLanguage]).toEqual(["de", "en"]);
  });
});

describe("direction in the app", () => {
  test("?dir=reverse opens the deck in the opposite direction", async () => {
    saveCustomDeck(CUSTOM_DECK);
    renderAppAt(`/play/quiz/${CUSTOM_DECK.deck.id}?dir=reverse`);

    expect(await screen.findByRole("heading", { name: "Spanish basics" })).toBeInTheDocument();
    expect(studyDirectionChips()).toEqual(["English", "Spanish"]);
    // The question prompt now shows English words and asks for Spanish.
    expect(screen.getByText(/choose the spanish translation/i)).toBeInTheDocument();
    const prompt = screen.getByText(/choose the spanish translation/i).closest(".panel")!;
    expect(prompt.textContent).toMatch(/hello|thank you/);
  });

  test("the toggle flips the direction live", async () => {
    saveCustomDeck(CUSTOM_DECK);
    renderAppAt(`/play/quiz/${CUSTOM_DECK.deck.id}`);

    expect(studyDirectionChips()).toEqual(["Spanish", "English"]);

    fireEvent.click(screen.getByRole("button", { name: /reverse study direction/i }));

    expect(studyDirectionChips()).toEqual(["English", "Spanish"]);
  });

  test("home links carry the reversed direction into the play screen", async () => {
    saveCustomDeck(CUSTOM_DECK);
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ decks: [], total: 0 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    renderAppAt("/");

    await user.click(await screen.findByRole("button", { name: /select deck spanish basics/i }));
    await user.click(screen.getByRole("button", { name: /reverse study direction/i }));

    const practice = screen.getByRole("region", { name: /practice spanish basics/i });
    expect(within(practice).getByRole("link", { name: /flashcards/i })).toHaveAttribute(
      "href",
      `/play/flashcards/${CUSTOM_DECK.deck.id}?dir=reverse`,
    );
  });
});
