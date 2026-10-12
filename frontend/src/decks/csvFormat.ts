/**
 * Portable CSV format for custom decks (documented in docs/architecture.md).
 *
 * The file is a comment header followed by a regular CSV table:
 *
 *   # deck: Spanish basics
 *   # description: Everyday words
 *   # sourceLanguage: es
 *   # targetLanguage: en
 *   source,target,alternatives,tags
 *   hola,hello,hi|hey,greeting
 *   gracias,"thank you, thanks",,phrase
 *
 * - `#` lines before the table carry deck metadata (name, description, languages).
 * - `alternatives` and `tags` use `|` as the list separator.
 * - Quoting follows RFC 4180; commas inside a field are quoted.
* - Entry ids are derived from the source text (same slugs as backend CSV decks),
  *   with -2/-3 suffixes for collisions. The file does not store ids.
 *
 * Parsing produces the same canonical document shape as JSON imports so both
 * formats share one validation path.
 */

import type { CustomDeckDocument } from "../api/types";

export const CSV_HEADER = ["source", "target", "alternatives", "tags"] as const;
const COMMENT_PREFIX = "#";
const LIST_SEPARATOR = "|";

/** Split raw CSV text into logical rows, honoring quoted fields. */
export function splitCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    // Drop a trailing empty row produced by a final newline.
    if (!(row.length === 1 && row[0] === "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      pushField();
    } else if (char === "\n") {
      pushRow();
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) pushRow();

  if (inQuotes) {
    throw new Error("Unterminated quoted field. Check for a missing closing quote.");
  }
  return rows;
}

/** Parse one CSV field list into a record, trimming whitespace. */
function rowToObject(header: string[], values: string[]): Record<string, string> {
  const record: Record<string, string> = {};
  header.forEach((key, index) => {
    record[key] = (values[index] ?? "").trim();
  });
  return record;
}

function quoteCsvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Serialize a validated custom deck to the portable CSV format. */
export function deckToCsv(doc: CustomDeckDocument): string {
  const lines: string[] = [
    `${COMMENT_PREFIX} deck: ${doc.deck.name.replace(/[\r\n]+/g, " ")}`,
    `${COMMENT_PREFIX} description: ${doc.deck.description.replace(/[\r\n]+/g, " ")}`,
    `${COMMENT_PREFIX} sourceLanguage: ${doc.deck.sourceLanguage}`,
    `${COMMENT_PREFIX} targetLanguage: ${doc.deck.targetLanguage}`,
  ];
  lines.push(CSV_HEADER.join(","));
  for (const entry of doc.entries) {
    const fields = [
      entry.source,
      entry.target,
      entry.alternatives.join(LIST_SEPARATOR),
      entry.tags.join(LIST_SEPARATOR),
    ];
    lines.push(fields.map(quoteCsvField).join(","));
  }
  return `${lines.join("\n")}\n`;
}

export type CsvParseResult =
  | { ok: true; document: Omit<CustomDeckDocument, "exportedAt"> }
  | { ok: false; errors: string[] };

/** Parse deck CSV text into the canonical document shape (no id assignment). */
export function parseDeckCsv(text: string): CsvParseResult {
  let rows: string[][];
  try {
    rows = splitCsvRows(text);
  } catch (error) {
    return { ok: false, errors: [(error as Error).message] };
  }

  const errors: string[] = [];
  const meta: Record<string, string> = {};
  let headerIndex = -1;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i].map((value) => value.trim());
    if (row.length === 0 || (row.length === 1 && row[0] === "")) continue;
    if (row[0].startsWith(COMMENT_PREFIX)) {
      const match = row[0].slice(COMMENT_PREFIX.length).trim().match(/^([A-Za-z]+):\s?(.*)$/);
      if (match) {
        const key = match[1];
        if (key === "deck") meta.name = match[2];
        else if (key === "description") meta.description = match[2];
        else if (key === "sourceLanguage") meta.sourceLanguage = match[2];
        else if (key === "targetLanguage") meta.targetLanguage = match[2];
      }
      continue;
    }
    if (headerIndex === -1) {
      if (row.slice(0, 2).join(",") !== CSV_HEADER.slice(0, 2).join(",")) {
        return {
          ok: false,
          errors: [
            `CSV header must start with "source,target" (got: ${row.join(",")})`,
          ],
        };
      }
      headerIndex = i;
      continue;
    }
  }

  if (headerIndex === -1) {
    return { ok: false, errors: ['CSV file has no "source,target" header row.'] };
  }
  if (!meta.name) errors.push("CSV metadata is missing a deck name (# deck: ...).");
  if (!meta.sourceLanguage) errors.push("CSV metadata is missing a source language (# sourceLanguage: ...).");
  if (!meta.targetLanguage) errors.push("CSV metadata is missing a target language (# targetLanguage: ...).");

  const header = rows[headerIndex].map((value) => value.trim());
  const entries: unknown[] = [];
  const seen: string[] = [];
  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const raw = rows[i];
    if (raw.length === 1 && raw[0].trim() === "") continue; // blank padding line
    const record = rowToObject(header, raw);
    const source = record.source ?? "";
    const target = record.target ?? "";
    if (!source && !target) continue;
    const key = `${source.toLocaleLowerCase()}\u0000${target.toLocaleLowerCase()}`;
    if (seen.includes(key)) {
      errors.push(`Duplicate source/translation pair "${source}" -> "${target}" (row ${i + 1}).`);
      continue;
    }
    seen.push(key);
    entries.push({
      source,
      target,
      alternatives: (record.alternatives ?? "")
        .split(LIST_SEPARATOR)
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
      tags: (record.tags ?? "")
        .split(LIST_SEPARATOR)
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    });
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    document: {
      version: 1,
      deck: {
        // ids are assigned by the validator (derived from the deck name)
        id: "",
        name: meta.name,
        description: meta.description ?? "",
        sourceLanguage: meta.sourceLanguage,
        targetLanguage: meta.targetLanguage,
        entryCount: entries.length,
      },
      entries: entries as CustomDeckDocument["entries"],
    },
  };
}
