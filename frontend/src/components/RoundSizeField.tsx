/**
 * The "Entries this round" style number input shared by the quiz, typing, and
 * flashcards modes. Same markup, classes, and keyboard handling everywhere:
 * typing commits on blur or Enter, anything else leaves the input alone for
 * the owning mode to validate and revert.
 */
export function RoundSizeField({
  id,
  label,
  max,
  value,
  onChange,
  onCommit,
}: {
  /** Unique input id; the hint id is derived as `${id}-hint`. */
  id: string;
  label: string;
  max: number;
  value: string;
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
}) {
  return (
    <span className="row round-size">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="round-size-input"
        type="number"
        inputMode="numeric"
        min={1}
        max={max}
        step={1}
        value={value}
        aria-describedby={`${id}-hint`}
        onChange={(event) => onChange(event.target.value)}
        onBlur={(event) => onCommit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onCommit((event.target as HTMLInputElement).value);
          }
        }}
      />
      <span className="faint" id={`${id}-hint`}>
        1–{max}
      </span>
    </span>
  );
}
