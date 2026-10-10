/** Game mode registry. Labels are language-agnostic and mode-agnostic. */

export const GAME_MODES = [
  {
    id: "flashcards",
    label: "Flashcards",
    blurb: "Reveal each translation, then mark whether you knew it.",
  },
  {
    id: "quiz",
    label: "Multiple choice",
    blurb: "Choose the correct translation from distinct options.",
  },
  {
    id: "typing",
    label: "Typing",
    blurb: "Type the translation; alternatives and accents are handled.",
  },
  {
    id: "matching",
    label: "Matching",
    blurb: "Pair each source word with its translation.",
  },
] as const;

export type GameModeId = (typeof GAME_MODES)[number]["id"];

export function isGameModeId(value: string): value is GameModeId {
  return GAME_MODES.some((mode) => mode.id === value);
}

export function gameModeLabel(modeId: GameModeId): string {
  return GAME_MODES.find((mode) => mode.id === modeId)?.label ?? modeId;
}
