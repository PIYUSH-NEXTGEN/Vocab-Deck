import { describe, expect, test } from "vitest";
import {
  MAX_DECK_DESCRIPTION_LENGTH,
  MAX_DECK_NAME_LENGTH,
  MAX_IMPORT_ENTRIES,
  suggestCustomDeckId,
  validateCustomDeck,
} from "../decks/validate";
import { MAX_IMPORT_CHARS, confirmImport, previewImport } from "../decks/importPipeline";
import { duplicateCustomDeck, getCustomDeck, saveCustomDeck } from "../storage/customDecks";
import { reverseDeck } from "../lib/deckItems";
import type { CustomDeckDocument, PlayableDeck } from "../api/types";

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

function doc(entries: unknown[], deck: Record<string, unknown> = {}): unknown {
  return {
    version: 1,
    deck: {
      id: "repro",
      name: "Repro",
      sourceLanguage: "english",
      targetLanguage: "french",
      ...deck,
    },
    entries,
    exportedAt: new Date(0).toISOString(),
  };
}

describe("deck id derivation", () => {
  test("a very long deck name still yields a valid id", () => {
    const id = suggestCustomDeckId("A".repeat(200));
    expect(id.length).toBeLessThanOrEqual(64);
    expect(ID_PATTERN.test(id)).toBe(true);
  });

  test("derived deck ids round-trip through validation", () => {
    const result = validateCustomDeck(
      doc([{ source: "hello", target: "hola" }], { id: "", name: "N".repeat(120) }),
    );
    expect(result.ok).toBe(true);
  });

  test("rows sharing a source get suffixed ids instead of failing", () => {
    const csv = [
      "# deck: Repro",
      "# sourceLanguage: english",
      "# targetLanguage: french",
      "source,target,alternatives,tags",
      "hello,hola,,",
      "hello,salut,,",
    ].join("\n");
    const result = confirmImport(csv, []);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.deck.entries.map((e) => e.id)).toEqual(["hello", "hello-2"]);
    }
  });

  test("explicit duplicate entry ids are still rejected", () => {
    const result = validateCustomDeck(
      doc([
        { id: "same", source: "a", target: "b" },
        { id: "same", source: "c", target: "d" },
      ]),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toMatch(/duplicate entry id "same"/i);
  });
});

describe("import limits", () => {
  test("csv rows with more columns than the header are rejected", () => {
    const csv = [
      "# deck: Repro",
      "# sourceLanguage: english",
      "# targetLanguage: french",
      "source,target",
      "hello,hola,EXTRA",
    ].join("\n");
    const result = confirmImport(csv, []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toMatch(/more columns than the header/i);
  });

  test("oversized deck names and descriptions are rejected", () => {
    const longName = validateCustomDeck(
      doc([{ id: "a", source: "a", target: "b" }], { name: "N".repeat(MAX_DECK_NAME_LENGTH + 1) }),
    );
    expect(longName.ok).toBe(false);
    const longDesc = validateCustomDeck(
      doc([{ id: "a", source: "a", target: "b" }], {
        description: "D".repeat(MAX_DECK_DESCRIPTION_LENGTH + 1),
      }),
    );
    expect(longDesc.ok).toBe(false);
  });

  test("decks with too many entries are rejected", () => {
    const entries = Array.from({ length: MAX_IMPORT_ENTRIES + 1 }, (_, i) => ({
      id: `e-${i}`,
      source: `source-${i}`,
      target: `target-${i}`,
    }));
    const result = validateCustomDeck(doc(entries));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toMatch(/at most 5000/i);
  });

  test("oversized pasted text is rejected before parsing", () => {
    const result = previewImport(`{"version": 1, ${" ".repeat(MAX_IMPORT_CHARS)}}`);
    expect(result.ok).toBe(false);
  });
});

describe("storage and deck helpers", () => {
  test("duplicating a deck deep-copies entry lists", () => {
    const original: CustomDeckDocument = {
      version: 1,
      deck: {
        id: "orig",
        name: "Orig",
        description: "",
        sourceLanguage: "english",
        targetLanguage: "french",
        entryCount: 1,
      },
      entries: [{ id: "a", source: "a", target: "b", alternatives: ["alt"], tags: ["t"] }],
      exportedAt: new Date(0).toISOString(),
    };
    saveCustomDeck(original);
    const copy = duplicateCustomDeck("orig");
    expect(copy).not.toBeNull();
    copy!.entries[0].alternatives.push("mutated");
    expect(getCustomDeck("orig")!.entries[0].alternatives).toEqual(["alt"]);
    expect(getCustomDeck(copy!.deck.id)).not.toBeNull();
  });

  test("reversing a deck with control characters keeps language names intact", () => {
    const deck = {
      id: "d",
      name: "D",
      description: "English to French",
      sourceLanguage: "english",
      targetLanguage: "french",
      entryCount: 0,
      entries: [],
      origin: "builtin",
    } as PlayableDeck;
    const withNul = { ...deck, description: "English\u0000 to French" };
    expect(reverseDeck(withNul).description).toBe("French\u0000 to English");
  });
});
