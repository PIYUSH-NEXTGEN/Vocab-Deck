import { expect, type Page } from "@playwright/test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Known built-in vocabulary (the shared 25-word list) for matching tests. */
export const VOCAB: Record<string, string> = {
  water: "eau",
  bread: "pain",
  book: "livre",
  house: "maison",
  cat: "chat",
  dog: "chien",
  friend: "ami",
  school: "école",
  table: "table",
  chair: "chaise",
  door: "porte",
  window: "fenêtre",
  apple: "pomme",
  milk: "lait",
  sun: "soleil",
  moon: "lune",
  tree: "arbre",
  car: "voiture",
  city: "ville",
  road: "route",
  hand: "main",
  eye: "œil",
  day: "jour",
  night: "nuit",
  love: "amour",
};

export async function gotoHome(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Vocab Deck" })).toBeVisible();
}

/** Select a deck card by its accessible label. */
export async function selectDeck(page: Page, deckName: string): Promise<void> {
  await page.getByRole("button", { name: `Select deck ${deckName}` }).click();
  await expect(
    page.getByRole("region", { name: new RegExp(`Practice ${escapeRegExp(deckName)}`, "i") }),
  ).toBeVisible();
}

export async function openMode(page: Page, mode: string): Promise<void> {
  await page
    .getByRole("region", { name: /^Practice /i })
    .getByRole("link", { name: mode })
    .click();
  await expect(page.getByRole("navigation", { name: "Practice modes" })).toBeVisible();
}

/** Write content to a temp file and return its path (for import tests). */
export function tempFile(name: string, contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), "vocabdeck-e2e-"));
  const path = join(dir, name);
  writeFileSync(path, contents, "utf8");
  return path;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Anchored regex for exact text matching (substring matches collide: ami/amour). */
export function exactText(value: string): RegExp {
  return new RegExp(`^${escapeRegExp(value.trim())}$`);
}
