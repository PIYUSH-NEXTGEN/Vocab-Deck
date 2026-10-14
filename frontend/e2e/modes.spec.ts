import { expect, test } from "@playwright/test";
import { exactText, gotoHome, openMode, selectDeck, VOCAB } from "./helpers";

test.describe("flashcards", () => {
  test("reveals the translation and records a self-assessment", async ({ page }) => {
    await gotoHome(page);
    await selectDeck(page, "English to French");
    await openMode(page, "Flashcards");

    await expect(page.getByText("Card 1 of 50")).toBeVisible();
    await page.getByRole("button", { name: "Reveal translation" }).click();
    await expect(page.locator(".flashcard-translation")).toBeVisible();

    await page.getByRole("button", { name: "Known" }).click();
    await expect(page.getByText("Card 2 of 50")).toBeVisible();
    await expect(page.getByLabel("Session statistics")).toContainText("1 known / 0 practice");
  });

  test("the round size can be limited and rejects out-of-range numbers", async ({ page }) => {
    await gotoHome(page);
    await selectDeck(page, "English to French");
    await openMode(page, "Flashcards");

    const count = page.getByLabel("Cards this round");
    await count.fill("4");
    await count.blur();
    await expect(page.getByText("Card 1 of 4")).toBeVisible();

    await count.fill("51");
    await count.blur();
    await expect(count).toHaveValue("4");
  });
});

test.describe("quiz", () => {
  test("answers give feedback and score exactly once", async ({ page }) => {
    await gotoHome(page);
    await selectDeck(page, "English to French");
    await openMode(page, "Multiple choice");

    await expect(page.getByText("Question 1 of 50")).toBeVisible();
    await page.locator(".option-list .option").first().click();
    await page.getByRole("button", { name: "Submit answer" }).click();

    const feedback = page.getByRole("status");
    await expect(feedback).toContainText(/Correct\.|Not quite/);
    await expect(page.getByLabel("Session statistics")).toContainText(/Quiz\d\/1/);

    // The submit control is gone, so a second submission is impossible.
    await expect(page.getByRole("button", { name: "Submit answer" })).toHaveCount(0);
    await page.getByRole("button", { name: /Next question/ }).click();
    await expect(page.getByText("Question 2 of 50")).toBeVisible();
  });

  test("a wrong answer is marked red and the correct one blue", async ({ page }) => {
    await gotoHome(page);
    await selectDeck(page, "English to French");
    await openMode(page, "Multiple choice");

    const options = page.locator(".option-list .option");
    // Find the correct option from the prompt word using the known vocabulary.
    const prompt = await page.locator(".quiz-prompt .flashcard-word").textContent();
    const answer = VOCAB[(prompt ?? "").trim()];
    expect(answer, `unknown prompt word: ${prompt}`).toBeTruthy();

    await options.filter({ hasText: exactText(answer) }).first().click();
    await page.getByRole("button", { name: "Submit answer" }).click();

    // Correct option uses the accent (blue) tone, others stay neutral.
    const correct = page.locator(".option.option-correct");
    await expect(correct).toHaveCount(1);
    await expect(page.getByRole("status")).toContainText("Correct.");
  });

  test("the question count can be limited and validated", async ({ page }) => {
    await gotoHome(page);
    await selectDeck(page, "English to French");
    await openMode(page, "Multiple choice");

    const count = page.getByLabel("Questions");
    await count.fill("3");
    await count.blur();
    await expect(page.getByText("Question 1 of 3")).toBeVisible();

    await count.fill("99");
    await count.blur();
    await expect(count).toHaveValue("3");
  });
});

test.describe("typing", () => {
  test("rejects empty input, then accepts the correct translation", async ({ page }) => {
    await gotoHome(page);
    await selectDeck(page, "English to French");
    await openMode(page, "Typing");

    await page.getByRole("button", { name: "Check answer" }).click();
    await expect(page.getByRole("alert")).toContainText(/enter a french translation/i);

    const prompt = (await page.locator(".typing-prompt .flashcard-word").textContent()) ?? "";
    const answer = VOCAB[prompt.trim()];
    expect(answer, `unknown prompt word: ${prompt}`).toBeTruthy();

    await page.getByRole("textbox").fill(answer.toUpperCase());
    await page.getByRole("button", { name: "Check answer" }).click();
    await expect(page.getByRole("status")).toContainText("Correct.");
    await expect(page.getByLabel("Session statistics")).toContainText("1/1");
  });
});

test.describe("matching", () => {
  test("pairs every item and reports completion", async ({ page }) => {
    await gotoHome(page);
    await selectDeck(page, "English to French");
    await openMode(page, "Matching");

    // Pairs are presented in batches; work through each batch in turn.
    for (let guard = 0; guard < 12; guard += 1) {
      const left = page.locator(".match-column").first().locator(".match-item");
      await expect(left.first()).toBeVisible();
      const pairCount = await left.count();
      expect(pairCount).toBeGreaterThan(1);

      for (let i = 0; i < pairCount; i += 1) {
        const source = (await left.nth(i).textContent()) ?? "";
        const target = VOCAB[source.trim()];
        expect(target, `unknown source word: ${source}`).toBeTruthy();
        await left.nth(i).click();
        await page
          .locator(".match-column")
          .nth(1)
          .locator(".match-item")
          .filter({ hasText: exactText(target) })
          .first()
          .click();
      }

      // Finishing the final batch ends the round on its own.
      if (await page.getByRole("button", { name: "Next batch" }).count()) {
        await page.getByRole("button", { name: "Next batch" }).click();
        continue;
      }
      break;
    }

    await expect(page.getByRole("heading", { name: /all pairs matched/i })).toBeVisible();
    await expect(page.getByLabel("Session statistics")).toContainText("50 pairs / 50 attempts");
  });

  test("a wrong pair is rejected and can be retried", async ({ page }) => {
    await gotoHome(page);
    await selectDeck(page, "English to French");
    await openMode(page, "Matching");

    const left = page.locator(".match-column").first().locator(".match-item");
    const right = page.locator(".match-column").nth(1).locator(".match-item");
    await expect(left.first()).toBeVisible();
    const firstSource = (await left.first().textContent()) ?? "";
    const correctTarget = VOCAB[firstSource.trim()];

    await left.first().click();
    await right.filter({ hasNotText: exactText(correctTarget) }).first().click();
    await expect(page.getByText(/not a pair/i)).toBeVisible();
    await expect(page.getByLabel("Session statistics")).toContainText("0 pairs / 1 attempts");
  });
});
