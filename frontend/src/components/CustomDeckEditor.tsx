import { useState } from "react";
import type { CustomDeckDocument, VocabularyEntry } from "../api/types";
import { suggestCustomDeckId, validateCustomDeck } from "../decks/validate";
import { Button } from "./Button";
import { Panel } from "./Panel";

interface EntryRow {
  /** Existing entry id, kept stable across edits; new rows have none. */
  id: string;
  source: string;
  target: string;
  alternatives: string;
  tags: string;
}

const EMPTY_ROW: EntryRow = { id: "", source: "", target: "", alternatives: "", tags: "" };

function rowsFromDeck(deck: CustomDeckDocument): EntryRow[] {
  return deck.entries.map((entry) => ({
    id: entry.id,
    source: entry.source,
    target: entry.target,
    alternatives: entry.alternatives.join(", "),
    tags: entry.tags.join(", "),
  }));
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/**
 * Create or edit a custom deck. In edit mode the deck id and entry ids are
 * preserved (documented id-stability rule); only genuinely new rows receive
 * derived ids. Saving runs the shared validator, so editor output and imported
 * decks follow identical rules.
 */
export function CustomDeckEditor({
  deck = null,
  existingIds,
  onSave,
  onDone,
}: {
  deck?: CustomDeckDocument | null;
  existingIds: readonly string[];
  onSave: (deck: CustomDeckDocument) => void;
  onDone: () => void;
}) {
  const isEdit = deck !== null;
  const [name, setName] = useState(deck?.deck.name ?? "");
  const [description, setDescription] = useState(deck?.deck.description ?? "");
  const [sourceLanguage, setSourceLanguage] = useState(deck?.deck.sourceLanguage ?? "");
  const [targetLanguage, setTargetLanguage] = useState(deck?.deck.targetLanguage ?? "");
  const [rows, setRows] = useState<EntryRow[]>(() =>
    deck ? rowsFromDeck(deck) : [{ ...EMPTY_ROW }],
  );
  const [errors, setErrors] = useState<string[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function updateRow(index: number, patch: Partial<EntryRow>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function save() {
    const filled = rows.filter((row) => row.source.trim() || row.target.trim());
    const entries: VocabularyEntry[] = filled.map((row) => ({
      // Existing ids are preserved; new rows have id "" and get one derived
      // from the source text by the validator.
      id: row.id,
      source: row.source.trim(),
      target: row.target.trim(),
      alternatives: splitList(row.alternatives),
      tags: splitList(row.tags),
    }));

    const doc: CustomDeckDocument = {
      version: 1,
      deck: {
        id: deck?.deck.id ?? suggestCustomDeckId(name),
        name,
        description,
        sourceLanguage,
        targetLanguage,
        entryCount: entries.length,
      },
      entries,
      exportedAt: deck?.exportedAt ?? new Date().toISOString(),
    };

    // In edit mode the deck's own id must not count as a collision.
    const otherIds = existingIds.filter((id) => id !== deck?.deck.id);
    const result = validateCustomDeck(doc, otherIds);
    if (!result.ok) {
      setNotice(null);
      setErrors(result.errors);
      return;
    }
    setErrors(null);
    setNotice(isEdit ? "Changes saved." : "Deck saved to this browser.");
    onSave(result.deck);
    onDone();
  }

  return (
    <Panel className="stack" as="section">
<div className="stack-tight">
        <h3>{isEdit ? `Edit "${deck?.deck.name}"` : "Create a custom deck"}</h3>
        <p className="faint">
          Any language pair works. Enter full language names like <code>english</code>, <code>hindi</code>, <code>french</code>{" "}
          or <code>japanese</code>. Decks are stored in this browser only.
          {isEdit ? " Existing entry ids are preserved when you edit." : ""}
        </p>
      </div>

      <div className="form-grid">
        <label className="stack-tight">
          <span className="label">Deck name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Spanish basics"
          />
        </label>
        <label className="stack-tight">
          <span className="label">Source language</span>
          <input
            value={sourceLanguage}
            onChange={(event) => setSourceLanguage(event.target.value)}
            placeholder="english"
          />
        </label>
        <label className="stack-tight">
          <span className="label">Target language</span>
          <input
            value={targetLanguage}
            onChange={(event) => setTargetLanguage(event.target.value)}
            placeholder="hindi"
          />
        </label>
        <label className="stack-tight span-2">
          <span className="label">Description (optional)</span>
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Everyday words"
          />
        </label>
      </div>

      <fieldset className="stack">
        <legend className="label">Entries</legend>
        {rows.map((row, index) => (
          <div className="entry-row" key={index}>
            <input
              aria-label={`Entry ${index + 1} source`}
              value={row.source}
              placeholder="Source word"
              onChange={(event) => updateRow(index, { source: event.target.value })}
            />
            <input
              aria-label={`Entry ${index + 1} translation`}
              value={row.target}
              placeholder="Translation"
              onChange={(event) => updateRow(index, { target: event.target.value })}
            />
            <input
              aria-label={`Entry ${index + 1} alternative translations`}
              value={row.alternatives}
              placeholder="Alternatives (comma separated)"
              onChange={(event) => updateRow(index, { alternatives: event.target.value })}
            />
            <input
              aria-label={`Entry ${index + 1} tags`}
              value={row.tags}
              placeholder="Tags (comma separated)"
              onChange={(event) => updateRow(index, { tags: event.target.value })}
            />
            <Button
              size="small"
              variant="ghost"
              aria-label={`Remove entry ${index + 1}`}
              disabled={rows.length === 1}
              onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
            >
              Remove
            </Button>
            {row.id ? (
              <span className="faint entry-id" title="Entry id (stable)">
                {row.id}
              </span>
            ) : null}
          </div>
        ))}
        <Button size="small" onClick={() => setRows((current) => [...current, { ...EMPTY_ROW }])}>
          Add entry
        </Button>
      </fieldset>

      {notice ? (
        <p className="notice" role="status">
          {notice}
        </p>
      ) : null}
      {errors && errors.length > 0 ? (
        <div className="notice notice-error" role="alert">
          <p className="label">Cannot save yet</p>
          <ul className="stack-tight">
            {errors.map((error) => (
              <li key={error} className="muted">
                {error}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="row">
        <Button variant="primary" onClick={save}>
          {isEdit ? "Save changes" : "Create deck"}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </Panel>
  );
}
