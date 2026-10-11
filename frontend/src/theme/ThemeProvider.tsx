/**
 * Theme state: light/dark, persisted in localStorage, falling back to the
 * operating system preference until the user makes an explicit choice.
 * An inline script in index.html applies the stored choice before first paint,
 * so there is no flash of the wrong theme.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemeChoice = "light" | "dark";

export const THEME_STORAGE_KEY = "vocabdeck.theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

function systemTheme(): ThemeChoice {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "light";
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function storedTheme(): ThemeChoice | null {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

export interface ThemeApi {
  theme: ThemeChoice;
  /** The theme the toggle switches to. */
  nextTheme: ThemeChoice;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeApi | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeChoice>(() => storedTheme() ?? systemTheme());

  // Reflect the choice on <html> and remember it.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Storage unavailable: the theme still applies for this session.
    }
  }, [theme]);

  // Follow the OS only while the user has not chosen explicitly.
  useEffect(() => {
    if (storedTheme() !== null) return;
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(DARK_QUERY);
    const onChange = (event: MediaQueryListEvent) =>
      setTheme(event.matches ? "dark" : "light");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const toggle = useCallback(
    () => setTheme((current) => (current === "dark" ? "light" : "dark")),
    [],
  );

  const value = useMemo<ThemeApi>(
    () => ({ theme, nextTheme: theme === "dark" ? "light" : "dark", toggle }),
    [theme, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeApi {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used inside <ThemeProvider>.");
  }
  return context;
}
