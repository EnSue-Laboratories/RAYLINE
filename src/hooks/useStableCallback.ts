import { useCallback, useInsertionEffect, useRef } from "react";

/**
 * Returns a function whose identity never changes but always calls the latest
 * `fn`. Use for handlers passed to memoized children so prop identity doesn't
 * churn on every render. Don't call the result during render.
 */
export function useStableCallback<Args extends unknown[], R>(fn: (...args: Args) => R): (...args: Args) => R {
  const ref = useRef(fn);
  useInsertionEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: Args) => ref.current(...args), []);
}
