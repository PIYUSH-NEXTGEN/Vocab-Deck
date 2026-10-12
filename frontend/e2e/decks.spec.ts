import { expect, test } from "@playwright/test";
import { tempFile } from "./helpers";

const CUSTOM_DECK = {
  version: 1,
  deck: {
    id: "custom-e2e-spanish",
    name: "E2E Spanish",
    description: "Created by the end-to-end suite",
    sourceLanguage: "spanish",
    targetLanguage: "english",
    entryCount: 2,
  },
  entries: [
    { id: "hola", source: "hola", target: "hello", alternatives: [], tags: [] },
    { id: "gracias", source: "gracias", target: "thank you", alternatives: [], tags: [] },
  ],
  exportedAt: "2026-01-01T00:00:00.000Z",
};

test.describe("custom decks", () => {
  test("creates, plays, exports, imports and deletes a custom deck", async ({ page }) => {
    await page.goto("/library");
    await expect(page.getByRole("heading", { level: 1, name: "Your decks" })).toBeVisible();

    // --- Create through the editor ---
    await page.getByRole("button", { name: "New custom deck" }).click();
    await page.getByLabel("Deck name").fill("E2E Spanish");
    await page.getByLabel("Source language").fill("spanish");
    await page.getByLabel("Target language").fill("english");
    await page.getByLabel("Entry 1 source").fill("hola");
    await page.getByLabel("Entry 1 translation").fill("hello");
    await page.getByRole("button", { name: "Add entry" }).click();
    await page.getByLabel("Entry 2 source").fill("gracias");
    await page.getByLabel("Entry 2 translation").fill("thank you");
    await page.getByRole("button", { name: "Create deck" }).click();

    // Lands on the library, custom tab, with the new deck listed.
    await expect(page.getByRole("heading", { name: /no custom decks yet/i })).toHaveCount(0);
    await expect(page.getByText("E2E Spanish").first()).toBeVisible();

    // --- Play it (proves custom decks work in the modes) ---
    await page.getByRole("button", { name: "Select deck E2E Spanish" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "E2E Spanish" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Practice modes" })).toBeVisible();

    // --- Export and verify the file contents ---
    await page.goto("/library");
    await page.getByRole("button", { name: /^Custom/ }).click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export JSON" }).click(),
    ]);
    const exportPath = await download.path();
    const { readFileSync } = await import("node:fs");
    const exported = JSON.parse(readFileSync(exportPath!, "utf8"));
    expect(exported.deck.id).toBe("custom-e2e-spanish");
    expect(exported.entries).toHaveLength(2);

    // --- Delete, then re-import the exported file ---
    await page.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Confirm delete" }).click();
    await expect(page.getByRole("heading", { name: /no custom decks yet/i })).toBeVisible();

    await page
      .getByLabel("Choose a deck file to import")
      .setInputFiles(tempFile("e2e-spanish.json", JSON.stringify(CUSTOM_DECK)));
    const preview = page.getByRole("region", { name: "Import preview" });
    await expect(preview).toContainText("E2E Spanish");
    await expect(preview).toContainText("2 entries");
    await page.getByRole("button", { name: "Import deck" }).click();
    await expect(page.getByText("E2E Spanish").first()).toBeVisible();
  });

  test("rejects a malformed import without touching stored decks", async ({ page }) => {
    await page.goto("/library");
    await page.getByRole("button", { name: /^Custom/ }).click();

    await page
      .getByLabel("Choose a deck file to import")
      .setInputFiles(tempFile("broken.json", "{ not json at all"));
    await expect(page.getByRole("alert")).toContainText(/not valid json/i);

    // Nothing was stored.
    await expect(page.getByRole("heading", { name: /no custom decks yet/i })).toBeVisible();
    const stored = await page.evaluate(() =>
      window.localStorage.getItem("flash-card-game.customDecks.v1"),
    );
    expect(stored === null || JSON.parse(stored).length === 0).toBeTruthy();
  });

  test("built-in decks are read-only in the library", async ({ page }) => {
    await page.goto("/library");
    await expect(page.getByText("Read-only").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^Delete$/ })).toHaveCount(0);

    // Editing a built-in id is refused.
    await page.goto("/editor/en-de");
    await expect(page.getByRole("heading", { name: /built-in decks are read-only/i })).toBeVisible();
  });
});

test.describe("session lifecycle", () => {
  test("restart clears the session statistics", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Select deck English to French" }).click();
    await page.getByRole("link", { name: "Multiple choice" }).click();

    await page.locator(".option-list .option").first().click();
    await page.getByRole("button", { name: "Submit answer" }).click();
    await expect(page.getByLabel("Session statistics")).toContainText(/Quiz\d\/1/);

    await page.getByRole("button", { name: "Restart session" }).click();
    await expect(page.getByLabel("Session statistics")).toContainText(
      /no session activity|session activity will appear here/i,
    );
    await expect(page.getByText("Question 1 of 20")).toBeVisible();
  });

  test("progress is never written to browser storage", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Select deck English to French" }).click();
    await page.getByRole("link", { name: "Multiple choice" }).click();
    await page.locator(".option-list .option").first().click();
    await page.getByRole("button", { name: "Submit answer" }).click();
    await expect(page.getByLabel("Session statistics")).toContainText(/Quiz\d\/1/);

    const keys = await page.evaluate(() => Object.keys(window.localStorage));
    // Only custom decks (user data) and the theme preference may persist.
    // Never scores, answers or session state.
    const gameplayKeys = keys.filter(
      (key) => !key.includes("customDecks") && !key.startsWith("vocabdeck.theme"),
    );
    expect(gameplayKeys).toEqual([]);
  });
});
