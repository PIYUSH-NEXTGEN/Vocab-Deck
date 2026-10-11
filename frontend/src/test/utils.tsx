import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SessionProvider } from "../session/SessionProvider";
import { ThemeProvider } from "../theme/ThemeProvider";
import { vi } from "vitest";
import type { DeckListResponseDto } from "../api/types";

export function renderApp(ui: ReactElement, route = "/") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <ThemeProvider>
        <SessionProvider>{ui}</SessionProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

export function stubDeckList(decks: DeckListResponseDto["decks"]) {
  const body: DeckListResponseDto = { decks, total: decks.length };
  return vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = String(input);
    if (url.includes("/api/decks")) {
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    }
    return Promise.reject(new TypeError(`Unexpected request: ${url}`));
  });
}

export const DECK_DTOS: DeckListResponseDto["decks"] = [
  {
    id: "fr-en-common",
    name: "French to English Common Words",
    description: "Common vocabulary.",
    source_language: "fr",
    target_language: "en",
    entry_count: 101,
  },
  {
    id: "de-ja-starter",
    name: "German to Japanese Starter",
    description: "Starter words.",
    source_language: "de",
    target_language: "ja",
    entry_count: 8,
  },
];
