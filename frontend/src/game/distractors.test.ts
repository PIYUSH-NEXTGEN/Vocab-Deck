import { describe, expect, test } from "vitest";
import type { VocabularyEntry } from "../api/types";
import { buildQuizRounds, seededRng, type RetentionRecord } from "./engine";
import {
  bigramSimilarity,
  createConfusionMatrix,
  getConfusableEntryIds,
  getEntryConfusionTotal,
  getPairConfusionCount,
  getTopConfusedPairs,
  lengthProximity,
  phoneticSkeleton,
  recordConfusion,
  scoreDistractor,
  selectSmartDistractors,
  tagSimilarity,
} from "./distractors";

function makeEntry(
  id: string,
  source: string,
  target: string,
  tags: string[] = [],
  alternatives: string[] = [],
): VocabularyEntry {
  return { id, source, target, alternatives, tags };
}

describe("phoneticSkeleton and linguistic primitives", () => {
  test("folds diacritics, German ligatures, and doubled consonants consistently", () => {
    expect(phoneticSkeleton("Straße")).toBe(phoneticSkeleton("strasse"));
    expect(phoneticSkeleton("café")).toBe(phoneticSkeleton("kaffee"));
    expect(phoneticSkeleton("photo")).toBe(phoneticSkeleton("foto"));
    expect(phoneticSkeleton("Häuser")).toBe("hauser");
    expect(phoneticSkeleton("cœur")).toBe(phoneticSkeleton("coeur"));
    expect(phoneticSkeleton("cœur")).toBe("koeur");
  });

  test("folds Japanese Katakana/Hiragana and dakuten softly while handling empty/short inputs", () => {
    expect(phoneticSkeleton("カメラ")).toBe(phoneticSkeleton("かめら"));
    expect(phoneticSkeleton("コーヒー")).toBe(phoneticSkeleton("こーひー"));
    expect(phoneticSkeleton("ばし")).toBe(phoneticSkeleton("はし"));
    expect(phoneticSkeleton("")).toBe("");
    expect(phoneticSkeleton("   ")).toBe("");
    expect(phoneticSkeleton("eau")).toBe("eau");
  });

  test("computes bounded symmetric bigram similarity, length proximity, and tag Jaccard", () => {
    expect(bigramSimilarity("", "")).toBe(1);
    expect(bigramSimilarity("", "abc")).toBe(0);
    expect(bigramSimilarity("a", "a")).toBe(1);
    expect(bigramSimilarity("a", "b")).toBe(0);
    expect(bigramSimilarity("house", "mouse")).toBeCloseTo(bigramSimilarity("mouse", "house"));
    expect(bigramSimilarity("house", "mouse")).toBeGreaterThan(
      bigramSimilarity("house", "refrigerator"),
    );

    expect(lengthProximity("cat", "dog")).toBe(1);
    expect(lengthProximity("", "")).toBe(1);
    expect(lengthProximity("cat", "refrigerator")).toBeLessThan(0.3);

    expect(tagSimilarity([], ["noun"])).toBe(0);
    expect(tagSimilarity([" Noun "], ["noun"])).toBe(1);
    expect(tagSimilarity(["noun", "food"], ["noun", "drink"])).toBeCloseTo(1 / 3);
  });
});

describe("confusion matrix tracking", () => {
  test("tracks bidirectional counts, directionality, and source breakdown without mutation", () => {
    const empty = createConfusionMatrix();
    expect(empty.size).toBe(0);

    // Self-confusion and missing IDs are ignored safely.
    expect(recordConfusion(empty, "haus", "haus", "quiz", 100)).toBe(empty);
    expect(recordConfusion(empty, "", "maus", "quiz", 100)).toBe(empty);

    const m1 = recordConfusion(empty, "haus", "maus", "quiz", 100);
    expect(empty.size).toBe(0);
    expect(getPairConfusionCount(m1, "haus", "maus")).toBe(1);
    expect(getPairConfusionCount(m1, "maus", "haus")).toBe(1);
    expect(getEntryConfusionTotal(m1, "haus")).toBe(1);
    expect(getEntryConfusionTotal(m1, "maus")).toBe(1);

    const m2 = recordConfusion(m1, "maus", "haus", "matching", 200);
    expect(getPairConfusionCount(m2, "haus", "maus")).toBe(2);

    const entries = [
      makeEntry("haus", "das Haus", "the house"),
      makeEntry("maus", "die Maus", "the mouse"),
      makeEntry("auto", "das Auto", "the car"),
    ];
    const m3 = recordConfusion(m2, "auto", "maus", "quiz", 300);

    const pairs = getTopConfusedPairs(m3, entries, 5);
    expect(pairs).toHaveLength(2);
    expect(pairs[0].total).toBe(2);
    expect(pairs[0].sources).toEqual({ quiz: 1, matching: 1 });
    expect(pairs[1].total).toBe(1);

    // Highest severity total goes to "maus" (involved in 3 total events)
    expect(getConfusableEntryIds(m3)[0]).toBe("maus");
  });
});

