import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { renderApp } from "./utils";

function stubFailure(status: number, code: string, message: string) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify({ error: { code, message } }), {
        status,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
}

test("network failure shows a retryable error state", async () => {
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValueOnce(new TypeError("Failed to fetch"))
    .mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            decks: [
              {
                id: "fr-en-common",
                name: "French to English Common Words",
                description: "",
                source_language: "fr",
                target_language: "en",
                entry_count: 101,
              },
            ],
            total: 1,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

  const user = userEvent.setup();
  renderApp(<App />);

  expect(await screen.findByRole("alert")).toHaveTextContent(/vocabulary service unavailable/i);

  await user.click(screen.getByRole("button", { name: /try again/i }));

  expect(await screen.findByText("French to English Common Words")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test("server error body is surfaced to the user", async () => {
  stubFailure(500, "internal_error", "Unexpected server error.");
  renderApp(<App />);
  expect(await screen.findByRole("alert")).toHaveTextContent(/unexpected server error/i);
});

test("empty deck list shows the empty state", async () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify({ decks: [], total: 0 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
  renderApp(<App />);
  expect(
    await screen.findByRole("heading", { name: /no decks for this language pair/i }),
  ).toBeInTheDocument();
});
