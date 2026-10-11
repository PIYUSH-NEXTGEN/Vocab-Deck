import { expect, test } from "@playwright/test";
import { gotoHome, selectDeck } from "./helpers";

test.describe("responsive behaviour", () => {
  test("desktop shows the floating navbar", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoHome(page);

    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link", { name: "Home" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Menu$/ })).toHaveCount(0);
  });

  test("mobile collapses navigation behind the menu toggle", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoHome(page);

    const toggle = page.getByRole("button", { name: "Menu" });
    await expect(toggle).toBeVisible();
    await expect(page.getByRole("link", { name: "Deck library" })).toBeHidden();

    await toggle.click();
    await expect(page.getByRole("link", { name: "Deck library" })).toBeVisible();
    await page.getByRole("link", { name: "Deck library" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Your decks" })).toBeVisible();
  });

  test("no horizontal overflow on key screens", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoHome(page);
    await selectDeck(page, "English to Japanese");
    await page.getByRole("link", { name: "Matching" }).click();
    await expect(page.getByRole("navigation", { name: "Practice modes" })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("long Japanese content wraps without clipping the card", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoHome(page);
    await selectDeck(page, "English to Japanese");
    await page.getByRole("link", { name: "Flashcards" }).click();

    for (let i = 0; i < 4; i += 1) {
      await page.getByRole("button", { name: "Reveal translation" }).click();
      const box = await page.locator(".flashcard-translation").boundingBox();
      const card = await page.locator(".flashcard-flip").boundingBox();
      expect(box!.width).toBeLessThanOrEqual(card!.width + 1);
      await page.getByRole("button", { name: /Known|Needs practice/ }).first().click();
    }
  });
});

test.describe("theme switching", () => {
  test("toggles, persists and restores the dark theme", async ({ page }) => {
    await gotoHome(page);
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", "light");

    await page.getByRole("button", { name: "Switch to dark mode" }).click();
    await expect(html).toHaveAttribute("data-theme", "dark");

    await page.reload();
    await expect(html).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("button", { name: "Switch to light mode" })).toBeVisible();
  });
});
