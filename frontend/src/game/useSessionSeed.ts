import { useCallback, useMemo, useState } from "react";
import { seededRng } from "./engine";
import type { Rng } from "./rng";

/**
 * A random seed per mount (one per play session), so the same deck is ordered
 * differently every time a mode is opened. `reshuffle` changes the order within
 * the session (play again, changing the round size) without touching scores.
 *
 * Tests pass an explicit `seed` for deterministic orders; production sessions
 * get a fresh random seed each time.
 */
export function useSessionSeed(seed?: number): { rng: Rng; reshuffle: () => void } {
  const sessionSeed = useMemo(() => Math.floor(Math.random() * 2 ** 31), []);
  const [revision, setRevision] = useState(0);

  const rng = useMemo<Rng>(
    () => seededRng((seed ?? sessionSeed) + revision),
    [seed, sessionSeed, revision],
  );
  const reshuffle = useCallback(() => setRevision((value) => value + 1), []);

  return { rng, reshuffle };
}
