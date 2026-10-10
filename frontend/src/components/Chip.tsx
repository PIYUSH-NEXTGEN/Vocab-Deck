import type { ReactNode } from "react";
import { languageName } from "../lang/display";

function languageLabel(code: string): string {
  const name = languageName(code);
  return name && name !== code ? name : code;
}

export function Chip({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "correct" | "incorrect" }) {
  return <span className={`chip chip-${tone}`}>{children}</span>;
}

/** Language chip showing the human-readable name and the raw code. */
export function LanguageChip({ code }: { code: string }) {
  return (
    <Chip tone="accent">
      <span className="chip-name">{languageLabel(code)}</span>
      <span className="chip-code">{code.toUpperCase()}</span>
    </Chip>
  );
}
