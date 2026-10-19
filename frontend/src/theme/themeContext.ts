import { createContext } from "react";

export type ThemeChoice = "light" | "dark";

export const THEME_STORAGE_KEY = "vocabdeck.theme";
export const DEFAULT_THEME: ThemeChoice = "light";

export interface ThemeApi {
  theme: ThemeChoice;
  /** The theme the toggle switches to. */
  nextTheme: ThemeChoice;
  toggle: () => void;
}

export const ThemeContext = createContext<ThemeApi | null>(null);
