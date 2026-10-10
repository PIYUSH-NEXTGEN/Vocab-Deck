import { describe, expect, test } from "vitest";
import type { VocabularyEntry } from "../api/types";
import { MAX_MATCH_PAIRS, MAX_QUIZ_ROUNDS, buildMatchBoard, buildQuizRounds, buildFlashcardOrder } from "./engine";
import { createRng, shuffle } from "./rng";
import { matchesTranslation, normalizeComparable, normalizeForTyping, stripAccents } from "./text";

function entry(id: string, source: string, target: string, alternatives: string[] = []): VocabularyEntry {
  return { id, source, target, alternatives, tags: [] };
}

const DECK: VocabularyEntry[] = [
  entry("a", "alpha", "un", ["uno"]),
  entry("b", "beta", "deux"),
  entry("c", "gamma", "trois"),
  entry("d", "delta", "quatre"),
  entry("e", "epsilon", "cinq"),
];

describe("rng and shuffle", () => {
  test("same seed produces the same order", () => {
    const first = shuffle(DECK, createRng(7));
    const second = shuffle(DECK, createRng(7));
    expect(first.map((e) => e.id)).toEqual(second.map((e) => e.id));
    expect(first.map((e) => e.id)).not.toEqual(DECK.map((e) => e.id));
  });

  test("shuffling preserves every element exactly once", () => {
    const shuffled = shuffle(DECK, createRng(99));
    expect(shuffled).toHaveLength(DECK.length);
    expect(new Set(shuffled.map((e) => e.id)).size).toBe(DECK.length);
  });

  test("shuffle does not mutate the input", () => {
    const input = [1, 2, 3, 4, 5];
    const copy = [...input];
    shuffle(input, createRng(3));
    expect(input).toEqual(copy);
  });
});

describe("buildFlashcardOrder", () => {
  test("covers every entry exactly once", () => {
    const order = buildFlashcardOrder(DECK, createRng(11));
    expect(order).toHaveLength(DECK.length);
    expect(new Set(order.map((e) => e.id)).size).toBe(DECK.length);
  });

  test("works on an empty deck", () => {
    expect(buildFlashcardOrder([], createRng(1))).toEqual([]);
  });
});

describe("buildQuizRounds", () => {
  test("options are distinct and always include the answer", () => {
    const rounds = buildQuizRounds(DECK, createRng(5));
    expect(rounds).toHaveLength(DECK.length);
    for (const round of rounds) {
      expect(new Set(round.options).size).toBe(round.options.length);
      expect(round.options).toContain(round.answer);
      expect(round.options.length).toBeGreaterThanOrEqual(2);
      expect(round.options.length).toBeLessThanOrEqual(4);
    }
  });

  test("never offers the answer's alternatives as distractors", () => {
    const rounds = buildQuizRounds(DECK, createRng(5));
    for (const round of rounds) {
      for (const alternative of round.entry.alternatives) {
        if (alternative !== round.answer) {
          expect(round.options).not.toContain(alternative);
        }
      }
    }
  });

  test("same translation in two entries cannot be both right and wrong", () => {
    // parle and parlé both translate to "speak": neither may appear as a
    // distractor in the other's round.
    const deck = [
      entry("parle", "parle", "speak"),
      entry("parle-accent", "parlé", "speak"),
      entry("chien", "chien", "dog"),
    ];
    const rounds = buildQuizRounds(deck, createRng(2));
    for (const round of rounds) {
      const occurrences = round.options.filter((o) => o === "speak").length;
      expect(occurrences).toBeLessThanOrEqual(1);
    }
  });

  test("a single-entry deck yields no rounds (never fabricates options)", () => {
    expect(buildQuizRounds([entry("only", "solo", "unique")], createRng(1))).toEqual([]);
  });

  test("a two-entry deck yields two-option rounds", () => {
    const rounds = buildQuizRounds([entry("a", "x", "one"), entry("b", "y", "two")], createRng(4));
    expect(rounds).toHaveLength(2);
    for (const round of rounds) {
      expect(round.options).toHaveLength(2);
    }
  });

  test("a deck where all translations are identical yields no rounds", () => {
    const deck = [entry("a", "x", "same"), entry("b", "y", "same")];
    expect(buildQuizRounds(deck, createRng(1))).toEqual([]);
  });

  test("respects the round cap", () => {
    const big = Array.from({ length: 30 }, (_, i) => entry(`e${i}`, `s${i}`, `t${i}`));
    expect(buildQuizRounds(big, createRng(1), 3)).toHaveLength(3);
    expect(MAX_QUIZ_ROUNDS).toBe(20);
  });
});

