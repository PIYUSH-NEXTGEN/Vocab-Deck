/**
 * Damerau-Levenshtein distance & fuzzy string metric engine.
 *
 * Algorithm Variant:
 * - Computes the Restricted Damerau-Levenshtein distance, formally known as the
 *   Optimal String Alignment (OSA) distance.
 * - Supports four elementary edit operations with uniform unit cost (cost 1):
 *   1. Insertion (cost 1)
 *   2. Deletion (cost 1)
 *   3. Substitution (cost 1)
 *   4. Adjacent Transposition (cost 1)
 * - Condition/Restriction: Enforces the restricted edit distance condition that
 *   no substring is edited more than once (e.g. adjacent characters can be swapped,
 *   but neither may subsequently be edited in the same alignment sequence). This models
 *   human typing slips precisely while maintaining an exact dynamic programming formulation.
 *
 * Complexity:
 * - Time Complexity: O(m * n) where m and n are string lengths in Unicode code points.
 *   Every cell (i, j) in the (m + 1) x (n + 1) dynamic programming matrix is computed in O(1) time.
 * - Space Complexity: O(m * n) for the dynamic programming alignment matrix, necessary
 *   to support the full optimal alignment traceback and character-level highlight generation.
 *
 * Rules:
 * - Pure algorithm, zero external dependencies.
 * - Unicode code point aware (handles astral plane characters, surrogate pairs & NFC strings properly).
 * - Normalized similarity: similarity(a, b) in [0.0, 1.0].
 * - Pedagogical typo classification based on word length thresholds.
 * - Full alignment traceback with character-level operation classification.
 */

/**
 * Split a string into an array of Unicode characters / code points.
 * Prevents surrogate-pair splitting and ensures multi-byte runes count as 1 character.
 */
export function toCodePoints(str: string): string[] {
  return Array.from(str.normalize("NFC"));
}

/**
 * Calculates the restricted Damerau-Levenshtein distance (optimal string alignment)
 * between two strings.
 *
 * Algorithm variant: Optimal String Alignment (restricted edit distance).
 * Time complexity: O(m * n)
 * Space complexity: O(m * n)
 */
export function damerauLevenshtein(a: string, b: string): number {
  const charsA = toCodePoints(a);
  const charsB = toCodePoints(b);
  const m = charsA.length;
  const n = charsB.length;

  if (m === 0) return n;
  if (n === 0) return m;

  // Initialize (m + 1) x (n + 1) dynamic programming matrix
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));

  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = charsA[i - 1] === charsB[j - 1] ? 0 : 1;

      // Calculate minimal cost among deletion, insertion, and substitution
      let minCost = Math.min(
        dp[i - 1][j] + 1, // deletion
        dp[i][j - 1] + 1, // insertion
        dp[i - 1][j - 1] + cost, // substitution / match
      );

      // Check adjacent transposition
      if (
        i > 1 &&
        j > 1 &&
        charsA[i - 1] === charsB[j - 2] &&
        charsA[i - 2] === charsB[j - 1]
      ) {
        minCost = Math.min(minCost, dp[i - 2][j - 2] + 1);
      }

      dp[i][j] = minCost;
    }
  }

  return dp[m][n];
}

/** Explicit alias for damerauLevenshtein designating the Optimal String Alignment (OSA) variant. */
export const optimalStringAlignment = damerauLevenshtein;

/**
 * Normalized similarity score between two strings in range [0.0, 1.0].
 * 1.0 = identical; 0.0 = completely disjoint.
 */
export function similarityScore(a: string, b: string): number {
  const charsA = toCodePoints(a);
  const charsB = toCodePoints(b);
  const maxLen = Math.max(charsA.length, charsB.length);
  if (maxLen === 0) return 1.0;
  const dist = damerauLevenshtein(a, b);
  return Math.max(0, 1.0 - dist / maxLen);
}

/**
 * Determines whether a distance counts as a pedagogical "typo" / near-miss.
 *
 * Pedagogical threshold guidelines:
 * - Length <= 3: Typo tolerance disabled (e.g. "eau", "cat", "the"). A 1-char change is >33% of the word.
 * - Length 4-7: Distance of exactly 1 edit is a typo (e.g. "pome" -> "pomme", "chiene" -> "chien", "amiosn" -> "maison").
 * - Length >= 8: Distance <= 2 is a typo provided similarity >= 0.80 (80% match).
 */
export function isTypoMatch(userText: string, targetText: string): boolean {
  const dist = damerauLevenshtein(userText, targetText);
  if (dist === 0) return false; // exact match, not a typo

  const targetLen = toCodePoints(targetText).length;
  if (targetLen <= 3) return false;

  if (targetLen >= 4 && targetLen <= 7) {
    return dist === 1;
  }

  // targetLen >= 8: distance <= 2 and similarity >= 80%
  const sim = similarityScore(userText, targetText);
  return dist <= 2 && sim >= 0.8;
}

export type EditOpType = "match" | "insertion" | "deletion" | "substitution" | "transposition";

export interface EditOperation {
  type: EditOpType;
  userChar?: string;
  targetChar?: string;
  description: string;
}

export interface CharacterHighlight {
  char: string;
  status: "match" | "extra" | "missing" | "substituted" | "transposed";
}

export interface AlignmentResult {
  distance: number;
  similarity: number;
  operations: EditOperation[];
  userHighlights: CharacterHighlight[];
  targetHighlights: CharacterHighlight[];
  explanation: string;
}

