/**
 * Smart Quiz Distractor & Confusion Matrix Engine.
 *
 * Pure, zero-dependency linguistic similarity scoring and in-session
 * confusion tracking designed to replace uniform random quiz distractors with
 * pedagogically grounded options tailored to learner mastery and past errors.
 *
 * Scoring Signals (all normalized to [0.0, 1.0]):
 * - Orthographic similarity: Restricted Damerau-Levenshtein (OSA) normalized
 *   similarity on NFC-normalized text (`similarityScore`).
 * - Character n-gram overlap: Multiset Sorensen-Dice coefficient over code-point
 *   bigrams, robust to affix swaps and compound words.
 * - Phonetic skeleton similarity: Cross-lingual consonant/vowel & Kana folding
 *   combined with normalized OSA distance (catches homophones like "café"/"Kaffee").
 * - Length proximity: 1 - |m - n| / max(m, n, 1) to balance option shape.
 * - Category/tag overlap: Jaccard similarity on `entry.tags` (e.g. noun vs verb).
 * - Session confusion signal: Bidirectional in-memory pair error weight from Quiz
 *   and Matching modes.
 *
 * Complexity:
 * - Feature extraction (skeleton, n-grams, normalized tags): O(L + T) per entry.
 * - Coarse prefilter for large decks (D > 120): O(D * (L + T)) without DP allocation,
 *   retaining all confused entries plus the top K = 120 coarse candidates for exact reranking.
 * - Single candidate exact evaluation: O(L_q * L_c + T_q + T_c) time,
 *   O(L_q * L_c) space for OSA alignment; L is small for vocabulary items.
 * - Ranking D candidate distractors for one question:
 *   O(D * (L + T) + min(D, 120) * (L^2 + D_confused) + min(D, 120) log min(D, 120)).
 * - Confusion matrix update and lookup: O(1) amortized via canonical pair keys.
 */

import type { VocabularyEntry } from "../api/types";
import { similarityScore, toCodePoints } from "./levenshtein";
import { normalizeComparable, stripAccents } from "./text";

export type QuizDifficulty = "standard" | "adaptive" | "challenging";

export type ConfusionSource = "quiz" | "matching";

export type DistractorReason =
  | "previously-confused"
  | "similar-spelling"
  | "sounds-alike"
  | "same-category"
  | "similar-length";

export interface RetentionLike {
  box: number;
  totalAttempts: number;
}

export interface ConfusionEdge {
  /** Lexicographically smaller entry id. */
  entryA: string;
  /** Lexicographically larger entry id. */
  entryB: string;
  /** Count when entryA was expected and entryB was chosen. */
  aToB: number;
  /** Count when entryB was expected and entryA was chosen. */
  bToA: number;
  /** Total bidirectional confusions for this pair. */
  total: number;
  /** Breakdown by game mode. */
  sources: Record<ConfusionSource, number>;
  /** Monotonic / epoch timestamp of the most recent confusion event. */
  lastConfusedAt: number;
}

export type ConfusionMatrix = ReadonlyMap<string, ConfusionEdge>;

export interface ConfusionPairSummary {
  entryA: VocabularyEntry;
  entryB: VocabularyEntry;
  total: number;
  aToB: number;
  bToA: number;
  sources: Record<ConfusionSource, number>;
  lastConfusedAt: number;
}

export interface DistractorInsight {
  entryId: string;
  source: string;
  target: string;
  /** Objective linguistic & tag plausibility in [0, 1]. */
  plausibility: number;
  /** Difficulty-conditioned ranking score used for selection. */
  score: number;
  orthographicSimilarity: number;
  bigramSimilarity: number;
  phoneticSimilarity: number;
  tagSimilarity: number;
  lengthProximity: number;
  confusionCount: number;
  reasons: DistractorReason[];
}

export interface DistractorSelectionResult {
  distractors: string[];
  insights: Record<string, DistractorInsight>;
}

const MAX_LEITNER_BOX = 3;
const COARSE_FILTER_LIMIT = 120;

export interface PreparedEntryFeatures {
  entry: VocabularyEntry;
  normTarget: string;
  charLength: number;
  bigrams: Map<string, number>;
  bigramTotal: number;
  skeleton: string;
  normalizedTags: Set<string>;
}

