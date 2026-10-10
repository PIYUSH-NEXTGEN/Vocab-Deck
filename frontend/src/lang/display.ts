/** Language-code display helpers. Never assume any particular language. */

const displayNames = new Intl.DisplayNames(["en"], { type: "language" });

export function languageName(code: string): string {
  if (!code) return "";
  try {
    return displayNames.of(code) ?? code;
  } catch {
    return code;
  }
}

export function languageCodeLabel(code: string): string {
  return code.toUpperCase();
}

/** e.g. "French → English"; arrow direction is source → target. */
export function languagePairLabel(source: string, target: string): string {
  if (!source || !target) return "";
  return `${languageName(source)} → ${languageName(target)}`;
}
