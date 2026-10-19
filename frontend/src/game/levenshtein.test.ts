import { describe, expect, test } from "vitest";
import {
  alignStrings,
  damerauLevenshtein,
  isTypoMatch,
  similarityScore,
  toCodePoints,
} from "./levenshtein";

describe("toCodePoints", () => {
  test("splits ASCII strings into single character arrays", () => {
    expect(toCodePoints("hello")).toEqual(["h", "e", "l", "l", "o"]);
  });

  test("properly counts combining diacritics and NFC normalized runes", () => {
    // "e" + combining acute "\u0301" vs composed "é" "\u00e9"
    const decomposed = "e\u0301";
    expect(toCodePoints(decomposed)).toEqual(["é"]);
  });

  test("handles astral plane characters and emojis as single units", () => {
    const text = "A🚀B";
    expect(toCodePoints(text)).toEqual(["A", "🚀", "B"]);
    expect(toCodePoints(text).length).toBe(3);
  });
});

describe("damerauLevenshtein", () => {
  test("returns 0 for identical strings", () => {
    expect(damerauLevenshtein("", "")).toBe(0);
    expect(damerauLevenshtein("apple", "apple")).toBe(0);
    expect(damerauLevenshtein("café", "café")).toBe(0);
  });

  test("handles empty string boundaries", () => {
    expect(damerauLevenshtein("", "abc")).toBe(3);
    expect(damerauLevenshtein("abc", "")).toBe(3);
    expect(damerauLevenshtein("", "a")).toBe(1);
    expect(damerauLevenshtein("a", "")).toBe(1);
  });

  test("calculates single character insertions", () => {
    expect(damerauLevenshtein("cat", "cats")).toBe(1);
    expect(damerauLevenshtein("pomme", "pommes")).toBe(1);
  });

  test("calculates single character deletions", () => {
    expect(damerauLevenshtein("cats", "cat")).toBe(1);
    expect(damerauLevenshtein("pomme", "pome")).toBe(1);
  });

  test("calculates single character substitutions", () => {
    expect(damerauLevenshtein("cat", "bat")).toBe(1);
    expect(damerauLevenshtein("chien", "chian")).toBe(1);
  });

  test("correctly scores adjacent transpositions as 1 edit operation", () => {
    // In standard Levenshtein, transposition costs 2 (one deletion + one insertion)
    // In Damerau-Levenshtein, transposition costs exactly 1
    expect(damerauLevenshtein("teh", "the")).toBe(1);
    expect(damerauLevenshtein("amison", "maison")).toBe(1);
    expect(damerauLevenshtein("maiosn", "maison")).toBe(1);
    expect(damerauLevenshtein("recieve", "receive")).toBe(1);
  });

  test("scores non-adjacent character swaps as 2 operations", () => {
    // "a" and "c" swapped around "b" -> "cba" vs "abc" is not adjacent
    expect(damerauLevenshtein("cba", "abc")).toBe(2);
  });

  test("calculates multi-step transformations", () => {
    expect(damerauLevenshtein("kitten", "sitting")).toBe(3);
    expect(damerauLevenshtein("rosettacode", "raisethysword")).toBe(8);
  });

  test("handles multi-byte unicode and accented characters", () => {
    expect(damerauLevenshtein("Mädchen", "Madchen")).toBe(1);
    expect(damerauLevenshtein("straße", "strasse")).toBe(2);
    expect(damerauLevenshtein("とうきょう", "とうきょ")).toBe(1);
  });
});

describe("similarityScore", () => {
  test("returns 1.0 for identical strings", () => {
    expect(similarityScore("", "")).toBe(1.0);
    expect(similarityScore("bonjour", "bonjour")).toBe(1.0);
  });

  test("returns 0.0 for completely disjoint strings", () => {
    expect(similarityScore("", "xyz")).toBe(0.0);
    expect(similarityScore("abc", "xyz")).toBe(0.0);
  });

  test("calculates proportional similarity within [0, 1]", () => {
    const score = similarityScore("kitten", "sitting"); // 3 edits, max length 7 -> 4/7
    expect(score).toBeCloseTo(4 / 7, 3);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });
});

