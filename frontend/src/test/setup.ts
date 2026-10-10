import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom has no matchMedia; provide a controllable stub for responsive tests.
const listeners = new Set<(event: MediaQueryListEvent) => void>();
let currentMatches = false;

class MatchMediaStub implements MediaQueryList {
  media: string;
  onchange: ((this: MediaQueryList, ev: MediaQueryListEvent) => unknown) | null = null;

  constructor(media: string) {
    this.media = media;
  }

  get matches(): boolean {
    return currentMatches;
  }

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    _options?: boolean | AddEventListenerOptions,
  ): void {
    if (type === "change") {
      listeners.add(listener as unknown as (event: MediaQueryListEvent) => void);
    }
  }

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    _options?: boolean | EventListenerOptions,
  ): void {
    if (type === "change") {
      listeners.delete(listener as unknown as (event: MediaQueryListEvent) => void);
    }
  }

  addListener(listener: (ev: MediaQueryListEvent) => void): void {
    listeners.add(listener);
  }

  removeListener(listener: (ev: MediaQueryListEvent) => void): void {
    listeners.delete(listener);
  }

  dispatchEvent(event: Event): boolean {
    return Boolean(event);
  }
}

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => new MatchMediaStub(query),
});

/** Switch the stubbed viewport between compact (<=640px) and wide. */
export function setCompactViewport(compact: boolean): void {
  currentMatches = compact;
  const event = { matches: compact } as MediaQueryListEvent;
  listeners.forEach((listener) => listener(event));
}

beforeEach(() => {
  currentMatches = false;
  listeners.clear();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
