/**
 * Shared rule for the "how many questions this round" inputs in the quiz,
 * typing, and flashcards modes: accept only whole numbers inside 1..max.
 * Returns the parsed count, or null when the caller should revert to the
 * current value instead.
 */
export function parseBoundedCount(raw: string, max: number): number | null {
  const parsed = Number(raw.trim());
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) return null;
  return parsed;
}
