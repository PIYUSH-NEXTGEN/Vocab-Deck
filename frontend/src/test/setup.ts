import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { clearApiCache } from "../api/client";

// jsdom has no matchMedia; provide controllable stubs for responsive and
// reduced-motion tests.
const COMPACT_QUERY = "(max-width: 640px)";
const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

const listeners = new Map<string, Set<(event: MediaQueryListEvent) => void>>();
let compactMatches = false;
let reducedMotionMatches = false;

function matchesFor(media: string): boolean {
  return media.includes("prefers-reduced-motion") ? reducedMotionMatches : compactMatches;
}

class MatchMediaStub implements MediaQueryList {
  readonly media: string;
  onchange: ((this: MediaQueryList, ev: MediaQueryListEvent) => unknown) | null = null;

  constructor(media: string) {
    this.media = media;
  }

  get matches(): boolean {
    return matchesFor(this.media);
  }

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    _options?: boolean | AddEventListenerOptions,
  ): void {
    if (type !== "change") return;
    const set = listeners.get(this.media) ?? new Set();
    set.add(listener as unknown as (event: MediaQueryListEvent) => void);
    listeners.set(this.media, set);
  }

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    _options?: boolean | EventListenerOptions,
  ): void {
    if (type !== "change") return;
    listeners.get(this.media)?.delete(listener as unknown as (event: MediaQueryListEvent) => void);
  }

  addListener(listener: (ev: MediaQueryListEvent) => void): void {
    this.addEventListener("change", listener as unknown as EventListener);
  }

  removeListener(listener: (ev: MediaQueryListEvent) => void): void {
    this.removeEventListener("change", listener as unknown as EventListener);
  }

  dispatchEvent(event: Event): boolean {
    return Boolean(event);
  }
}

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => new MatchMediaStub(query),
});

function emit(media: string): void {
  const set = listeners.get(media);
  if (!set) return;
  const event = { matches: matchesFor(media), media } as MediaQueryListEvent;
  set.forEach((listener) => listener(event));
}

/** Switch the stubbed viewport between compact (<=640px) and wide. */
export function setCompactViewport(compact: boolean): void {
  compactMatches = compact;
  emit(COMPACT_QUERY);
}

/** Switch the stubbed prefers-reduced-motion preference. */
export function setReducedMotion(reduced: boolean): void {
  reducedMotionMatches = reduced;
  emit(REDUCED_QUERY);
}

beforeEach(() => {
  compactMatches = false;
  reducedMotionMatches = false;
  listeners.clear();
  window.localStorage.clear();
  clearApiCache();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
