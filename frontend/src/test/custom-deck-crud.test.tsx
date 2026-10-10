import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { CustomDeckDocument, PlayableDeck } from "../api/types";
import { App } from "../App";
import { SessionProvider } from "../session/SessionProvider";
import { FlashcardsMode } from "../game/modes/FlashcardsMode";
import { QuizMode } from "../game/modes/QuizMode";
import { TypingMode } from "../game/modes/TypingMode";
import { MatchingMode } from "../game/modes/MatchingMode";
import { deckToCsv } from "../decks/csvFormat";
import { previewImport } from "../decks/importPipeline";
import { getCustomDeck, listCustomDecks, saveCustomDeck, toExportDocument } from "../storage/customDecks";

const STORAGE_KEY = "flash-card-game.customDecks.v1";

const DECK: CustomDeckDocument = {
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
    { id: "hola", source: "hola", target: "hello", alternatives: ["hi"], tags: ["greeting"] },
    { id: "gracias", source: "gracias", target: "thank you", alternatives: [], tags: [] },
  ],
  exportedAt: "2026-01-01T00:00:00.000Z",
};

const PLAYABLE_CUSTOM: PlayableDeck = {
  id: "custom-play",
  name: "Playable",
  description: "",
  sourceLanguage: "es",
  targetLanguage: "en",
  entryCount: 3,
  origin: "custom",
  entries: [
    { id: "hola", source: "hola", target: "hello", alternatives: [], tags: [] },
    { id: "gracias", source: "gracias", target: "thank you", alternatives: [], tags: [] },
    { id: "agua", source: "agua", target: "water", alternatives: [], tags: [] },
  ],
};

function renderAppAt(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <SessionProvider>
        <App />
      </SessionProvider>
    </MemoryRouter>,
  );
}

function stubBuiltInDecks() {
  vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = String(input);
    if (url.includes("/api/decks")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            decks: [
              {
                id: "fr-en-common",
                name: "French to English Common Words",
                description: "Common vocabulary.",
                source_language: "fr",
                target_language: "en",
                entry_count: 101,
              },
            ],
            total: 1,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    }
    return Promise.reject(new TypeError(`Unexpected request: ${url}`));
  });
}

function storedDecks(): CustomDeckDocument[] {
  return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
}

/* ---------------- Creating, editing, deleting ---------------- */

