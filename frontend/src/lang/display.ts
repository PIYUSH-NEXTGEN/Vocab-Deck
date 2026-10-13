/** Language-code display helpers. Never assume any particular language. */

const displayNames = new Intl.DisplayNames(["en"], { type: "language" });

/** Normalize a language input (code or full name) to a displayable form. */
function normalizeLanguage(value: string): string {
  const trimmed = value.trim().toLowerCase();
  return trimmed;
}

export function languageName(code: string): string {
  if (!code) return "";
  const normalized = normalizeLanguage(code);
  try {
    const result = displayNames.of(normalized);
    // If the result is the same as input (likely a full name), return the input as-is (capitalized)
    if (result && result.toLowerCase() === normalized) {
      return code.charAt(0).toUpperCase() + code.slice(1).toLowerCase();
    }
    return result ?? code;
  } catch {
    // If Intl.DisplayNames fails (e.g., full name), return the input capitalized
    return code.charAt(0).toUpperCase() + code.slice(1).toLowerCase();
  }
}

/** e.g. "French → English"; arrow direction is source → target. */
export function languagePairLabel(source: string, target: string): string {
  if (!source || !target) return "";
  return `${languageName(source)} → ${languageName(target)}`;
}