describe("smart distractor scoring and difficulty strategies", () => {
  const target = makeEntry("house", "das Haus", "the house", ["noun"]);
  const lookalike = makeEntry("mouse", "die Maus", "the mouse", ["noun"]);
  const mild = makeEntry("garden", "der Garten", "the garden", ["noun"]);
  const verbPhrase = makeEntry("run", "laufen", "to run quickly across the street", ["verb"]);

  const pool = [verbPhrase, mild, lookalike];

  test("challenging mode ranks orthographic & same-tag lookalikes highest", () => {
    const result = selectSmartDistractors(target, pool, 2, {
      difficulty: "challenging",
      rng: seededRng(42),
    });

    expect(result.distractors[0]).toBe("the mouse");
    expect(result.insights["the mouse"].reasons).toContain("similar-spelling");
    expect(result.insights["the mouse"].reasons).toContain("same-category");
  });

  test("standard mode ranks broadly contrasting distractors highest", () => {
    const result = selectSmartDistractors(target, pool, 1, {
      difficulty: "standard",
      rng: seededRng(42),
    });

    expect(result.distractors).toEqual(["to run quickly across the street"]);
  });

  test("adaptive mode increases desired plausibility as Leitner mastery rises", () => {
    const lowRetention: RetentionRecord = {
      box: 0,
      consecutiveCorrect: 0,
      totalAttempts: 2,
      lastAttemptCorrect: false,
    };
    const highRetention: RetentionRecord = {
      box: 3,
      consecutiveCorrect: 4,
      totalAttempts: 4,
      lastAttemptCorrect: true,
    };

    const lowScoreLookalike = scoreDistractor(target, lookalike, {
      difficulty: "adaptive",
      retentionRecord: lowRetention,
    });
    const highScoreLookalike = scoreDistractor(target, lookalike, {
      difficulty: "adaptive",
      retentionRecord: highRetention,
    });

    expect(highScoreLookalike.score).toBeGreaterThan(lowScoreLookalike.score);
  });

  test("previously confused entries are prioritized even when lexically distant on huge decks", () => {
    const confusedDistant = makeEntry("distant", "fern", "extremely distant mountain horizon");
    const matrix = recordConfusion(createConfusionMatrix(), target.id, confusedDistant.id, "matching");

    const hugePool: VocabularyEntry[] = [
      confusedDistant,
      ...Array.from({ length: 240 }, (_, i) =>
        makeEntry(`w-${i}`, `wort-${i}`, `word-${i}`, ["noun"]),
      ),
    ];

    const selected = selectSmartDistractors(target, hugePool, 3, {
      difficulty: "challenging",
      confusionMatrix: matrix,
      rng: seededRng(7),
    });

    expect(selected.distractors).toContain(confusedDistant.target);
    expect(selected.insights[confusedDistant.target].reasons).toContain("previously-confused");
    expect(selected.insights[confusedDistant.target].confusionCount).toBe(1);
  });

  test("buildQuizRounds excludes alternatives, deduplicates targets, and is deterministic", () => {
    const entries = [
      makeEntry("cat", "chat", "cat", ["noun"], ["kitten"]),
      makeEntry("kitten-dup", "chaton", "kitten", ["noun"]),
      makeEntry("hat", "chapeau", "hat", ["noun"]),
      makeEntry("bat", "chauve-souris", "bat", ["noun"]),
      makeEntry("car", "voiture", "car", ["noun"]),
    ];

    const r1 = buildQuizRounds(entries, seededRng(11), 5, [entries[0]], {
      difficulty: "challenging",
    });
    const r2 = buildQuizRounds(entries, seededRng(11), 5, [entries[0]], {
      difficulty: "challenging",
    });

    expect(r1).toHaveLength(1);
    expect(r1[0].options).toEqual(r2[0].options);
    expect(r1[0].options).not.toContain("kitten");
    expect(new Set(r1[0].options).size).toBe(r1[0].options.length);
  });

  test("prioritizeConfused orders previously confused questions to the front of review rounds", () => {
    const entries = [
      makeEntry("a", "das Haus", "house"),
      makeEntry("b", "die Maus", "mouse"),
      makeEntry("c", "der Baum", "tree"),
      makeEntry("d", "das Brot", "bread"),
    ];
    const matrix = recordConfusion(createConfusionMatrix(), "b", "c", "quiz");

    const rounds = buildQuizRounds(entries, seededRng(3), 4, entries, {
      difficulty: "challenging",
      confusionMatrix: matrix,
      prioritizeConfused: true,
    });

    const firstTwoIds = rounds.slice(0, 2).map((r) => r.entry.id);
    expect(firstTwoIds.sort()).toEqual(["b", "c"]);
  });
});
