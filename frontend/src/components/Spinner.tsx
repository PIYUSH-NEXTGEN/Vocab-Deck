export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span className="spinner" role="status" aria-live="polite">
      <span className="spinner-mark" aria-hidden="true" />
      <span className="faint">{label}</span>
    </span>
  );
}
