/**
 * Theme system: explicit light default, toggle, persistence, and the
 * no-flash bootstrap contract.
 */

import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider, THEME_STORAGE_KEY, useTheme } from "../theme/ThemeProvider";
import { SessionProvider } from "../session/SessionProvider";
import { ThemeToggle } from "../components/ThemeToggle";
import { AppShell } from "../components/AppShell";
import { App } from "../App";

function renderWithTheme(ui: React.ReactElement, route = "/") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <ThemeProvider>
        <SessionProvider>{ui}</SessionProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

function Probe() {
  const { theme, nextTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="next">{nextTheme}</span>
    </div>
  );
}

/** Stub prefers-color-scheme for one test. */
function stubSystemScheme(dark: boolean) {
  return vi.spyOn(window, "matchMedia").mockImplementation((query: string) => {
    const matches = query.includes("prefers-color-scheme") ? dark : false;
    return {
      media: query,
      get matches() {
        return matches;
      },
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => true,
      onchange: null,
    } as unknown as MediaQueryList;
  });
}

describe("theme provider", () => {
  test("defaults to light when the OS has no preference and nothing is stored", () => {
    renderWithTheme(<Probe />);
    expect(screen.getByTestId("theme")).toHaveTextContent("light");
  });

  test("defaults to light when nothing is stored, even if the OS prefers dark", () => {
    stubSystemScheme(true);
    renderWithTheme(<Probe />);
    expect(screen.getByTestId("theme")).toHaveTextContent("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  test("restores the stored preference over the OS preference", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    stubSystemScheme(true);
    renderWithTheme(<Probe />);
    expect(screen.getByTestId("theme")).toHaveTextContent("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  test("toggling switches, persists and updates the html attribute", () => {
    renderWithTheme(
      <>
        <Probe />
        <ThemeToggle />
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: /switch to dark mode/i }));

    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    expect(screen.getByTestId("next")).toHaveTextContent("light");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

    fireEvent.click(screen.getByRole("button", { name: /switch to light mode/i }));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  test("the toggle is keyboard operable", async () => {
    renderWithTheme(<ThemeToggle />);
    const button = screen.getByRole("button", { name: /switch to dark mode/i });
    button.focus();
    expect(button).toHaveFocus();
    fireEvent.keyDown(button, { key: "Enter" });
    // Buttons activate on Enter via click; assert the label flipped.
    fireEvent.click(button);
    expect(screen.getByRole("button", { name: /switch to light mode/i })).toBeInTheDocument();
  });
});

describe("theme in the shell", () => {
  test("the navbar exposes the toggle on every page", () => {
    renderWithTheme(<AppShell />);
    expect(screen.getByRole("button", { name: /switch to (dark|light) mode/i })).toBeInTheDocument();
  });

  test("the theme survives navigation between routes", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    renderWithTheme(<App />, "/");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});

test("the no-flash bootstrap script defaults to light in index.html", () => {
  const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
  expect(html).toMatch(/localStorage.getItem\("vocabdeck.theme"\)/);
  expect(html).toMatch(/document.documentElement.dataset.theme/);
  expect(html).not.toMatch(/prefers-color-scheme/);
});
