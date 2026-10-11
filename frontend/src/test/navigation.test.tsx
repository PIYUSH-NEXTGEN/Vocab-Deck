import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { renderApp, stubDeckList, DECK_DTOS } from "./utils";

afterEach(() => {
  vi.restoreAllMocks();
});

test("home -> library navigation works", async () => {
  stubDeckList(DECK_DTOS);
  const user = userEvent.setup();
  renderApp(<App />);

  expect(await screen.findByRole("heading", { name: /vocab deck/i })).toBeInTheDocument();

  await user.click(screen.getByRole("link", { name: /deck library/i }));

  expect(await screen.findByRole("heading", { name: /your decks/i })).toBeInTheDocument();
  // Built-in deck visible after load
  expect(await screen.findByText(DECK_DTOS[0].name)).toBeInTheDocument();
});

test("home link navigates back from the library", async () => {
  stubDeckList(DECK_DTOS);
  const user = userEvent.setup();
  renderApp(<App />, "/library");

  await user.click(screen.getByRole("link", { name: /^home$/i }));

  expect(await screen.findByRole("heading", { name: /vocab deck/i })).toBeInTheDocument();
});

test("unknown route renders not found", async () => {
  stubDeckList(DECK_DTOS);
  renderApp(<App />, "/nope");
  expect(await screen.findByRole("heading", { name: /page not found/i })).toBeInTheDocument();
});
