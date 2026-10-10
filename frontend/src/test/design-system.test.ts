/**
 * Design-system regression guards: the reference-derived tokens and the
 * neo-brutalist conventions (hard borders, offset shadows, square corners)
 * must stay in the stylesheets.
 */

import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const tokens = readFileSync(resolve(process.cwd(), "src/styles/tokens.css"), "utf8");
const components = readFileSync(resolve(process.cwd(), "src/styles/components.css"), "utf8");
const global = readFileSync(resolve(process.cwd(), "src/styles/global.css"), "utf8");

test("tokens define the reference palette, dot grid and hard shadows", () => {
  expect(tokens).toMatch(/--accent: #00ff00/);
  expect(tokens).toMatch(/--paper: #f4f0e4/);
  expect(tokens).toMatch(/--paper-raised: #fffff0/);
  expect(tokens).toMatch(/--border: #141414/);
  expect(tokens).toMatch(/--dot-color:/);
  expect(tokens).toMatch(/--shadow-2: 4px 4px 0 var\(--border\)/);
  expect(tokens).toMatch(/--radius-s: 0px/);
});

test("typography stack covers accented Latin and Japanese text", () => {
  expect(tokens).toMatch(/Space Mono/);
  expect(tokens).toMatch(/Noto Sans Mono JP/);
});

test("components use mono uppercase labels and square geometry", () => {
  expect(components).toMatch(/text-transform: uppercase/);
  expect(components).toMatch(/letter-spacing: var\(--tracking-label\)/);
  expect(components).not.toMatch(/border-radius: 999px/);
});

test("focus is visible on every surface (black outline + green halo)", () => {
  expect(global).toMatch(/:focus-visible/);
  expect(global).toMatch(/outline: 2px solid var\(--border\)/);
  expect(global).toMatch(/box-shadow: 0 0 0 5px var\(--focus-ring\)/);
});

test("quiz and matching feedback states are defined", () => {
  expect(components).toMatch(/\.option-correct/);
  expect(components).toMatch(/\.option-incorrect/);
  expect(components).toMatch(/\.match-item\.is-complete/);
});
