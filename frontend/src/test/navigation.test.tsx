import { screen, within } from "@testing-library/react";
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

  expect(await screen.findByRole("heading", { level: 1, name: /vocab deck/i })).toBeInTheDocument();

  const primaryNav = screen.getByRole("navigation", { name: "Primary" });
  await user.click(within(primaryNav).getByRole("link", { name: /deck library/i }));

  expect(await screen.findByRole("heading", { name: /your decks/i })).toBeInTheDocument();
  // Built-in deck visible after load
  expect(await screen.findByText(DECK_DTOS[0].name)).toBeInTheDocument();
});

test("home link navigates back from the library", async () => {
  stubDeckList(DECK_DTOS);
  const user = userEvent.setup();
  renderApp(<App />, "/library");

  const headerNav = screen.getByRole("navigation", { name: "Primary" });
  await user.click(within(headerNav).getByRole("link", { name: /^home$/i }));

  expect(await screen.findByRole("heading", { level: 1, name: /vocab deck/i })).toBeInTheDocument();
});

test("about page explains the product", async () => {
  stubDeckList(DECK_DTOS);
  const user = userEvent.setup();
  renderApp(<App />);

  await user.click(screen.getByRole("link", { name: /^about$/i }));

  expect(await screen.findByRole("heading", { name: /what it is/i })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /how to use it/i })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /the four modes/i })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /decks and your data/i })).toBeInTheDocument();
});

test("unknown route renders not found", async () => {
  stubDeckList(DECK_DTOS);
  renderApp(<App />, "/nope");
  expect(await screen.findByRole("heading", { name: /page not found/i })).toBeInTheDocument();
});
