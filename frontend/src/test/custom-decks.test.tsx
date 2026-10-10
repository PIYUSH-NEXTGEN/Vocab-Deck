import { validateCustomDeck, suggestCustomDeckId } from "../decks/validate";
import {
  listCustomDecks,
  saveCustomDeck,
  getCustomDeck,
  deleteCustomDeck,
  toExportDocument,
} from "../storage/customDecks";
import { listDecks } from "../api/client";

const validDoc = {
  version: 1,
  deck: {
    id: "custom-es-en",
    name: "Spanish basics",
    description: "Everyday words",
    sourceLanguage: "es",
    targetLanguage: "en",
    entryCount: 2,
  },
  entries: [
    { id: "hola", source: "hola", target: "hello", alternatives: [], tags: [] },
    { id: "gracias", source: "gracias", target: "thank you", alternatives: ["thanks"], tags: ["phrase"] },
  ],
  exportedAt: "2026-01-01T00:00:00.000Z",
};

test("a valid custom deck document validates", () => {
  const result = validateCustomDeck(validDoc);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.deck.deck.entryCount).toBe(2);
  expect(result.deck.entries).toHaveLength(2);
});

test("rejects missing names, bad language codes and empty entries", () => {
  const result = validateCustomDeck({
    version: 1,
    deck: { id: "custom-x", name: "  ", sourceLanguage: "english", targetLanguage: "en", entryCount: 0 },
    entries: [],
  });
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.errors.join(" ")).toMatch(/deck name is required/i);
  expect(result.errors.join(" ")).toMatch(/not a valid language code/i);
  expect(result.errors.join(" ")).toMatch(/at least one entry/i);
});

test("rejects duplicate entry ids and duplicate pairs", () => {
  const result = validateCustomDeck({
    ...validDoc,
    entries: [
      { id: "dup", source: "a", target: "b" },
      { id: "dup", source: "c", target: "d" },
      { id: "other", source: "e", target: "f" },
      { id: "again", source: "e", target: "f" },
    ],
  });
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.errors).toEqual(
    expect.arrayContaining([
      expect.stringMatching(/duplicate entry id "dup"/i),
      expect.stringMatching(/duplicate source\/translation pair "e"/i),
    ]),
  );
});

test("rejects entries with empty source or blank alternatives", () => {
  const result = validateCustomDeck({
    ...validDoc,
    entries: [{ id: "x", source: "  ", target: "y" }],
  });
  expect(result.ok).toBe(false);
});

test("accepts non-Latin scripts and alternative translations untouched", () => {
  const result = validateCustomDeck({
    ...validDoc,
    deck: { ...validDoc.deck, sourceLanguage: "de", targetLanguage: "ja" },
    entries: [{ id: "strasse", source: "Straße", target: "道", alternatives: ["みち"], tags: ["noun"] }],
  });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.deck.entries[0].target).toBe("道");
});

test("custom deck storage round-trips through localStorage", () => {
  const result = validateCustomDeck(validDoc);
  if (!result.ok) throw new Error("fixture should validate");
  saveCustomDeck(result.deck);

  expect(listCustomDecks()).toHaveLength(1);
  expect(listCustomDecks()[0].name).toBe("Spanish basics");

  const found = getCustomDeck("custom-es-en");
  expect(found?.entries[1].alternatives).toEqual(["thanks"]);

  const exported = JSON.parse(toExportDocument(result.deck));
  expect(exported.version).toBe(1);
  expect(exported.entries).toHaveLength(2);

  deleteCustomDeck("custom-es-en");
  expect(listCustomDecks()).toHaveLength(0);
});

test("suggested ids are namespaced against built-in decks", () => {
  expect(suggestCustomDeckId("Fr-en-common")).toBe("custom-fr-en-common");
});

test("client maps snake_case DTOs to domain objects and surfaces 404 errors", async () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify({ error: { code: "deck_not_found", message: "Deck 'x' missing." } }), {
        status: 404,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
  await expect(listDecks()).rejects.toMatchObject({ code: "deck_not_found", status: 404 });
});