describe("isTypoMatch", () => {
  test("rejects exact matches (exact is not a typo)", () => {
    expect(isTypoMatch("pomme", "pomme")).toBe(false);
  });

  test("rejects typos on short words of length <= 3", () => {
    // 1-letter change is too significant for 3-letter words (e.g. cat/bat, eau/feu)
    expect(isTypoMatch("bat", "cat")).toBe(false);
    expect(isTypoMatch("eu", "eau")).toBe(false);
    expect(isTypoMatch("teh", "the")).toBe(false);
  });

  test("accepts single-character slips on words of length 4 to 7", () => {
    expect(isTypoMatch("pome", "pomme")).toBe(true); // deletion
    expect(isTypoMatch("chiene", "chien")).toBe(true); // insertion
    expect(isTypoMatch("chian", "chien")).toBe(true); // substitution
    expect(isTypoMatch("maiosn", "maison")).toBe(true); // transposition
  });

  test("rejects two-character errors on words of length 4 to 7", () => {
    expect(isTypoMatch("pme", "pomme")).toBe(false); // 2 deletions
    expect(isTypoMatch("chianx", "chien")).toBe(false); // 2 edits
  });

  test("accepts up to 2-character slips on long words (length >= 8) with >= 80% similarity", () => {
    // "bibliotheque" is 12 letters
    expect(isTypoMatch("biblioteque", "bibliotheque")).toBe(true); // 1 edit, >80% (11/12 = 91.7%)
    expect(isTypoMatch("bibliotque", "bibliotheque")).toBe(true); // 2 edits (10/12 = 83.3% >= 80%)
    expect(isTypoMatch("restaurant", "restaraunt")).toBe(true); // 1 transposition (9/10 = 90% >= 80%)
    expect(isTypoMatch("guten morgen", "gutn morgn")).toBe(true); // 2 edits (10/12 = 83.3% >= 80%)
  });

  test("rejects heavy misspellings on long words", () => {
    // 3 edits on length 10
    expect(isTypoMatch("rstornt", "restaurant")).toBe(false);
  });

  test("boundary tests for word lengths 3, 4, 7, and 8", () => {
    // Length 3: strictly 0 typos accepted
    expect(isTypoMatch("teh", "the")).toBe(false); // len 3, dist 1 -> false
    expect(isTypoMatch("ca", "cat")).toBe(false); // len 3, dist 1 -> false
    expect(isTypoMatch("eau", "eau")).toBe(false); // len 3, dist 0 -> false (exact, not typo)

    // Length 4: dist 1 accepted, dist 2 rejected
    expect(isTypoMatch("chat", "chats")).toBe(true); // len 5, dist 1 -> true
    expect(isTypoMatch("bok", "book")).toBe(true); // len 4, dist 1 -> true
    expect(isTypoMatch("bk", "book")).toBe(false); // len 4, dist 2 -> false

    // Length 7: dist 1 accepted, dist 2 rejected
    expect(isTypoMatch("bonjour", "bonjoure")).toBe(true); // len 7, dist 1 -> true
    expect(isTypoMatch("bnjour", "bonjour")).toBe(true); // len 7, dist 1 -> true
    expect(isTypoMatch("bnjor", "bonjour")).toBe(false); // len 7, dist 2 -> false

    // Length 8: dist 1 accepted (sim 7/8 = 0.875 >= 0.80); dist 2 rejected (sim 6/8 = 0.75 < 0.80)
    // "sandwich" has length 8
    expect(isTypoMatch("sandwhich", "sandwich")).toBe(true); // len 8, dist 1 -> true
    expect(isTypoMatch("sndwich", "sandwich")).toBe(true); // len 8, dist 1, sim 7/8 = 0.875 -> true
    expect(isTypoMatch("sndwch", "sandwich")).toBe(false); // len 8, dist 2, sim 6/8 = 0.75 (< 0.80) -> false
    expect(isTypoMatch("sndw", "sandwich")).toBe(false); // len 8, dist 4 -> false
  });
});