describe("custom deck creation and editing", () => {
  test("creates a deck from the editor form and stores it in the browser", async () => {
    const user = userEvent.setup();
    renderAppAt("/editor");

    await user.type(screen.getByLabelText(/deck name/i), "Kitchen words");
    await user.type(screen.getByLabelText(/source language code/i), "it");
    await user.type(screen.getByLabelText(/target language code/i), "en");
    await user.type(screen.getByLabelText("Entry 1 source"), "pane");
    await user.type(screen.getByLabelText("Entry 1 translation"), "bread");
    await user.click(screen.getByRole("button", { name: /add entry/i }));
    await user.type(screen.getByLabelText("Entry 2 source"), "acqua");
    await user.type(screen.getByLabelText("Entry 2 translation"), "water");

    await user.click(screen.getByRole("button", { name: /create deck/i }));

    // Lands back on the library with the new deck listed.
    expect(await screen.findByRole("heading", { name: "Kitchen words" })).toBeInTheDocument();

    const stored = storedDecks();
    expect(stored).toHaveLength(1);
    expect(stored[0].deck.id).toBe("custom-kitchen-words");
    expect(stored[0].entries.map((e) => [e.source, e.target])).toEqual([
      ["pane", "bread"],
      ["acqua", "water"],
    ]);
  });

  test("rejects an incomplete deck with actionable errors", async () => {
    const user = userEvent.setup();
    renderAppAt("/editor");

    await user.click(screen.getByRole("button", { name: /create deck/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/deck name is required/i);
    expect(alert).toHaveTextContent(/not a valid language code/i);
    expect(alert).toHaveTextContent(/at least one entry/i);
    expect(storedDecks()).toHaveLength(0);
  });

  test("edits an existing deck, preserving its id and entry ids", async () => {
    saveCustomDeck(DECK);
    const user = userEvent.setup();
    renderAppAt(`/editor/${DECK.deck.id}`);

    expect(await screen.findByRole("heading", { name: /edit “spanish basics”/i })).toBeInTheDocument();
    // Existing entry ids are displayed for stability.
    expect(screen.getAllByTitle("Entry id (stable)")[0]).toHaveTextContent("hola");

    const nameInput = screen.getByLabelText(/deck name/i);
    await user.clear(nameInput);
    await user.type(nameInput, "Spanish everyday");
    const translation = screen.getByLabelText("Entry 1 translation");
    await user.clear(translation);
    await user.type(translation, "hey there");

    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(await screen.findByRole("heading", { name: "Spanish everyday" })).toBeInTheDocument();

    const stored = storedDecks();
    expect(stored).toHaveLength(1);
    expect(stored[0].deck.id).toBe("custom-spanish-basics"); // id preserved
    expect(stored[0].entries[0].id).toBe("hola"); // entry ids preserved
    expect(stored[0].entries[0].target).toBe("hey there");
  });

  test("renaming a deck does not change its id", async () => {
    saveCustomDeck(DECK);
    const user = userEvent.setup();
    renderAppAt(`/editor/${DECK.deck.id}`);

    const nameInput = await screen.findByLabelText(/deck name/i);
    await user.clear(nameInput);
    await user.type(nameInput, "Renamed");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    await screen.findByRole("heading", { name: "Renamed" });

    const stored = storedDecks();
    expect(stored[0].deck.id).toBe("custom-spanish-basics");
  });

  test("deleting requires confirmation and keeps the deck when cancelled", async () => {
    saveCustomDeck(DECK);
    const user = userEvent.setup();
    renderAppAt("/library");

    await user.click(screen.getByRole("button", { name: /^custom/i }));

    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    // Cancelling keeps the deck.
    await user.click(screen.getByRole("button", { name: /^keep$/i }));
    expect(storedDecks()).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    await user.click(screen.getByRole("button", { name: /confirm delete/i }));
    expect(storedDecks()).toHaveLength(0);
    expect(await screen.findByRole("heading", { name: /no custom decks yet/i })).toBeInTheDocument();
  });

  test("decks survive a page refresh (new render, same browser storage)", async () => {
    saveCustomDeck(DECK);
    const user = userEvent.setup();

    const first = renderAppAt("/library");
    await user.click(screen.getByRole("button", { name: /^custom/i }));
    expect(await screen.findByRole("heading", { name: "Spanish basics" })).toBeInTheDocument();
    first.unmount();

    // A fresh render (page refresh) reads the same browser storage.
    renderAppAt("/library");
    await user.click(screen.getByRole("button", { name: /^custom/i }));
    expect(await screen.findByRole("heading", { name: "Spanish basics" })).toBeInTheDocument();
  });

  test("custom decks listed on the home screen remain playable", async () => {
    saveCustomDeck(DECK);
    renderAppAt("/");
    expect(await screen.findByText("Spanish basics")).toBeInTheDocument();
    await userEvent.setup().click(screen.getAllByRole("button", { name: /select deck/i })[0]);
    expect(screen.getByRole("link", { name: /flashcards/i })).toHaveAttribute(
      "href",
      `/play/flashcards/${DECK.deck.id}`,
    );
  });
});

/* ---------------- Import ---------------- */

describe("importing decks", () => {
  test("previews a valid JSON import before anything is stored", async () => {
    const user = userEvent.setup();
    renderAppAt("/library");
    await user.click(screen.getByRole("button", { name: /^custom/i }));

    const textarea = screen.getByLabelText(/paste deck json or csv/i);
    fireEvent.change(textarea, { target: { value: toExportDocument(DECK) } });

    const preview = await screen.findByRole("region", { name: /import preview/i });
    expect(within(preview).getByRole("heading", { name: "Spanish basics" })).toBeInTheDocument();
    expect(preview).toHaveTextContent("2 entries");
    expect(preview).toHaveTextContent("hola → hello");
    // Not stored until confirmed.
    expect(storedDecks()).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(storedDecks()).toHaveLength(0);

    fireEvent.change(textarea, { target: { value: toExportDocument(DECK) } });
    await user.click(await screen.findByRole("button", { name: /import deck/i }));
    expect(storedDecks()).toHaveLength(1);
  });

  test("round-trips a JSON export", async () => {
    saveCustomDeck(DECK);
    const exported = toExportDocument(getCustomDeck(DECK.deck.id)!);
    window.localStorage.clear();

    const preview = previewImport(exported);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.deck).toEqual(DECK);

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([preview.deck]));
    expect(getCustomDeck(DECK.deck.id)).toEqual(DECK);
  });

  test("round-trips a CSV export (ids derived from source words)", async () => {
    saveCustomDeck(DECK);
    const csv = deckToCsv(getCustomDeck(DECK.deck.id)!);
    expect(csv).toContain("# deck: Spanish basics");
    expect(csv).toContain("# sourceLanguage: es");
    expect(csv).toContain("source,target,alternatives,tags");
    expect(csv).toContain("hola,hello,hi,greeting");

    window.localStorage.clear();
    const preview = previewImport(csv);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.deck.deck).toMatchObject({
      id: "custom-spanish-basics",
      name: "Spanish basics",
      sourceLanguage: "es",
      targetLanguage: "en",
      entryCount: 2,
    });
    expect(preview.deck.entries.map((e) => [e.id, e.source, e.target, e.alternatives])).toEqual([
      ["hola", "hola", "hello", ["hi"]],
      ["gracias", "gracias", "thank you", []],
    ]);

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([preview.deck]));
    expect(listCustomDecks()).toHaveLength(1);
  });

  test("CSV handles quoted fields containing commas", () => {
    const csv = [
      "# deck: Quotes",
      "# sourceLanguage: es",
      "# targetLanguage: en",
      "source,target,alternatives,tags",
      'gracias,"thank you, thanks",thanks|cheers,phrase',
    ].join("\n");
    const preview = previewImport(csv);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.deck.entries[0].target).toBe("thank you, thanks");
    expect(preview.deck.entries[0].alternatives).toEqual(["thanks", "cheers"]);
  });

  test("rejects malformed JSON with a helpful error", async () => {
    const user = userEvent.setup();
    renderAppAt("/library");
    await user.click(screen.getByRole("button", { name: /^custom/i }));
    fireEvent.change(screen.getByLabelText(/paste deck json or csv/i), {
      target: { value: "{oops not json" },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(/not valid json/i);
    expect(storedDecks()).toHaveLength(0);
  });

  test("rejects malformed CSV (bad header) and unterminated quotes", () => {
    expect(previewImport("word,translation\nhola,hello")).toMatchObject({
      ok: false,
      errors: [expect.stringMatching(/header must start with "source,target"/i)],
    });
    expect(previewImport('# deck: X\n# sourceLanguage: es\n# targetLanguage: en\nsource,target\n"unterminated,hello')).toMatchObject({
      ok: false,
    });
  });

  test("rejects duplicate entry ids, duplicate pairs and blank entries", () => {
    const dupIds = previewImport(
      JSON.stringify({
        version: 1,
        deck: { id: "custom-x", name: "X", sourceLanguage: "es", targetLanguage: "en" },
        entries: [
          { id: "same", source: "a", target: "b" },
          { id: "same", source: "c", target: "d" },
        ],
      }),
    );
    expect(dupIds.ok).toBe(false);
    if (dupIds.ok) return;
    expect(dupIds.errors.join(" ")).toMatch(/duplicate entry id "same"/i);

    const blank = previewImport(
      JSON.stringify({
        version: 1,
        deck: { id: "custom-x", name: "X", sourceLanguage: "es", targetLanguage: "en" },
        entries: [{ id: "a", source: "   ", target: "b" }],
      }),
    );
    expect(blank.ok).toBe(false);
    if (blank.ok) return;
    expect(blank.errors.join(" ")).toMatch(/source text is required/i);
  });

  test("rejects invalid language codes and unsupported versions", () => {
    const badLang = previewImport(
      JSON.stringify({
        version: 1,
        deck: { id: "custom-x", name: "X", sourceLanguage: "english", targetLanguage: "en" },
        entries: [{ id: "a", source: "a", target: "b" }],
      }),
    );
    expect(badLang.ok).toBe(false);
    if (badLang.ok) return;
    expect(badLang.errors.join(" ")).toMatch(/not a valid language code/i);

    const badVersion = previewImport(JSON.stringify({ version: 2, deck: {}, entries: [] }));
    expect(badVersion.ok).toBe(false);
    if (badVersion.ok) return;
    expect(badVersion.errors.join(" ")).toMatch(/unsupported format version/i);
  });

  test("rejects an import whose deck id already exists (no silent overwrite)", async () => {
    saveCustomDeck(DECK);
    const before = JSON.stringify(storedDecks());
    const user = userEvent.setup();
    renderAppAt("/library");
    await user.click(screen.getByRole("button", { name: /^custom/i }));

    fireEvent.change(screen.getByLabelText(/paste deck json or csv/i), {
      target: { value: toExportDocument(DECK) },
    });
    await user.click(await screen.findByRole("button", { name: /import deck/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/already exists in this browser/i);
    // The stored deck is untouched.
    expect(JSON.stringify(storedDecks())).toBe(before);
  });

  test("failed imports cannot corrupt or drop existing decks", async () => {
    saveCustomDeck(DECK);
    const before = JSON.stringify(storedDecks());
    const user = userEvent.setup();
    renderAppAt("/library");
    await user.click(screen.getByRole("button", { name: /^custom/i }));
    const textarea = screen.getByLabelText(/paste deck json or csv/i);

    for (const payload of [
      "{broken",
      "word,translation\na,b",
      JSON.stringify({ version: 1, deck: { id: "custom-other", name: "", sourceLanguage: "es", targetLanguage: "en" }, entries: [] }),
      "# deck: Broken\nnope",
    ]) {
      fireEvent.change(textarea, { target: { value: payload } });
      await screen.findByRole("alert");
    }

    expect(JSON.stringify(storedDecks())).toBe(before);
    expect(listCustomDecks()[0].name).toBe("Spanish basics");
  });

  test("imports a deck from a file input", async () => {
    const user = userEvent.setup();
    renderAppAt("/library");
    await user.click(screen.getByRole("button", { name: /^custom/i }));

    const file = new File([toExportDocument(DECK)], "deck.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText(/choose a deck file to import/i), {
      target: { files: [file] },
    });

    await user.click(await screen.findByRole("button", { name: /import deck/i }));
    expect(storedDecks()).toHaveLength(1);
    expect(storedDecks()[0].deck.name).toBe("Spanish basics");
  });
});

/* ---------------- Built-in protection ---------------- */

describe("built-in deck protection", () => {
  test("built-in decks are read-only: no edit or delete affordances", async () => {
    stubBuiltInDecks();
    renderAppAt("/library");

    expect(await screen.findByText("French to English Common Words")).toBeInTheDocument();
    expect(screen.getAllByText("Read-only").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /^edit$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^delete$/i })).not.toBeInTheDocument();
  });

  test("editing a built-in deck id is refused", async () => {
    stubBuiltInDecks();
    renderAppAt("/editor/fr-en-common");
    expect(await screen.findByRole("heading", { name: /built-in decks are read-only/i })).toBeInTheDocument();
    expect(storedDecks()).toHaveLength(0);
  });

  test("editing an unknown custom deck id is refused", async () => {
    stubBuiltInDecks();
    renderAppAt("/editor/custom-nope");
    expect(await screen.findByRole("heading", { name: /deck not found/i })).toBeInTheDocument();
  });
});

