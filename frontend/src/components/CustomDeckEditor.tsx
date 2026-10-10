import { useState } from "react";
import type { CustomDeckDocument, VocabularyEntry } from "../api/types";
import { validateCustomDeck, suggestCustomDeckId } from "../decks/validate";
import { Button } from "./Button";
import { Panel } from "./Panel";

interface DraftRow {
  source: string;
  target: string;
  alternatives: string;
  tags: string;
}

const EMPTY_ROW: DraftRow = { source: "", target: "", alternatives: "", tags: "" };

function rowToEntry(row: DraftRow, index: number): VocabularyEntry {
  const source = row.source.trim();
  const id =
    suggestCustomDeckId(source).replace("custom-", "") || `entry-${index + 1}`;
  return {
    id,
    source,
    target: row.target.trim(),
    alternatives: splitList(row.alternatives),
    tags: splitList(row.tags),
  };
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/** Create a custom deck (name, languages, entries) with the shared validator. */
export function CustomDeckEditor({
  onSave,
  existingIds,
}: {
  onSave: (deck: CustomDeckDocument) => void;
  existingIds: string[];
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sourceLanguage, setSourceLanguage] = useState("");
  const [targetLanguage, setTargetLanguage] = useState("");
  const [rows, setRows] = useState<DraftRow[]>([{ ...EMPTY_ROW }]);
  const [errors, setErrors] = useState<string[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function updateRow(index: number, patch: Partial<DraftRow>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function save() {
    const filled = rows.filter((row) => row.source.trim() || row.target.trim());
    const entries = filled.map(rowToEntry);
    const id = suggestCustomDeckId(name);
    const doc = {
      version: 1 as const,
      deck: {
        id,
        name,
        description,
        sourceLanguage,
        targetLanguage,
        entryCount: entries.length,
      },
      entries,
      exportedAt: new Date().toISOString(),
    };
    const result = validateCustomDeck(doc);
    if (!result.ok) {
      setNotice(null);
      setErrors(result.errors);
      return;
    }
    if (existingIds.includes(result.deck.deck.id)) {
      setNotice(null);
      setErrors([
        `A deck with id "${result.deck.deck.id}" already exists in this browser. Rename it to create a distinct deck.`,
      ]);
      return;
    }
    setErrors(null);
    setNotice(`Saved "${result.deck.deck.name}" to this browser.`);
    onSave(result.deck);
    setName("");
    setDescription("");
    setSourceLanguage("");
    setTargetLanguage("");
    setRows([{ ...EMPTY_ROW }]);
  }

  return (
    <Panel className="stack" as="section">
      <div className="stack-tight">
        <h3>Create a custom deck</h3>
        <p className="faint">
          Any language pair works — codes like <code>fr</code>, <code>de</code>,{" "}
          <code>ja</code> or <code>zh-Hans</code>. Entries are stored in this browser only.
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
          <span className="label">Source language code</span>
          <input
            value={sourceLanguage}
            onChange={(event) => setSourceLanguage(event.target.value)}
            placeholder="es"
          />
        </label>
        <label className="stack-tight">
          <span className="label">Target language code</span>
          <input
            value={targetLanguage}
            onChange={(event) => setTargetLanguage(event.target.value)}
            placeholder="en"
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
          </div>
        ))}
        <Button size="small" onClick={() => setRows((current) => [...current, { ...EMPTY_ROW }])}>
          Add entry
        </Button>
      </fieldset>

      <div className="row">
        <Button variant="primary" onClick={save}>
          Save deck
        </Button>
      </div>

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
    </Panel>
  );
}
