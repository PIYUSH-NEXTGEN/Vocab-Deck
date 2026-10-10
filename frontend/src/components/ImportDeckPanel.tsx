import { useState } from "react";
import { Button } from "./Button";
import { Panel } from "./Panel";

/**
 * Import a custom deck from a JSON file or pasted JSON. Uses the shared
 * client-side validator so imported decks obey the same rules as built-ins.
 */
export function ImportDeckPanel({
  onImport,
}: {
  onImport: (raw: unknown) => { ok: true } | { ok: false; errors: string[] };
}) {
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<string[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function runImport(raw: unknown) {
    const result = onImport(raw);
    if (result.ok) {
      setErrors(null);
      setNotice("Deck imported. It is stored in this browser.");
      setText("");
    } else {
      setNotice(null);
      setErrors(result.errors);
    }
  }

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      runImport(JSON.parse(await file.text()));
    } catch {
      setNotice(null);
      setErrors([`"${file.name}" is not valid JSON.`]);
    }
  }

  return (
    <Panel className="stack import-panel">
      <div className="stack-tight">
        <h3>Import a deck</h3>
        <p className="faint">
          Accepts the portable JSON backup produced by Export (a <code>version</code> 1 document
          with a deck and its entries).
        </p>
      </div>

      <label className="stack-tight">
        <span className="label">From a file</span>
        <input type="file" accept="application/json,.json" onChange={onFile} />
      </label>

      <label className="stack-tight">
        <span className="label">Or paste JSON</span>
        <textarea
          rows={5}
          value={text}
          spellCheck={false}
          placeholder='{"version":1,"deck":{...},"entries":[...]}'
          onChange={(event) => setText(event.target.value)}
        />
      </label>

      <div className="row">
        <Button
          variant="primary"
          onClick={() => {
            try {
              runImport(JSON.parse(text));
            } catch {
              setNotice(null);
              setErrors(["The pasted text is not valid JSON."]);
            }
          }}
          disabled={text.trim().length === 0}
        >
          Import pasted JSON
        </Button>
      </div>

      {notice ? (
        <p className="notice" role="status">
          {notice}
        </p>
      ) : null}
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
    </Panel>
  );
}
