/**
 * Import pipeline shared by the library UI: format detection, parsing,
 * validation (with deck-id collision protection) and preview data.
 *
 * Both file formats (JSON and CSV) are normalized to the canonical deck document
 * and validated by validateCustomDeck, so imports follow exactly the same rules
 * as editor saves and built-in decks.
 */

import type { CustomDeckDocument } from "../api/types";
import { validateCustomDeck } from "./validate";
import { parseDeckCsv } from "./csvFormat";

export type ImportResult =
  | { ok: true; deck: CustomDeckDocument }
  | { ok: false; errors: string[] };

/** Upper bound for pasted/uploaded deck text (~2 MB): fail fast, never parse unbounded input. */
export const MAX_IMPORT_CHARS = 2_000_000;

/** Parse a file's text into a raw deck document (no validation yet). */
function parseDeckText(text: string): { ok: true; raw: unknown } | { ok: false; errors: string[] } {
  if (text.trim().length === 0) {
    return { ok: false, errors: ["The file is empty."] };
  }
  if (text.length > MAX_IMPORT_CHARS) {
    return {
      ok: false,
      errors: [
        `The file is too large (${(text.length / 1_000_000).toFixed(1)} MB). Split it into smaller decks of under 2 MB.`,
      ],
    };
  }
  if (text.trimStart().startsWith("{")) {
    try {
      return { ok: true, raw: JSON.parse(text) as unknown };
    } catch (error) {
      return {
        ok: false,
        errors: [
          `Not valid JSON: ${(error as Error).message}. CSV decks must start with "# deck: ..." comments.`,
        ],
      };
    }
  }
  const csv = parseDeckCsv(text);
  if (!csv.ok) return { ok: false, errors: csv.errors };
  return { ok: true, raw: csv.document as unknown };
}

/**
 * Parse + validate for the preview step. ``existingIds`` is empty here so the
 * preview can be shown even when a collision exists; the collision is reported
 * by confirmImport before anything is written.
 */
export function previewImport(text: string): ImportResult {
  const parsed = parseDeckText(text);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  return validateCustomDeck(parsed.raw) as ImportResult;
}

/**
 * Parse + validate, refusing ids that already exist so an import can never
 * overwrite or corrupt a stored deck.
 */
export function confirmImport(text: string, existingIds: readonly string[]): ImportResult {
  const parsed = parseDeckText(text);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  return validateCustomDeck(parsed.raw, existingIds) as ImportResult;
}

/** The number of entries shown in the preview before collapsing. */
export const PREVIEW_ENTRY_LIMIT = 5;