/* ---------------- Playability & session isolation ---------------- */

describe("custom decks in every mode", () => {
  test("all four modes render for a custom deck", () => {
    const { unmount } = render(
      <MemoryRouter>
        <SessionProvider>
          <FlashcardsMode deck={PLAYABLE_CUSTOM} seed={0} />
        </SessionProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText(/card 1 of 3/i)).toBeInTheDocument();
    unmount();

    render(
      <MemoryRouter>
        <SessionProvider>
          <QuizMode deck={PLAYABLE_CUSTOM} seed={0} />
        </SessionProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText(/question 1 of 3/i)).toBeInTheDocument();
  });

  test("typing and matching render for a custom deck with non-Latin text", () => {
    const jpDeck: PlayableDeck = {
      ...PLAYABLE_CUSTOM,
      sourceLanguage: "de",
      targetLanguage: "ja",
      entries: [
        { id: "hund", source: "Hund", target: "犬", alternatives: [], tags: [] },
        { id: "katze", source: "Katze", target: "猫", alternatives: [], tags: [] },
      ],
    };
    const { unmount } = render(
      <MemoryRouter>
        <SessionProvider>
          <TypingMode deck={jpDeck} seed={0} />
        </SessionProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText("German")).toBeInTheDocument();
    unmount();

    render(
      <MemoryRouter>
        <SessionProvider>
          <MatchingMode deck={jpDeck} seed={0} />
        </SessionProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText("Japanese")).toBeInTheDocument();
  });

  test("gameplay never writes to browser storage", () => {
    saveCustomDeck(DECK);
    const before = window.localStorage.getItem(STORAGE_KEY);

    render(
      <MemoryRouter>
        <SessionProvider>
          <QuizMode deck={PLAYABLE_CUSTOM} seed={0} />
        </SessionProvider>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getAllByRole("button", { name: /.+/ }).at(-1)!);

    // Only the custom-decks key exists; no progress/session keys were added.
    expect(Object.keys(window.localStorage)).toEqual([STORAGE_KEY]);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(before);
  });
});
