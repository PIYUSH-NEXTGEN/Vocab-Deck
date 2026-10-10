import { useState } from "react";
import { Button } from "./Button";
import { Panel } from "./Panel";
import { PREVIEW_ENTRY_LIMIT, previewImport, confirmImport } from "../decks/importPipeline";
import { languagePairLabel } from "../lang/display";
import type { CustomDeckDocument } from "../api/types";

function readFileText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  // Fallback for environments without Blob.text().
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("File could not be read."));
    reader.readAsText(file);
  });
}

/**
 * Import a custom deck from JSON or the portable CSV format (see
 * docs/architecture.md for both file formats). The parsed deck is previewed and
 * must be confirmed before anything is written to browser storage.
 */
export function ImportDeckPanel({
  existingIds,
  onImported,
}: {
  existingIds: readonly string[];
  onImported: (deck: CustomDeckDocument) => void;
}) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<CustomDeckDocument | null>(null);
  const [errors, setErrors] = useState<string[] | null>(null);

  function reset() {
    setText("");
    setFileName(null);
    setPreview(null);
    setErrors(null);
  }

  function runParse(source: string, name: string | null) {
    setFileName(name);
    setText(source);
    const result = previewImport(source);
    if (result.ok) {
      setPreview(result.deck);
      setErrors(null);
    } else {
      setPreview(null);
      setErrors(result.errors);
    }
  }

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    try {
      runParse(await readFileText(file), file.name);
    } catch {
      setPreview(null);
      setErrors([`"${file.name}" could not be read.`]);
    }
  }

  function confirm() {
    if (!preview) return;
    const result = confirmImport(text, existingIds);
    if (!result.ok) {
      setErrors(result.errors);
      setPreview(null);
      return;
    }
    onImported(result.deck);
    reset();
  }

  return (
    <Panel className="stack import-panel">
      <div className="stack-tight">
        <h3>Import a deck</h3>
        <p className="faint">
          Accepts the portable JSON export or the comment-header CSV format. The deck is
          validated and previewed before it is stored.
        </p>
      </div>

      <label className="stack-tight">
        <span className="label">From a file</span>
        <input
          type="file"
          accept="application/json,.json,.csv,text/csv"
          onChange={onFile}
          aria-label="Choose a deck file to import"
        />
      </label>

      <label className="stack-tight">
        <span className="label">Or paste JSON or CSV</span>
        <textarea
          rows={5}
          value={text}
          spellCheck={false}
          placeholder='{"version":1,"deck":{...},"entries":[...]}  — or —  # deck: ...'
          onChange={(event) => runParse(event.target.value, null)}
          aria-label="Paste deck JSON or CSV"
        />
      </label>

      {errors && errors.length > 0 ? (
        <div className="notice notice-error" role="alert">
          <p className="label">Import rejected</p>
          <ul className="stack-tight">
            {errors.map((error) => (
              <li key={error} className="muted">
                {error}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {preview ? (
        <div className="stack import-preview" role="region" aria-label="Import preview">
          <p className="label">Preview{fileName ? ` — ${fileName}` : ""}</p>
          <div className="stack-tight">
            <h4>{preview.deck.name}</h4>
            <p className="faint">
              {languagePairLabel(preview.deck.sourceLanguage, preview.deck.targetLanguage)} ·{" "}
              {preview.entries.length} entries · id <code>{preview.deck.id}</code>
            </p>
          </div>
          <ul className="stack-tight preview-entries">
            {preview.entries.slice(0, PREVIEW_ENTRY_LIMIT).map((entry) => (
              <li key={entry.id}>
                <strong>{entry.source}</strong>
                <span className="muted"> → {entry.target}</span>
                {entry.alternatives.length > 0 ? (
                  <span className="faint"> (also: {entry.alternatives.join(", ")})</span>
                ) : null}
              </li>
            ))}
          </ul>
          {preview.entries.length > PREVIEW_ENTRY_LIMIT ? (
            <p className="faint">+{preview.entries.length - PREVIEW_ENTRY_LIMIT} more entries</p>
          ) : null}
          <div className="row">
            <Button variant="primary" onClick={confirm}>
              Import deck
            </Button>
            <Button variant="ghost" onClick={reset}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
