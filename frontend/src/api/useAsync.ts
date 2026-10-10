/**
 * Async resource hook: discriminated-union state so components can render
 * loading, error and success branches without ad-hoc flags.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type Resource<T> =
  | { status: "loading" }
  | { status: "error"; error: Error }
  | { status: "success"; data: T };

export interface UseAsyncOptions {
  /** Set false to defer loading (e.g. until required ids are known). */
  enabled?: boolean;
}

export function useAsync<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
  options: UseAsyncOptions = {},
): { state: Resource<T>; reload: () => void } {
  const enabled = options.enabled ?? true;
  const [state, setState] = useState<Resource<T>>({ status: "loading" });
  const [nonce, setNonce] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) {
      setState({ status: "loading" });
      return;
    }
    const controller = new AbortController();
    setState({ status: "loading" });
    loaderRef
      .current(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ status: "success", data });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const normalized =
          error instanceof Error ? error : new Error("Something went wrong.");
        setState({ status: "error", error: normalized });
      });
    return () => controller.abort();
  }, [enabled, nonce, ...deps]);

  return { state, reload };
}
