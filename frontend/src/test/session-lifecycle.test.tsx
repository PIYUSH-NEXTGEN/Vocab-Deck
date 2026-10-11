import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { renderApp } from "./utils";

const CUSTOM_DECK_KEY = "flash-card-game.customDecks.v1";

const CUSTOM_DECK = {
  version: 1,
  deck: {
    id: "custom-es-en-basics",
    name: "Spanish basics",
    description: "Everyday words",
    sourceLanguage: "es",
    targetLanguage: "en",
    entryCount: 3,
  },
  entries: [
    { id: "hola", source: "hola", target: "hello", alternatives: [], tags: [] },
    { id: "gracias", source: "gracias", target: "thank you", alternatives: [], tags: [] },
    { id: "agua", source: "agua", target: "water", alternatives: [], tags: [] },
  ],
  exportedAt: "2026-01-01T00:00:00.000Z",
};

function seedCustomDeck() {
  window.localStorage.setItem(CUSTOM_DECK_KEY, JSON.stringify([CUSTOM_DECK]));
}

/** Sessions are randomized, so answer whatever the current question asks. */
function answerFirstQuestion(): void {
  const options = within(document.querySelector(".option-list") as HTMLElement).getAllByRole(
    "button",
  );
  fireEvent.click(options[0]);
  fireEvent.click(screen.getByRole("button", { name: /submit answer/i }));
}

function quizScore(): string {
  const text = screen.getByLabelText("Session statistics").textContent ?? "";
  return text.match(/Quiz(\d)\/(\d)/)?.[0] ?? "";
}

test("answering a quiz question then switching modes preserves session stats", async () => {
  seedCustomDeck();
  const user = userEvent.setup();
  renderApp(<App />, `/play/quiz/${CUSTOM_DECK.deck.id}`);

  // The custom deck resolves from storage (no API call needed).
  expect(await screen.findByRole("heading", { name: "Spanish basics" })).toBeInTheDocument();

  answerFirstQuestion();
  expect(quizScore()).toMatch(/^Quiz\d\/1$/);

  // Switch to matching via the mode navigation.
  const modeNav = screen.getByRole("navigation", { name: "Practice modes" });
  await user.click(within(modeNav).getByRole("link", { name: "Matching" }));
  expect(await screen.findByRole("heading", { name: "Spanish basics" })).toBeInTheDocument();
  // Quiz stats survive the mode switch.
  expect(quizScore()).toMatch(/^Quiz\d\/1$/);
});

test("an explicit restart resets session statistics", async () => {
  seedCustomDeck();
  const user = userEvent.setup();
  renderApp(<App />, `/play/quiz/${CUSTOM_DECK.deck.id}`);

  await screen.findByRole("heading", { name: "Spanish basics" });
  answerFirstQuestion();
  expect(quizScore()).toMatch(/^Quiz\d\/1$/);

  await user.click(screen.getByRole("button", { name: /restart session/i }));

  expect(screen.getByLabelText("Session statistics")).toHaveTextContent(
    /no session activity|session activity will appear here/i,
  );
  // The active round restarts too: back to question 1 of 3.
  expect(screen.getByText(/question 1 of 3/i)).toBeInTheDocument();
});

test("an unknown deck id surfaces the API error state", async () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({ error: { code: "deck_not_found", message: "Deck 'nope' does not exist." } }),
        { status: 404, headers: { "content-type": "application/json" } },
      ),
    ),
  );
  renderApp(<App />, "/play/flashcards/nope");
  expect(await screen.findByRole("alert")).toHaveTextContent(/deck not found/i);
});

test("an unknown game mode is rejected without touching the API", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  renderApp(<App />, "/play/not-a-mode/fr-en-common");
  expect(await screen.findByRole("heading", { name: /unknown game mode/i })).toBeInTheDocument();
  expect(fetchSpy).not.toHaveBeenCalled();
});
