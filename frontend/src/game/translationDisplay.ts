import type { VocabularyEntry } from "../api/types";

const JAPANESE_SCRIPT_RE = /[\u3040-\u30ff\u4e00-\u9faf]/;

/** Alternatives written in Japanese script (kanji/kana). Empty for other decks. */
export function nativeScript(entry: Pick<VocabularyEntry, "alternatives">): string[] {
  return entry.alternatives.filter((alt) => JAPANESE_SCRIPT_RE.test(alt));
}

/**
 * Full display string showing the difference between the typable answer and
 * the original script, e.g. "mizu (水, みず)". Falls back to the plain target
 * for decks without a native-script alternative.
 */
export function fullTranslation(entry: Pick<VocabularyEntry, "target" | "alternatives">): string {
  const script = nativeScript(entry);
  if (script.length === 0) return entry.target;
  return `${entry.target} (${script.join(", ")})`;
}