/** Fold Katakana (\u30a1-\u30f6) to Hiragana (\u3041-\u3096) for kana phonetic equivalence. */
function foldKatakanaToHiragana(value: string): string {
  let out = "";
  for (const ch of Array.from(value)) {
    const code = ch.codePointAt(0);
    if (code !== undefined && code >= 0x30a1 && code <= 0x30f6) {
      out += String.fromCodePoint(code - 0x60);
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * Derive a cross-lingual phonetic & orthographic skeleton in O(L) time.
 *
 * Handles Latin diacritics, Germanic/French ligatures, common consonant clusters
 * (ph->f, sch->sh, ck->k, qu->k, etc.), voiced/unvoiced Japanese kana dakuten,
 * and repeated adjacent characters while preserving short vowel-only words.
 */
export function phoneticSkeleton(value: string): string {
  let text = normalizeComparable(value);
  if (!text) return "";

  // Special ligatures and Latin characters not decomposed by NFD alone
  text = text
    .replace(/ß/g, "ss")
    .replace(/æ/g, "ae")
    .replace(/œ/g, "oe")
    .replace(/ø/g, "o")
    .replace(/ł/g, "l")
    .replace(/đ/g, "d");

  // Strip Latin accents & Japanese dakuten/handakuten so voiced/unvoiced morae match softly
  text = stripAccents(text)
    .normalize("NFD")
    .replace(/[\u3099\u309a]/g, "")
    .normalize("NFC");

  text = foldKatakanaToHiragana(text);

  // Common Latin phonetic equivalence folds (applied on space/letter text)
  text = text
    .replace(/sch/g, "sh")
    .replace(/tch/g, "ch")
    .replace(/ph/g, "f")
    .replace(/qu/g, "k")
    .replace(/ck/g, "k")
    .replace(/tz/g, "ts")
    .replace(/th/g, "t")
    .replace(/c(?=[eiy])/g, "s")
    .replace(/[cq]/g, "k")
    .replace(/x/g, "ks")
    .replace(/w/g, "v")
    .replace(/y/g, "i")
    .replace(/z/g, "s");

  // Collapse consecutive duplicate code points ("kaffee" -> "kafe", "hello" -> "helo")
  const foldedPoints: string[] = [];
  let prev = "";
  for (const cp of toCodePoints(text)) {
    if (cp === prev) continue;
    foldedPoints.push(cp);
    prev = cp;
  }

  return foldedPoints.join("");
}

/**
 * Build a multiset of character 2-grams over NFC Unicode code points.
 */
function extractBigramsFromNormalized(normValue: string): { grams: Map<string, number>; total: number } {
  const points = toCodePoints(normValue);
  const grams = new Map<string, number>();

  if (points.length === 0) return { grams, total: 0 };
  if (points.length === 1) {
    grams.set(points[0], 1);
    return { grams, total: 1 };
  }

  for (let i = 0; i < points.length - 1; i += 1) {
    const gram = points[i] + points[i + 1];
    grams.set(gram, (grams.get(gram) ?? 0) + 1);
  }
  return { grams, total: points.length - 1 };
}

function bigramDiceFromMaps(
  gramsA: Map<string, number>,
  totalA: number,
  gramsB: Map<string, number>,
  totalB: number,
): number {
  if (totalA + totalB === 0) return 0.0;
  let intersection = 0;
  for (const [gram, countA] of gramsA.entries()) {
    const countB = gramsB.get(gram);
    if (countB) {
      intersection += Math.min(countA, countB);
    }
  }
  return (2 * intersection) / (totalA + totalB);
}

/**
 * Multiset Sorensen-Dice bigram similarity in [0.0, 1.0].
 * Time and space complexity: O(m + n) over code points.
 */
export function bigramSimilarity(a: string, b: string): number {
  const normA = normalizeComparable(a);
  const normB = normalizeComparable(b);
  if (normA.length === 0 && normB.length === 0) return 1.0;
  if (normA.length === 0 || normB.length === 0) return 0.0;
  if (normA === normB) return 1.0;

  const { grams: gramsA, total: totalA } = extractBigramsFromNormalized(normA);
  const { grams: gramsB, total: totalB } = extractBigramsFromNormalized(normB);
  return bigramDiceFromMaps(gramsA, totalA, gramsB, totalB);
}

function lengthProximityFromCounts(lenA: number, lenB: number): number {
  const maxLen = Math.max(lenA, lenB);
  if (maxLen === 0) return 1.0;
  return 1 - Math.abs(lenA - lenB) / maxLen;
}

/**
 * Code-point length proximity ratio in [0.0, 1.0].
 */
export function lengthProximity(a: string, b: string): number {
  const lenA = toCodePoints(normalizeComparable(a)).length;
  const lenB = toCodePoints(normalizeComparable(b)).length;
  return lengthProximityFromCounts(lenA, lenB);
}

function normalizeTagSet(tags: readonly string[]): Set<string> {
  const set = new Set<string>();
  for (const tag of tags) {
    const norm = normalizeComparable(tag);
    if (norm.length > 0) set.add(norm);
  }
  return set;
}

function tagSimilarityFromSets(setA: ReadonlySet<string>, setB: ReadonlySet<string>): number {
  if (setA.size === 0 || setB.size === 0) return 0.0;
  let intersection = 0;
  for (const tag of setA) {
    if (setB.has(tag)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0.0 : intersection / union;
}

/**
 * Normalized Jaccard similarity over entry tags in [0.0, 1.0].
 */
export function tagSimilarity(tagsA: readonly string[], tagsB: readonly string[]): number {
  if (tagsA.length === 0 || tagsB.length === 0) return 0.0;
  return tagSimilarityFromSets(normalizeTagSet(tagsA), normalizeTagSet(tagsB));
}

/**
 * Precompute O(L + T) normalized features for an entry to avoid redundant work
 * across multi-round quiz generation.
 */
export function prepareEntryFeatures(entry: VocabularyEntry): PreparedEntryFeatures {
  const normTarget = normalizeComparable(entry.target);
  const charLength = toCodePoints(normTarget).length;
  const { grams, total } = extractBigramsFromNormalized(normTarget);
  return {
    entry,
    normTarget,
    charLength,
    bigrams: grams,
    bigramTotal: total,
    skeleton: phoneticSkeleton(entry.target),
    normalizedTags: normalizeTagSet(entry.tags),
  };
}

/* ---------- Confusion Matrix (strictly in-memory) ---------- */

export function canonicalPairKey(idA: string, idB: string): string {
  return idA < idB ? `${idA}\u0000${idB}` : `${idB}\u0000${idA}`;
}

export function createConfusionMatrix(): ConfusionMatrix {
  return new Map();
}

/**
 * Record an in-memory confusion edge when a learner chooses `chosenEntryId`
 * while being tested on `expectedEntryId`.
 */
export function recordConfusion(
  matrix: ConfusionMatrix,
  expectedEntryId: string,
  chosenEntryId: string,
  source: ConfusionSource,
  timestamp: number = Date.now(),
): ConfusionMatrix {
  if (!expectedEntryId || !chosenEntryId || expectedEntryId === chosenEntryId) {
    return matrix;
  }

  const key = canonicalPairKey(expectedEntryId, chosenEntryId);
  const [entryA, entryB] =
    expectedEntryId < chosenEntryId
      ? [expectedEntryId, chosenEntryId]
      : [chosenEntryId, expectedEntryId];
  const isExpectedA = expectedEntryId === entryA;

  const existing = matrix.get(key);
  const nextEdge: ConfusionEdge = existing
    ? {
        ...existing,
        aToB: existing.aToB + (isExpectedA ? 1 : 0),
        bToA: existing.bToA + (isExpectedA ? 0 : 1),
        total: existing.total + 1,
        sources: {
          ...existing.sources,
          [source]: existing.sources[source] + 1,
        },
        lastConfusedAt: Math.max(existing.lastConfusedAt, timestamp),
      }
    : {
        entryA,
        entryB,
        aToB: isExpectedA ? 1 : 0,
        bToA: isExpectedA ? 0 : 1,
        total: 1,
        sources: {
          quiz: source === "quiz" ? 1 : 0,
          matching: source === "matching" ? 1 : 0,
        },
        lastConfusedAt: timestamp,
      };

  const next = new Map(matrix);
  next.set(key, nextEdge);
  return next;
}

export function getPairConfusionCount(
  matrix: ConfusionMatrix | undefined,
  idA: string,
  idB: string,
): number {
  if (!matrix || !idA || !idB || idA === idB) return 0;
  return matrix.get(canonicalPairKey(idA, idB))?.total ?? 0;
}

export function getEntryConfusionTotal(
  matrix: ConfusionMatrix | undefined,
  entryId: string,
): number {
  if (!matrix || !entryId) return 0;
  let total = 0;
  for (const edge of matrix.values()) {
    if (edge.entryA === entryId || edge.entryB === entryId) {
      total += edge.total;
    }
  }
  return total;
}

/**
 * Return top confused vocabulary pairs sorted by confusion frequency (then recency).
 */
export function getTopConfusedPairs(
  matrix: ConfusionMatrix | undefined,
  entries: readonly VocabularyEntry[],
  limit = 10,
): ConfusionPairSummary[] {
  if (!matrix || matrix.size === 0 || limit <= 0) return [];

  const byId = new Map<string, VocabularyEntry>();
  for (const entry of entries) {
    byId.set(entry.id, entry);
  }

  const summaries: ConfusionPairSummary[] = [];
  for (const edge of matrix.values()) {
    const entryA = byId.get(edge.entryA);
    const entryB = byId.get(edge.entryB);
    if (!entryA || !entryB) continue;
    summaries.push({
      entryA,
      entryB,
      total: edge.total,
      aToB: edge.aToB,
      bToA: edge.bToA,
      sources: edge.sources,
      lastConfusedAt: edge.lastConfusedAt,
    });
  }

  summaries.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    if (b.lastConfusedAt !== a.lastConfusedAt) return b.lastConfusedAt - a.lastConfusedAt;
    return a.entryA.id.localeCompare(b.entryA.id);
  });

  return summaries.slice(0, limit);
}

/**
 * Extract unique entry IDs involved in at least one confusion, ordered by total confusion severity.
 */
export function getConfusableEntryIds(matrix: ConfusionMatrix | undefined): string[] {
  if (!matrix || matrix.size === 0) return [];

  const totals = new Map<string, number>();
  for (const edge of matrix.values()) {
    totals.set(edge.entryA, (totals.get(edge.entryA) ?? 0) + edge.total);
    totals.set(edge.entryB, (totals.get(edge.entryB) ?? 0) + edge.total);
  }

  return Array.from(totals.entries())
    .sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : a[0].localeCompare(b[0])))
    .map(([id]) => id);
}

/* ---------- Candidate Scoring & Selection ---------- */

export interface DistractorScoringContext {
  difficulty?: QuizDifficulty;
  confusionMatrix?: ConfusionMatrix;
  retentionRecord?: RetentionLike;
  /** Optional precomputed features for question and candidate to avoid repeat O(L) parsing. */
  preparedQuestion?: PreparedEntryFeatures;
  preparedCandidate?: PreparedEntryFeatures;
  /** Optional precomputed normalized phonetic skeleton for the question target. */
  questionSkeleton?: string;
  /** Optional precomputed normalized phonetic skeleton for the candidate target. */
  candidateSkeleton?: string;
}

export function formatDistractorReasons(reasons: readonly DistractorReason[]): string {
  const labels: Record<DistractorReason, string> = {
    "previously-confused": "previously confused",
    "similar-spelling": "similar spelling",
    "sounds-alike": "sounds alike",
    "same-category": "same category",
    "similar-length": "similar length",
  };
  return reasons.map((reason) => labels[reason]).join(", ");
}

function combineDifficultyScore(
  plausibility: number,
  lengthProx: number,
  confusionSignal: number,
  difficulty: QuizDifficulty,
  retentionRecord?: RetentionLike,
): number {
  if (difficulty === "challenging") {
    return 0.55 * plausibility + 0.45 * confusionSignal;
  }
  if (difficulty === "standard") {
    return 0.75 * (1 - plausibility) + 0.25 * (1 - lengthProx);
  }
  // Adaptive difficulty: matches distractor closeness to current Leitner mastery,
  // while giving confused pairs high priority so discrimination errors get drilled.
  const mastery =
    retentionRecord && retentionRecord.totalAttempts > 0
      ? Math.min(1, Math.max(0, retentionRecord.box / MAX_LEITNER_BOX))
      : 0.35;
  const targetPlausibility = 0.35 + 0.55 * mastery;
  const adaptiveFit = 1 - Math.abs(plausibility - targetPlausibility);
  return 0.6 * adaptiveFit + 0.4 * confusionSignal;
}

/**
 * Evaluate how plausible (and how appropriate under the selected difficulty)
 * `candidate` is as a multiple-choice distractor for `question`.
 */
export function scoreDistractor(
  question: VocabularyEntry,
  candidate: VocabularyEntry,
  context: DistractorScoringContext = {},
): DistractorInsight {
  const difficulty = context.difficulty ?? "adaptive";
  const qFeat = context.preparedQuestion;
  const cFeat = context.preparedCandidate;

  const normQ = qFeat?.normTarget ?? normalizeComparable(question.target);
  const normC = cFeat?.normTarget ?? normalizeComparable(candidate.target);

  const orthographicSimilarity = similarityScore(normQ, normC);
  const bigramSim =
    qFeat && cFeat
      ? normQ === normC
        ? 1.0
        : bigramDiceFromMaps(qFeat.bigrams, qFeat.bigramTotal, cFeat.bigrams, cFeat.bigramTotal)
      : bigramSimilarity(normQ, normC);

  const qSkel = context.questionSkeleton ?? qFeat?.skeleton ?? phoneticSkeleton(question.target);
  const cSkel = context.candidateSkeleton ?? cFeat?.skeleton ?? phoneticSkeleton(candidate.target);
  const phoneticSimilarity = similarityScore(qSkel, cSkel);

  const lengthProx =
    qFeat && cFeat
      ? lengthProximityFromCounts(qFeat.charLength, cFeat.charLength)
      : lengthProximity(normQ, normC);
  const tagSim =
    qFeat && cFeat
      ? tagSimilarityFromSets(qFeat.normalizedTags, cFeat.normalizedTags)
      : tagSimilarity(question.tags, candidate.tags);

  const plausibility = Math.min(
    1,
    Math.max(
      0,
      0.3 * orthographicSimilarity +
        0.25 * bigramSim +
        0.2 * phoneticSimilarity +
        0.15 * lengthProx +
        0.1 * tagSim,
    ),
  );

  const confusionCount = getPairConfusionCount(context.confusionMatrix, question.id, candidate.id);
  const confusionSignal =
    confusionCount > 0 ? Math.min(1, 0.55 + 0.15 * confusionCount) : 0;

  const score = combineDifficultyScore(
    plausibility,
    lengthProx,
    confusionSignal,
    difficulty,
    context.retentionRecord,
  );

  const reasons: DistractorReason[] = [];
  if (confusionCount > 0) reasons.push("previously-confused");
  if (orthographicSimilarity >= 0.42 || bigramSim >= 0.35) reasons.push("similar-spelling");
  if (phoneticSimilarity >= 0.5) reasons.push("sounds-alike");
  if (tagSim > 0) reasons.push("same-category");
  if (reasons.length === 0 && lengthProx >= 0.78) reasons.push("similar-length");

  return {
    entryId: candidate.id,
    source: candidate.source,
    target: candidate.target,
    plausibility,
    score,
    orthographicSimilarity,
    bigramSimilarity: bigramSim,
    phoneticSimilarity,
    tagSimilarity: tagSim,
    lengthProximity: lengthProx,
    confusionCount,
    reasons,
  };
}

export interface SelectDistractorsOptions {
  difficulty?: QuizDifficulty;
  confusionMatrix?: ConfusionMatrix;
  retentionRecord?: RetentionLike;
  rng?: () => number;
  preparedQuestion?: PreparedEntryFeatures;
  preparedCandidates?: ReadonlyMap<string, PreparedEntryFeatures>;
  questionSkeleton?: string;
  candidateSkeletons?: ReadonlyMap<string, string>;
}

/**
 * Coarse O(L + T) Stage-1 filter for large decks (> COARSE_FILTER_LIMIT candidates).
 * Always preserves any entry with session confusion history for `question`.
 */
function prefilterCandidates(
  question: VocabularyEntry,
  candidates: readonly VocabularyEntry[],
  qFeat: PreparedEntryFeatures,
  preparedCandidates: ReadonlyMap<string, PreparedEntryFeatures> | undefined,
  difficulty: QuizDifficulty,
  confusionMatrix: ConfusionMatrix | undefined,
  retentionRecord: RetentionLike | undefined,
  rng: () => number,
): VocabularyEntry[] {
  if (candidates.length <= COARSE_FILTER_LIMIT) {
    return [...candidates];
  }

  const mustKeep: VocabularyEntry[] = [];
  const rest: { candidate: VocabularyEntry; coarseScore: number; tie: number }[] = [];

  for (const candidate of candidates) {
    const confusionCount = getPairConfusionCount(confusionMatrix, question.id, candidate.id);
    if (confusionCount > 0) {
      mustKeep.push(candidate);
      continue;
    }
    const cFeat = preparedCandidates?.get(candidate.id) ?? prepareEntryFeatures(candidate);
    const bigramProxy =
      qFeat.normTarget === cFeat.normTarget
        ? 1.0
        : bigramDiceFromMaps(qFeat.bigrams, qFeat.bigramTotal, cFeat.bigrams, cFeat.bigramTotal);
    const lengthProx = lengthProximityFromCounts(qFeat.charLength, cFeat.charLength);
    const tagSim = tagSimilarityFromSets(qFeat.normalizedTags, cFeat.normalizedTags);
    const approxPlausibility = 0.6 * bigramProxy + 0.25 * lengthProx + 0.15 * tagSim;
    const coarseScore = combineDifficultyScore(
      approxPlausibility,
      lengthProx,
      0,
      difficulty,
      retentionRecord,
    );
    rest.push({ candidate, coarseScore, tie: rng() });
  }

  rest.sort((a, b) => {
    if (Math.abs(b.coarseScore - a.coarseScore) > 1e-9) {
      return b.coarseScore - a.coarseScore;
    }
    return a.tie - b.tie;
  });

  const budget = Math.max(0, COARSE_FILTER_LIMIT - mustKeep.length);
  return [...mustKeep, ...rest.slice(0, budget).map((item) => item.candidate)];
}

/**
 * Rank and select `count` non-fabricated distractors for `question` from `candidates`.
 * Uses a two-stage O(D * (L + T)) filter + exact OSA reranking pipeline, and
 * uses `rng` exclusively for deterministic tie-breaking.
 */
export function selectSmartDistractors(
  question: VocabularyEntry,
  candidates: readonly VocabularyEntry[],
  count: number,
  options: SelectDistractorsOptions = {},
): DistractorSelectionResult {
  if (count <= 0 || candidates.length === 0) {
    return { distractors: [], insights: {} };
  }

  const rng = options.rng ?? (() => 0.5);
  const difficulty = options.difficulty ?? "adaptive";
  const qFeat = options.preparedQuestion ?? prepareEntryFeatures(question);

  const shortlist = prefilterCandidates(
    question,
    candidates,
    qFeat,
    options.preparedCandidates,
    difficulty,
    options.confusionMatrix,
    options.retentionRecord,
    rng,
  );

  const ranked = shortlist.map((candidate) => {
    const cFeat = options.preparedCandidates?.get(candidate.id);
    const insight = scoreDistractor(question, candidate, {
      difficulty,
      confusionMatrix: options.confusionMatrix,
      retentionRecord: options.retentionRecord,
      preparedQuestion: qFeat,
      preparedCandidate: cFeat,
      questionSkeleton: options.questionSkeleton ?? qFeat.skeleton,
      candidateSkeleton: options.candidateSkeletons?.get(candidate.target) ?? cFeat?.skeleton,
    });
    return {
      candidate,
      insight,
      tieBreak: rng(),
    };
  });

  ranked.sort((a, b) => {
    if (Math.abs(b.insight.score - a.insight.score) > 1e-9) {
      return b.insight.score - a.insight.score;
    }
    return a.tieBreak - b.tieBreak;
  });

  const selected = ranked.slice(0, count);
  const distractors: string[] = [];
  const insights: Record<string, DistractorInsight> = {};

  for (const item of selected) {
    distractors.push(item.candidate.target);
    insights[item.candidate.target] = item.insight;
  }

  return { distractors, insights };
}
