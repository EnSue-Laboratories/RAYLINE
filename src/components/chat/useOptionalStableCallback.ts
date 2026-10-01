import { useStableCallback } from "../../hooks/useStableCallback";

/**
 * `useStableCallback` for optional handlers: a permanent proxy while `fn` is
 * provided, `undefined` otherwise (presence still toggles UI, e.g. the edit
 * button), so parent handler churn never re-renders memoized children.
 */
export function useOptionalStableCallback<Args extends unknown[], R>(fn: ((...args: Args) => R) | undefined): ((...args: Args) => R | undefined) | undefined {
  const stable = useStableCallback((...args: Args): R | undefined => fn?.(...args));
  return fn ? stable : undefined;
}