describe("80% similarity threshold boundary tests for words of length >= 8", () => {
  test("answers exactly at the 80% threshold (length 10, distance 2 -> sim = 0.80) are accepted", () => {
    // Target length 10: "dictionary"
    // User types "diktionari": 2 substitutions ('c' -> 'k', 'y' -> 'i')
    // Distance = 2, maxLen = 10, similarity = 1 - 2/10 = 0.80 (exactly 80%)
    expect(similarityScore("diktionari", "dictionary")).toBe(0.8);
    expect(damerauLevenshtein("diktionari", "dictionary")).toBe(2);
    expect(isTypoMatch("diktionari", "dictionary")).toBe(true);

    // Another length 10 example: "sandwiches"
    // User types "sndwichess" (1 deletion 'a' + 1 insertion 's' -> dist 2, len 10)
    // Distance = 2, maxLen = 10, similarity = 1 - 2/10 = 0.80
    expect(similarityScore("sndwichess", "sandwiches")).toBe(0.8);
    expect(isTypoMatch("sndwichess", "sandwiches")).toBe(true);
  });

  test("answers strictly below the 80% threshold with distance 2 are rejected", () => {
    // Target length 8: "sandwich"
    // User types "sndwch" (2 deletions: 'a' and 'i')
    // Distance = 2, maxLen = 8, similarity = 6/8 = 0.75 (75% < 80%)
    expect(similarityScore("sndwch", "sandwich")).toBe(0.75);
    expect(isTypoMatch("sndwch", "sandwich")).toBe(false);

    // Target length 9: "wonderful"
    // User types "wnderfuls" (1 deletion 'o' + 1 insertion 's' -> dist 2, len 9)
    // Distance = 2, maxLen = 9, similarity = 7/9 = 0.7777... (77.8% < 80%)
    expect(similarityScore("wnderfuls", "wonderful")).toBeCloseTo(0.7778, 3);
    expect(isTypoMatch("wnderfuls", "wonderful")).toBe(false);
  });

  test("answers strictly above the 80% threshold with distance 1 or 2 are accepted", () => {
    // Length 8 with 1 edit: similarity = 7/8 = 0.875 (87.5% > 80%)
    expect(similarityScore("sndwich", "sandwich")).toBe(0.875);
    expect(isTypoMatch("sndwich", "sandwich")).toBe(true);

    // Length 9 with 1 edit: similarity = 8/9 = 0.8889 (88.9% > 80%)
    expect(similarityScore("wnderful", "wonderful")).toBeCloseTo(0.8889, 3);
    expect(isTypoMatch("wnderful", "wonderful")).toBe(true);

    // Length 11 with 2 edits: "infrmationn" vs "information"
    // Distance = 2, maxLen = 11, similarity = 9/11 = 0.8182 (81.8% > 80%)
    expect(similarityScore("infrmationn", "information")).toBeCloseTo(0.8182, 3);
    expect(isTypoMatch("infrmationn", "information")).toBe(true);

    // Length 12 with 2 edits: "bibliotque" vs "bibliotheque"
    // Distance = 2, maxLen = 12, similarity = 10/12 = 0.8333 (83.3% > 80%)
    expect(similarityScore("bibliotque", "bibliotheque")).toBeCloseTo(0.8333, 3);
    expect(isTypoMatch("bibliotque", "bibliotheque")).toBe(true);
  });

  test("answers with distance > 2 are rejected even if similarity >= 80%", () => {
    // Length 16: "misunderstanding" (len 16)
    // User types "msundrstandin" -> 3 deletions ('i', 'e', 'g')
    // Distance = 3, maxLen = 16, similarity = 13/16 = 0.8125 (81.25% >= 80%)
    expect(similarityScore("msundrstandin", "misunderstanding")).toBe(0.8125);
    expect(damerauLevenshtein("msundrstandin", "misunderstanding")).toBe(3);
    expect(isTypoMatch("msundrstandin", "misunderstanding")).toBe(false);
  });
});

