import { expect, test } from "@playwright/test";
import { exactText, gotoHome, openMode, selectDeck } from "./helpers";

interface ApiEntriesResponse {
  entries: { source: string; target: string }[];
}

test.describe("smart quiz distractor and confusion engine", () => {
  test("toggles distractor difficulty, surfaces confusion insights, and launches targeted confusion practice", async ({
    page,
    request,
  }) => {
    const res = await request.get("/api/decks/en-fr/entries");
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as ApiEntriesResponse;
    const targetBySource = new Map(body.entries.map((entry) => [entry.source, entry.target]));

    await gotoHome(page);
    await selectDeck(page, "English to French");
    await openMode(page, "Multiple choice");

    // Verify Distractor difficulty control defaults to Adaptive and switches cleanly.
    const difficultyGroup = page.getByRole("group", { name: "Distractor difficulty" });
    await expect(difficultyGroup.getByRole("button", { name: /Adaptive/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await difficultyGroup.getByRole("button", { name: /Challenging/i }).click();
    await expect(difficultyGroup.getByRole("button", { name: /Challenging/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // Limit the round to 2 questions so we reach summary cleanly.
    const countInput = page.locator("#quiz-question-count");
    await countInput.fill("2");
    await countInput.press("Enter");
    await expect(page.getByText("Question 1 of 2")).toBeVisible();

    // Question 1: deliberately pick a wrong distractor to trigger confusion tracking.
    const q1Prompt = (await page.locator(".quiz-prompt .flashcard-word").textContent())?.trim() ?? "";
    const q1Correct = targetBySource.get(q1Prompt);
    expect(q1Correct).toBeTruthy();

    const q1Options = page.locator(".option-list .option");
    const q1Count = await q1Options.count();
    let clickedWrong = false;
    for (let i = 0; i < q1Count; i += 1) {
      const text = (await q1Options.nth(i).locator(".option-text").textContent())?.trim() ?? "";
      if (text !== q1Correct) {
        await q1Options.nth(i).click();
        clickedWrong = true;
        break;
      }
    }
    expect(clickedWrong).toBeTruthy();

    await page.getByRole("button", { name: /Submit answer/i }).click();
    await expect(page.locator(".quiz-confusion-insight")).toBeVisible();
    await expect(page.locator(".quiz-confusion-insight")).toContainText(/confused 1× this session/i);

    // Advance to Question 2 and submit the right answer.
    await page.getByRole("button", { name: /Next question/i }).click();
    await expect(page.getByText("Question 2 of 2")).toBeVisible();
    const q2Prompt = (await page.locator(".quiz-prompt .flashcard-word").textContent())?.trim() ?? "";
    const q2Correct = targetBySource.get(q2Prompt)!;
    expect(q2Correct).toBeTruthy();

    await page.locator(".option-list .option", { hasText: exactText(q2Correct) }).click();
    await page.getByRole("button", { name: /Submit answer/i }).click();
    await page.getByRole("button", { name: /See results/i }).click();

    // Summary lists the confused word pair and offers targeted confusion practice.
    await expect(page.getByRole("heading", { name: "Quiz complete" })).toBeVisible();
    await expect(page.getByText(/Confusable word pairs this session \(1\):/i)).toBeVisible();

    const practiceBtn = page.getByRole("button", { name: /Practice Confused Words \(2\)/i });
    await expect(practiceBtn).toBeVisible();
    await practiceBtn.click();

    await expect(page.getByText("Review Question 1 of 2")).toBeVisible();
  });
});
