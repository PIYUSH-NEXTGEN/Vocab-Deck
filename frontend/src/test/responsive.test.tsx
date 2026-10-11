import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

test("compact navigation collapses behind a toggle", async () => {
  setCompactViewport(true);
  stubDeckList(DECK_DTOS);
  const user = userEvent.setup();
  renderApp(<App />);

  const toggle = await screen.findByRole("button", { name: /menu/i });
  // Accessible names aren't computed for hidden elements, so query by role only.
  const nav = document.getElementById("primary-navigation")!;
  expect(nav).toHaveAttribute("hidden");
  expect(nav).toHaveAttribute("aria-label", "Primary");

  await user.click(toggle);

  expect(nav).not.toHaveAttribute("hidden");
  expect(within(nav).getByRole("link", { name: /deck library/i })).toBeInTheDocument();

  await user.click(within(nav).getByRole("link", { name: /deck library/i }));
  expect(await screen.findByRole("heading", { name: /your decks/i })).toBeInTheDocument();
  // Navigating closes the menu again.
  expect(document.getElementById("primary-navigation")).toHaveAttribute("hidden");
});