describe("alignStrings traceback and character-level highlighting", () => {
  test("returns full match operations for identical strings", () => {
    const res = alignStrings("cat", "cat");
    expect(res.distance).toBe(0);
    expect(res.similarity).toBe(1.0);
    expect(res.explanation).toBe("Exact match");
    expect(res.operations).toHaveLength(3);
    expect(res.operations.every((op) => op.type === "match")).toBe(true);
    expect(res.userHighlights.map((h) => h.status)).toEqual(["match", "match", "match"]);
    expect(res.targetHighlights.map((h) => h.status)).toEqual(["match", "match", "match"]);
  });

  test("identifies missing character (deletion) with explanation", () => {
    const res = alignStrings("pome", "pomme");
    expect(res.distance).toBe(1);
    expect(res.explanation).toBe("Missing letter 'm'");
    expect(res.targetHighlights.find((h) => h.status === "missing")?.char).toBe("m");
  });

  test("identifies extra character (insertion) with explanation", () => {
    const res = alignStrings("pommes", "pomme");
    expect(res.distance).toBe(1);
    expect(res.explanation).toBe("Extra letter 's'");
    expect(res.userHighlights.find((h) => h.status === "extra")?.char).toBe("s");
  });

  test("identifies substituted character with explanation", () => {
    const res = alignStrings("chian", "chien");
    expect(res.distance).toBe(1);
    expect(res.explanation).toBe("Typed 'a' instead of 'e'");
    expect(res.userHighlights.find((h) => h.status === "substituted")?.char).toBe("a");
    expect(res.targetHighlights.find((h) => h.status === "substituted")?.char).toBe("e");
  });

  test("identifies transposed characters with explanation", () => {
    const res = alignStrings("maiosn", "maison");
    expect(res.distance).toBe(1);
    expect(res.explanation).toBe("Swapped 'os' instead of 'so'");
    expect(res.userHighlights.filter((h) => h.status === "transposed")).toHaveLength(2);
    expect(res.targetHighlights.filter((h) => h.status === "transposed")).toHaveLength(2);
  });

  test("handles Japanese kana text alignment", () => {
    const res = alignStrings("とうきょ", "とうきょう");
    expect(res.distance).toBe(1);
    expect(res.explanation).toBe("Missing letter 'う'");
    expect(res.targetHighlights.find((h) => h.status === "missing")?.char).toBe("う");
  });

  test("handles German umlauts alignment", () => {
    const res = alignStrings("Madchen", "Mädchen");
    expect(res.distance).toBe(1);
    expect(res.explanation).toBe("Typed 'a' instead of 'ä'");
    expect(res.targetHighlights.find((h) => h.status === "substituted")?.char).toBe("ä");
  });

  test("handles repeated characters", () => {
    // "helllo" has extra 'l'
    const extra = alignStrings("helllo", "hello");
    expect(extra.distance).toBe(1);
    expect(extra.explanation).toBe("Extra letter 'l'");

    // "helo" misses 'l'
    const missing = alignStrings("helo", "hello");
    expect(missing.distance).toBe(1);
    expect(missing.explanation).toBe("Missing letter 'l'");
  });

  test("handles multi-word phrases with spaces", () => {
    const res = alignStrings("pome de terre", "pomme de terre");
    expect(res.distance).toBe(1);
    expect(res.explanation).toBe("Missing letter 'm'");
    expect(isTypoMatch("pome de terre", "pomme de terre")).toBe(true);
  });
});

