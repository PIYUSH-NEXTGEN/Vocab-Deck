import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { renderApp, stubDeckList, DECK_DTOS } from "./utils";

test("selecting a built-in deck reveals the four game modes with links", async () => {
  stubDeckList(DECK_DTOS);
  const user = userEvent.setup();
  renderApp(<App />);

  expect(await screen.findByText(DECK_DTOS[0].name)).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /flashcards/i })).not.toBeInTheDocument();

  await user.click(screen.getAllByRole("button", { name: /select deck/i })[0]);

  const modeLinks = screen.getAllByRole("link", { name: /flashcards|multiple choice|typing|matching/i });
  expect(modeLinks).toHaveLength(4);
  const flashcards = screen.getByRole("link", { name: /flashcards/i });
  expect(flashcards).toHaveAttribute("href", "/play/flashcards/fr-en-common");
  expect(screen.getByRole("link", { name: /multiple choice/i })).toHaveAttribute(
    "href",
    "/play/quiz/fr-en-common",
  );
});

test("language pair filter narrows the deck list", async () => {
  stubDeckList(DECK_DTOS);
  const user = userEvent.setup();
  renderApp(<App />);

  const filter = await screen.findByLabelText(/filter decks by language pair/i);
  await user.selectOptions(filter, "de->ja");

  expect(screen.queryByText(DECK_DTOS[0].name)).not.toBeInTheDocument();
  expect(screen.getByText(DECK_DTOS[1].name)).toBeInTheDocument();
});

test("de-ja deck offers the same four modes (language-agnostic)", async () => {
  stubDeckList(DECK_DTOS);
  const user = userEvent.setup();
  renderApp(<App />);

  await user.click((await screen.findAllByRole("button", { name: /select deck/i }))[1]);
  const section = screen.getByRole("region", { name: /practice german to japanese starter/i });
  expect(within(section).getByRole("link", { name: /matching/i })).toHaveAttribute(
    "href",
    "/play/matching/de-ja-starter",
  );
});
