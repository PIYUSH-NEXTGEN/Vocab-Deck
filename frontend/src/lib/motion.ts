/**
 * Motion utilities. Anime.js is used deliberately and sparingly: card flips are
 * CSS transforms, and these helpers add short feedback pulses/shakes or a
 * one-time rise for completion panels.
 *
 * Rules enforced here:
 * - Nothing animates when the user prefers reduced motion.
 * - Every animation is registered and paused on unmount.
 * - Animation failures are swallowed: feedback is decorative and must never
 *   break scoring or block interaction.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { animate } from "animejs";

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/** WAAPI is required by Anime.js; guard for environments without it. */
function canAnimate(): boolean {
  return (
    typeof Element !== "undefined" &&
    typeof Element.prototype.animate === "function" &&
    typeof window.requestAnimationFrame === "function"
  );
}

export interface AnimationInstance {
  pause(): void;
}

/** Tracks the reduced-motion setting, updating when the OS preference changes. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

/**
 * Registry of running animations; everything registered is paused on unmount so
 * mode switches never leave orphan timelines behind.
 */
export function useAnimationRegistry(): (animation: AnimationInstance | null) => void {
  const registry = useRef<AnimationInstance[]>([]);

  useEffect(
    () => () => {
      for (const animation of registry.current) {
        try {
          animation.pause();
        } catch {
          // pausing a finished animation is a no-op by design
        }
      }
      registry.current = [];
    },
    [],
  );

  return useCallback((animation: AnimationInstance | null) => {
    if (animation) registry.current.push(animation);
  }, []);
}

function run(
  target: HTMLElement | null | undefined,
  params: Parameters<typeof animate>[1],
): AnimationInstance | null {
  if (!target || prefersReducedMotion() || !canAnimate()) return null;
  try {
    return animate(target, params) as unknown as AnimationInstance;
  } catch {
    return null; // decorative only, never surface animation failures
  }
}

/** Brief scale pulse (correct answers, matched pairs). */
export function pulse(target: HTMLElement | null | undefined, scale = 1.05): AnimationInstance | null {
  return run(target, {
    scale: [1, scale, 1],
    duration: 340,
    ease: "outQuad",
  });
}

/** Short horizontal shake (incorrect answers, wrong pairs). */
export function shake(
  target: HTMLElement | null | undefined,
  distance = 5,
): AnimationInstance | null {
  return run(target, {
    translateX: [0, -distance, distance, -distance, distance, 0],
    duration: 360,
    ease: "outQuad",
  });
}

/** One-time rise + fade (completion panels). */
export function rise(
  target: HTMLElement | null | undefined,
  delay = 0,
): AnimationInstance | null {
  return run(target, {
    opacity: [0, 1],
    translateY: [10, 0],
    duration: 320,
    delay,
    ease: "outCubic",
  });
}

/** Small press/selection emphasis for matching tiles. */
export function pop(target: HTMLElement | null | undefined): AnimationInstance | null {
  return run(target, {
    scale: [1, 1.04, 1],
    duration: 220,
    ease: "outQuad",
  });
}
