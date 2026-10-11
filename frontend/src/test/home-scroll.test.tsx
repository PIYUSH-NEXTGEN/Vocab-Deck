/**
 * Home screen: selecting a deck expands the practice section and scrolls it
 * into view — exactly once per selection, and instant under reduced motion.
 */

import { expect, test, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { renderApp, stubDeckList, DECK_DTOS } from "./utils";
import { setReducedMotion } from "./setup";

const firstCard = () => screen.getAllByRole("button", { name: /select deck/i })[0];

test("selecting a deck scrolls the practice section into view", async () => {
  stubDeckList(DECK_DTOS);
  const scrollSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const user = userEvent.setup();
  renderApp(<App />);

  await user.click(await waitFor(firstCard));

  await waitFor(() => expect(scrollSpy).toHaveBeenCalledTimes(1));
  expect(scrollSpy).toHaveBeenCalledWith(
    expect.objectContaining({ behavior: "smooth", top: expect.any(Number) }),
  );
});

test("scrolling happens once per selection, not on unrelated updates", async () => {
  stubDeckList(DECK_DTOS);
  const scrollSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const user = userEvent.setup();
  renderApp(<App />);

  await user.click(await waitFor(firstCard));
  await waitFor(() => expect(scrollSpy).toHaveBeenCalledTimes(1));

  // Unrelated state change (filtering) must not scroll again.
  await user.selectOptions(screen.getByLabelText(/filter decks by language pair/i), "de->ja");
  await waitFor(() => expect(screen.getByText(DECK_DTOS[1].name)).toBeInTheDocument());
  expect(scrollSpy).toHaveBeenCalledTimes(1);

  // Choosing a different deck scrolls to the new section.
  await user.click(screen.getByRole("button", { name: /select deck/i }));
  await waitFor(() => expect(scrollSpy).toHaveBeenCalledTimes(2));
});

test("deselecting and reselecting the same deck scrolls again", async () => {
  stubDeckList(DECK_DTOS);
  const scrollSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const user = userEvent.setup();
  renderApp(<App />);

  await user.click(await waitFor(firstCard));
  await waitFor(() => expect(scrollSpy).toHaveBeenCalledTimes(1));

  await user.click(screen.getByRole("button", { name: /deselect deck/i }));
  expect(screen.queryByRole("heading", { name: /practice french/i })).not.toBeInTheDocument();
  expect(scrollSpy).toHaveBeenCalledTimes(1);

  await user.click(await waitFor(firstCard));
  await waitFor(() => expect(scrollSpy).toHaveBeenCalledTimes(2));
});

test("reduced motion scrolls instantly", async () => {
  setReducedMotion(true);
  stubDeckList(DECK_DTOS);
  const scrollSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const user = userEvent.setup();
  renderApp(<App />);

  await user.click(await waitFor(firstCard));

  await waitFor(() => expect(scrollSpy).toHaveBeenCalledTimes(1));
  expect(scrollSpy).toHaveBeenCalledWith(expect.objectContaining({ behavior: "auto" }));
});

test("navigating to another mode scrolls the new screen to the top", async () => {
  stubDeckList(DECK_DTOS);
  const scrollSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const user = userEvent.setup();
  renderApp(<App />);

  // Navigating to a route resets the scroll position (initial render excluded).
  await user.click(within(screen.getByRole("navigation", { name: "Primary" })).getByRole("link", { name: /deck library/i }));
  await waitFor(() => expect(scrollSpy).toHaveBeenCalledTimes(1));
  expect(scrollSpy).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
});