describe("buildMatchBoard", () => {
  test("columns are complete but differently ordered", () => {
    const board = buildMatchBoard(DECK, createRng(6));
    expect(board.pairs).toHaveLength(DECK.length);
    expect(board.left).toHaveLength(DECK.length);
    expect(board.right).toHaveLength(DECK.length);
    expect(board.left.map((p) => p.pairId)).not.toEqual(board.right.map((p) => p.pairId));
    expect(new Set(board.pairs.map((p) => p.pairId)).size).toBe(DECK.length);
  });

  test("entries with duplicate translations are excluded and counted", () => {
    const deck = [
      entry("parle", "parle", "speak"),
      entry("parle-accent", "parlé", "speak"),
      entry("chien", "chien", "dog"),
      entry("chat", "chat", "cat"),
    ];
    const board = buildMatchBoard(deck, createRng(8));
    expect(board.excludedCount).toBe(2);
    expect(board.pairs.map((p) => p.pairId).sort()).toEqual(["chat", "chien"]);
    expect(board.pairs.every((p) => new Set(deck.filter((d) => d.target === p.target)).size === 1)).toBe(true);
  });

  test("respects the pair cap", () => {
    const board = buildMatchBoard(DECK, createRng(9), 2);
    expect(board.pairs).toHaveLength(2);
    expect(MAX_MATCH_PAIRS).toBe(12);
  });

  test("a single-entry deck yields a one-pair board", () => {
    const board = buildMatchBoard([entry("only", "solo", "unique")], createRng(1));
    expect(board.pairs).toHaveLength(1);
    expect(board.excludedCount).toBe(0);
  });
});

describe("typing text rules", () => {
  test("NFC, casefold and whitespace normalization", () => {
    expect(normalizeComparable("  Hola   Mundo ")).toBe("hola mundo");
    expect(normalizeComparable("cafe\u0301")).toBe("café");
  });

  test("accent stripping is opt-in", () => {
    expect(stripAccents("café résumé naïve")).toBe("cafe resume naive");
    expect(normalizeForTyping("CAFÉ", { ignoreAccents: true })).toBe("cafe");
    expect(normalizeForTyping("CAFÉ", { ignoreAccents: false })).toBe("café");
  });

  test("matches target and alternatives", () => {
    const item = entry("x", "source", "café", ["coffee house"]);
    expect(matchesTranslation("cafe", item, { ignoreAccents: true })).toBe(true);
    expect(matchesTranslation("café", item, { ignoreAccents: false })).toBe(true);
    expect(matchesTranslation("  CAFE ", item, { ignoreAccents: true })).toBe(true);
    expect(matchesTranslation("coffee house", item)).toBe(true);
    expect(matchesTranslation("tea", item)).toBe(false);
  });

  test("empty input is never valid", () => {
    const item = entry("x", "source", "café");
    expect(matchesTranslation("", item)).toBe(false);
    expect(matchesTranslation("   ", item)).toBe(false);
  });

  test("scripts beyond Latin round-trip", () => {
    const item = entry("d", "Straße", "道", ["みち"]);
    expect(matchesTranslation("道", item)).toBe(true);
    expect(matchesTranslation("みち", item)).toBe(true);
    expect(matchesTranslation("street", item)).toBe(false);
  });
});
