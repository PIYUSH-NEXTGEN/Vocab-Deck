import { expect, test } from "@playwright/test";

test("repeat visits serve deck API responses from cache", async ({ page }) => {
  async function apiBytes(): Promise<number> {
    await page.goto("/");
    await page.getByRole("button", { name: /select deck/i }).first().waitFor();
    const entries = await page.evaluate(() =>
      performance
        .getEntriesByType("resource")
        .filter((e) => e.name.includes("/api/"))
        .map((e) => (e as PerformanceResourceTransferSize).transferSize ?? 0),
    );
    performance.clearResourceTimings?.();
    return entries.reduce((a, b) => a + b, 0);
  }
  const first = await apiBytes();
  const second = await apiBytes();
  console.log(`api transfer bytes: first visit=${first}, second visit=${second}`);
  expect(first).toBeGreaterThan(0);
  expect(second).toBeLessThan(first);
});
