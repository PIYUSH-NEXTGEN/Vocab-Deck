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
const motion = readFileSync(resolve(process.cwd(), "src/styles/motion.css"), "utf8");

test("tokens define the calm blue accent, dot grid and hard shadows", () => {
  expect(tokens).toMatch(/--accent: #8bbde4/);
  expect(tokens).toMatch(/--accent-deep: #245d94/);
  expect(tokens).toMatch(/--paper: #f4f0e4/);
  expect(tokens).toMatch(/--paper-raised: #fffff0/);
  expect(tokens).toMatch(/--border: #141414/);
  expect(tokens).toMatch(/--dot-color:/);
  expect(tokens).toMatch(/--shadow-2: 4px 4px 0 var\(--border\)/);
  expect(tokens).toMatch(/--radius-s: 0px/);
});

test("one mono family, no pixel or dotted display faces", () => {
  expect(tokens).toMatch(/--font-mono: "Space Mono"/);
  expect(tokens).toMatch(/--font-display: var\(--font-mono\)/);
  expect(tokens).not.toMatch(/Doto|Silkscreen|Pixelify/);
});

test("the type scale is the documented set of tokens", () => {
  for (const token of [
    "--text-hero:",
    "--text-heading:",
    "--text-section:",
    "--text-word:",
    "--text-subheading:",
    "--text-body:",
  ]) {
    expect(tokens).toContain(token);
  }
  // No ad-hoc sizes outside the scale.
  for (const css of [components, global]) {
    expect(css).not.toMatch(/--text-(xs|s|l|xl|2xl|m)[:\s)]/);
  }
});

test("chrome stays square while navigation uses rounded pills", () => {
  expect(components).toMatch(/text-transform: uppercase/);
  expect(components).toMatch(/letter-spacing: var\(--tracking-label\)/);
  // Panels, buttons and answer options stay square...
  expect(components).toMatch(/\.panel \{[^}]*border-radius: var\(--radius-m\)/);
  expect(components).toMatch(/\.btn \{[^}]*border-radius: var\(--radius-s\)/);
  expect(components).toMatch(/\.option \{[^}]*border-radius: var\(--radius-s\)/);
  // ...while the navbar and its actions are rounded pills.
  expect(components).toMatch(/\.app-nav-floating \{[^}]*border-radius: 999px/);
  expect(components).toMatch(/\.nav-link \{[^}]*border-radius: 999px/);
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

test("every CSS variable used in the stylesheets is defined", () => {
  const defined = new Set(
    Array.from(tokens.matchAll(/--[\w-]+(?=\s*:)/g)).map((match) => match[0]),
  );
  const used = new Set<string>();
  for (const css of [components, global, motion]) {
    for (const match of css.matchAll(/var\((--[\w-]+)[,)]/g)) {
      used.add(match[1]);
    }
  }
  const missing = [...used].filter((name) => !defined.has(name));
  expect(missing).toEqual([]);
});
