import { screen, within } from "@testing-library/react";
import { App } from "../App";
import { renderApp, stubDeckList, DECK_DTOS } from "./utils";
import { setCompactViewport } from "./setup";

test("desktop navigation shows links inline without the menu toggle", async () => {
  setCompactViewport(false);
  stubDeckList(DECK_DTOS);
  renderApp(<App />);

  const primaryNav = screen.getByRole("navigation", { name: "Primary" });
  expect(await within(primaryNav).findByRole("link", { name: /deck library/i })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /menu|close/i })).not.toBeInTheDocument();
});

test("compact navigation still shows the full navbar without a toggle", async () => {
  setCompactViewport(true);
  stubDeckList(DECK_DTOS);
  renderApp(<App />);

  const primaryNav = await screen.findByRole("navigation", { name: "Primary" });
  expect(within(primaryNav).getByRole("link", { name: /home/i })).toBeVisible();
  expect(within(primaryNav).getByRole("link", { name: /deck library/i })).toBeVisible();
  expect(within(primaryNav).getByRole("link", { name: /about/i })).toBeVisible();
  expect(screen.queryByRole("button", { name: /menu|close/i })).not.toBeInTheDocument();
});
