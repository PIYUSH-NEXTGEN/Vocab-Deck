import { expect, test } from "@playwright/test";
import { gotoHome, selectDeck } from "./helpers";

test.describe("health and deck loading", () => {
  test("the API health endpoint reports the built-in decks", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.deck_count).toBe(3);
  });

  test("the home screen lists the three built-in decks", async ({ page }) => {
    await gotoHome(page);
    for (const name of ["English to German", "English to French", "English to Japanese"]) {
      await expect(page.getByRole("button", { name: `Select deck ${name}` })).toBeVisible();
    }
  });

  test("each built-in deck exposes 50 entries through the API", async ({ request }) => {
    for (const id of ["en-de", "en-fr", "en-ja"]) {
      const summary = await (await request.get(`/api/decks/${id}`)).json();
      expect(summary.entry_count).toBe(50);
      const page = await (await request.get(`/api/decks/${id}/entries`)).json();
      expect(page.total).toBe(50);
    }
  });

  test("unknown resources return the documented error shape", async ({ request }) => {
    const response = await request.get("/api/decks/does-not-exist");
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("deck_not_found");
  });
});

test.describe("language pairs", () => {
  test("the Japanese deck studies kanji with kana alternatives", async ({ page }) => {
    await gotoHome(page);
    await selectDeck(page, "English to Japanese");

    await page.getByRole("link", { name: "Typing" }).click();
    // The prompt is labelled with the deck's target language.
    await expect(page.getByText(/your japanese translation/i)).toBeVisible();
    // Answer wrong first: the feedback reveals the accepted translations.
    await page.getByRole("textbox").fill("zzz");
    await page.getByRole("button", { name: "Check answer" }).click();
    const feedback = page.getByRole("status");
    await expect(feedback).toContainText(/accepted:/i);
    const accepted = (await feedback.textContent()) ?? "";
    // One of the accepted answers is the Japanese target itself.
    expect(accepted).toMatch(/[\u3040-\u30ff\u4e00-\u9faf]/);
  });

  test("the French deck renders accents and the ligature", async ({ page }) => {
    await gotoHome(page);
    await selectDeck(page, "English to French");
    await page.getByRole("link", { name: "Flashcards" }).click();

    // Walk the whole round; accented entries are guaranteed to appear.
    for (let i = 0; i < 25; i += 1) {
      await page.getByRole("button", { name: "Reveal translation" }).click();
      const translation = page.locator(".flashcard-translation");
      const text = (await translation.textContent()) ?? "";
      if (/[éœ]/.test(text)) {
        expect(text).toMatch(/[éœ]/);
        return;
      }
      await page.getByRole("button", { name: /Known|Needs practice/ }).first().click();
    }
    throw new Error("no accented translation appeared within 6 cards");
  });

  test("reversing the direction swaps the language pair", async ({ page }) => {
    await gotoHome(page);
    await selectDeck(page, "English to German");

    await page.getByRole("link", { name: "Multiple choice" }).click();
    await expect(page.getByText(/choose the german translation/i)).toBeVisible();

    await page.getByRole("button", { name: /reverse study direction/i }).click();
    await expect(page.getByText(/choose the english translation/i)).toBeVisible();
  });
});
