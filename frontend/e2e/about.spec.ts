import { expect, test } from "@playwright/test";

const SECTIONS = [
  ["What it is", "about-what"],
  ["How to use it", "about-how-to-use"],
  ["The four modes", "about-modes"],
  ["Decks and your data", "about-decks"],
  ["Details worth knowing", "about-details"],
] as const;

test("about page TOC links land on the right section, clear of the sticky header", async ({
  page,
}) => {
  await page.goto("/about");
  const headerBottom = async () => {
    const box = await page.locator(".app-header").boundingBox();
    return box!.y + box!.height;
  };

  for (const [label, id] of SECTIONS) {
    await page.getByRole("link", { name: label, exact: true }).click();
    const heading = page.locator(`#${id}`);
    await expect(heading).toBeVisible();
    // The heading must settle below the sticky header, not hidden under it
    // (which reads as "scrolled past the right section").
    await expect
      .poll(async () => (await heading.boundingBox())?.y ?? -1)
      .toBeGreaterThanOrEqual((await headerBottom()) - 1);
    expect(await heading.textContent()).toContain(label);
  }
});
