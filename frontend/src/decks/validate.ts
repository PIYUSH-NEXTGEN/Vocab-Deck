/**
 * Validation for custom decks on the client. Mirrors the backend deck rules
 * so imported or edited decks behave identically to built-in ones. Rules:
 * - deck id: ^[a-z0-9][a-z0-9_-]{0,63}$
 * - languages: any non-empty string (full language names like "english", "hindi")
 * - entry ids unique within the deck; no duplicate (source, target) pairs
 * - source / target / alternatives / tags non-empty after NFC normalization
 * - at least one entry (never fabricate or pad)
 */

import type { CustomDeckDocument, PlayableDeck, VocabularyEntry } from "../api/types";

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export type ValidationResult =
  | { ok: true; deck: CustomDeckDocument }
  | { ok: false; errors: string[] };

function normalizeText(value: string): string {
  return value.normalize("NFC").trim();
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && normalizeText(value).length > 0;
}

function slugify(text: string): string {
  return (
    text
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace("ß", "ss")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
  );
}

/** Deterministic custom-deck id from a deck name, namespaced against built-ins. */
export function suggestCustomDeckId(name: string): string {
  const base = slugify(name);
  const id = `custom-${base || "deck"}`;
  return id;
}

function validateEntry(raw: unknown, index: number): VocabularyEntry {
  const position = index + 1;
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`Entry ${position} must be an object.`);
  }
  const entry = raw as Record<string, unknown>;
  const source = entry.source;
  const target = entry.target;
  if (!isNonEmptyString(source)) {
    throw new Error(`Entry ${position}: source text is required.`);
  }
  if (!isNonEmptyString(target)) {
    throw new Error(`Entry ${position}: translation is required.`);
  }
  const id = isNonEmptyString(entry.id)
    ? normalizeText(entry.id)
    : slugify(normalizeText(source)) || `entry-${position}`;
  if (!ID_PATTERN.test(id)) {
    throw new Error(
      `Entry ${position}: id "${id}" must match ^[a-z0-9][a-z0-9_-]{0,63}$ (lowercase ASCII).`,
    );
  }
  const alternatives = Array.isArray(entry.alternatives)
    ? entry.alternatives.map((value, i) => {
        if (!isNonEmptyString(value)) {
          throw new Error(`Entry ${position}: alternative ${i + 1} must be non-empty.`);
        }
        return normalizeText(value);
      })
    : [];
  const tags = Array.isArray(entry.tags)
    ? entry.tags.map((value, i) => {
        if (!isNonEmptyString(value)) {
          throw new Error(`Entry ${position}: tag ${i + 1} must be non-empty.`);
        }
        return normalizeText(value);
      })
    : [];
  return { id, source: normalizeText(source), target: normalizeText(target), alternatives, tags };
}

export function validateCustomDeck(
  doc: unknown,
  existingIds: readonly string[] = [],
): ValidationResult {
  if (typeof doc !== "object" || doc === null) {
    return { ok: false, errors: ["Deck file must be an object."] };
  }
  const root = doc as Record<string, unknown>;
  const errors: string[] = [];

  if (root.version !== 1) {
    errors.push('Unsupported format version: expected { "version": 1, ... }.');
  }
  const deck = (typeof root.deck === "object" && root.deck !== null ? root.deck : {}) as Record<
    string,
    unknown
  >;
  const name = isNonEmptyString(deck.name) ? normalizeText(deck.name) : "";
  if (!name) errors.push("Deck name is required.");
  // Ids are optional in files: when absent they are derived from the deck name.
  const id = isNonEmptyString(deck.id)
    ? normalizeText(deck.id)
    : suggestCustomDeckId(name);
  if (!id || !ID_PATTERN.test(id)) {
    errors.push(
      `Deck id "${String(deck.id ?? "")}" must match ^[a-z0-9][a-z0-9_-]{0,63}$ (lowercase ASCII).`,
    );
  } else if (existingIds.includes(id)) {
    errors.push(
      `A deck with id "${id}" already exists in this browser. Import with a different name, or delete the existing deck first.`,
    );
  }
  const sourceLanguage = isNonEmptyString(deck.sourceLanguage) ? normalizeText(deck.sourceLanguage) : "";
  const targetLanguage = isNonEmptyString(deck.targetLanguage) ? normalizeText(deck.targetLanguage) : "";
  if (!sourceLanguage) {
    errors.push("Source language is required.");
  }
  if (!targetLanguage) {
    errors.push("Target language is required.");
  }

  const entries: VocabularyEntry[] = [];
  const seenIds = new Set<string>();
  const seenPairs = new Set<string>();
  if (!Array.isArray(root.entries)) {
    errors.push("Imported document needs an \"entries\" array.");
  } else if (root.entries.length === 0) {
    errors.push("Deck needs at least one entry.");
  } else {
    root.entries.forEach((raw, index) => {
      try {
        const entry = validateEntry(raw, index);
        if (seenIds.has(entry.id)) {
          errors.push(`Duplicate entry id "${entry.id}".`);
          return;
        }
        const pairKey = `${entry.source.toLocaleLowerCase()}\u0000${entry.target.toLocaleLowerCase()}`;
        if (seenPairs.has(pairKey)) {
          errors.push(`Duplicate source/translation pair "${entry.source}" → "${entry.target}".`);
          return;
        }
        seenIds.add(entry.id);
        seenPairs.add(pairKey);
        entries.push(entry);
      } catch (error) {
        errors.push((error as Error).message);
      }
    });
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    deck: {
      version: 1,
      deck: {
        id,
        name,
        description: isNonEmptyString(deck.description) ? normalizeText(deck.description) : "",
        sourceLanguage,
        targetLanguage,
        entryCount: entries.length,
      },
      entries,
      exportedAt:
        isNonEmptyString(root.exportedAt) && typeof root.exportedAt === "string"
          ? root.exportedAt
          : new Date(0).toISOString(),
    },
  };
}

export function toPlayableDeck(doc: CustomDeckDocument): PlayableDeck {
  return { ...doc.deck, entries: doc.entries, origin: "custom" };
}