/**
 * Computes optimal string alignment and generates character-level highlights
 * along with a natural language explanation of edits.
 */
export function alignStrings(userText: string, targetText: string): AlignmentResult {
  const charsA = toCodePoints(userText);
  const charsB = toCodePoints(targetText);
  const m = charsA.length;
  const n = charsB.length;

  // Build full DP matrix for traceback
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = charsA[i - 1] === charsB[j - 1] ? 0 : 1;
      let minCost = Math.min(
        dp[i - 1][j] + 1, // extra in user
        dp[i][j - 1] + 1, // missing in user
        dp[i - 1][j - 1] + cost, // match or substitution
      );

      if (
        i > 1 &&
        j > 1 &&
        charsA[i - 1] === charsB[j - 2] &&
        charsA[i - 2] === charsB[j - 1]
      ) {
        minCost = Math.min(minCost, dp[i - 2][j - 2] + 1);
      }
      dp[i][j] = minCost;
    }
  }

  const distance = dp[m][n];
  const maxLen = Math.max(m, n);
  const similarity = maxLen === 0 ? 1.0 : Math.max(0, 1.0 - distance / maxLen);

  // Traceback from (m, n) down to (0, 0)
  let i = m;
  let j = n;
  const rawOps: {
    type: EditOpType;
    userChars: string[];
    targetChars: string[];
  }[] = [];

  while (i > 0 || j > 0) {
    // 1. Check transposition
    if (
      i > 1 &&
      j > 1 &&
      charsA[i - 1] === charsB[j - 2] &&
      charsA[i - 2] === charsB[j - 1] &&
      dp[i][j] === dp[i - 2][j - 2] + 1
    ) {
      rawOps.push({
        type: "transposition",
        userChars: [charsA[i - 2], charsA[i - 1]],
        targetChars: [charsB[j - 2], charsB[j - 1]],
      });
      i -= 2;
      j -= 2;
      continue;
    }

    // 2. Check match
    if (i > 0 && j > 0 && charsA[i - 1] === charsB[j - 1] && dp[i][j] === dp[i - 1][j - 1]) {
      rawOps.push({
        type: "match",
        userChars: [charsA[i - 1]],
        targetChars: [charsB[j - 1]],
      });
      i -= 1;
      j -= 1;
      continue;
    }

    // 3. Check substitution
    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      rawOps.push({
        type: "substitution",
        userChars: [charsA[i - 1]],
        targetChars: [charsB[j - 1]],
      });
      i -= 1;
      j -= 1;
      continue;
    }

    // 4. Check extra character in user submission (insertion)
    if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      rawOps.push({
        type: "insertion",
        userChars: [charsA[i - 1]],
        targetChars: [],
      });
      i -= 1;
      continue;
    }

    // 5. Check missing character in user submission (deletion)
    if (j > 0 && dp[i][j] === dp[i][j - 1] + 1) {
      rawOps.push({
        type: "deletion",
        userChars: [],
        targetChars: [charsB[j - 1]],
      });
      j -= 1;
      continue;
    }

    break;
  }

  // Reverse ops so they read left-to-right
  rawOps.reverse();

  const operations: EditOperation[] = [];
  const explanations: string[] = [];
  const userHighlights: CharacterHighlight[] = [];
  const targetHighlights: CharacterHighlight[] = [];

  for (const op of rawOps) {
    if (op.type === "match") {
      operations.push({
        type: "match",
        userChar: op.userChars[0],
        targetChar: op.targetChars[0],
        description: `Matched '${op.userChars[0]}'`,
      });
      userHighlights.push({ char: op.userChars[0], status: "match" });
      targetHighlights.push({ char: op.targetChars[0], status: "match" });
    } else if (op.type === "transposition") {
      const uPair = op.userChars.join("");
      const tPair = op.targetChars.join("");
      const desc = `Swapped '${uPair}' instead of '${tPair}'`;
      operations.push({
        type: "transposition",
        userChar: uPair,
        targetChar: tPair,
        description: desc,
      });
      explanations.push(desc);
      userHighlights.push(
        { char: op.userChars[0], status: "transposed" },
        { char: op.userChars[1], status: "transposed" },
      );
      targetHighlights.push(
        { char: op.targetChars[0], status: "transposed" },
        { char: op.targetChars[1], status: "transposed" },
      );
    } else if (op.type === "substitution") {
      const u = op.userChars[0];
      const t = op.targetChars[0];
      const desc = `Typed '${u}' instead of '${t}'`;
      operations.push({
        type: "substitution",
        userChar: u,
        targetChar: t,
        description: desc,
      });
      explanations.push(desc);
      userHighlights.push({ char: u, status: "substituted" });
      targetHighlights.push({ char: t, status: "substituted" });
    } else if (op.type === "insertion") {
      const u = op.userChars[0];
      const desc = `Extra letter '${u}'`;
      operations.push({
        type: "insertion",
        userChar: u,
        description: desc,
      });
      explanations.push(desc);
      userHighlights.push({ char: u, status: "extra" });
    } else if (op.type === "deletion") {
      const t = op.targetChars[0];
      const desc = `Missing letter '${t}'`;
      operations.push({
        type: "deletion",
        targetChar: t,
        description: desc,
      });
      explanations.push(desc);
      targetHighlights.push({ char: t, status: "missing" });
    }
  }

  const explanation =
    explanations.length > 0 ? explanations.join("; ") : "Exact match";

  return {
    distance,
    similarity,
    operations,
    userHighlights,
    targetHighlights,
    explanation,
  };
}
