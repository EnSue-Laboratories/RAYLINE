import { useCallback, useRef, useSyncExternalStore } from "react";

/**
 * Minimal external store (zustand-vanilla-shaped) for state that many
 * components read but few should re-render for. Components subscribe through
 * `useStore(store, selector)` and only re-render when their slice changes.
 *
 * Rules:
 * - State is immutable; `setState` must produce a new object to notify.
 * - Event handlers read `store.getState()` instead of closing over render data.
 */
export interface Store<S> {
  readonly getState: () => S;
  readonly setState: (next: S | ((prev: S) => S)) => void;
  readonly subscribe: (listener: () => void) => () => void;
}

export type EqualityFn<T> = (a: T, b: T) => boolean;

export function createStore<S>(initial: S): Store<S> {
  let state = initial;
  const listeners = new Set<() => void>();

  return {
    getState: () => state,
    setState: (next) => {
      const resolved = typeof next === "function" ? (next as (prev: S) => S)(state) : next;
      if (Object.is(resolved, state)) return;
      state = resolved;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/**
 * Subscribe to a derived slice of a store. The selected value is memoized per
 * state snapshot and compared with `isEqual`, so selectors may return fresh
 * objects/arrays (pair them with `shallowEqual`) without render loops.
 */
export function useStore<S, T>(
  store: Store<S>,
  selector: (state: S) => T,
  isEqual: EqualityFn<T> = Object.is,
): T {
  // Keyed on (state, selector): inline selectors are fine — a new selector
  // recomputes, and `isEqual` keeps the previous result's identity.
  const cache = useRef<{ state: S; selector: (state: S) => T; selected: T } | null>(null);

  const getSnapshot = useCallback((): T => {
    const state = store.getState();
    const cached = cache.current;
    if (cached && Object.is(cached.state, state) && cached.selector === selector) return cached.selected;
    const next = selector(state);
    const selected = cached && isEqual(cached.selected, next) ? cached.selected : next;
    cache.current = { state, selector, selected };
    return selected;
  }, [store, selector, isEqual]);

  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

/** One-level structural equality for plain objects and arrays. */
export function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => Object.is(item, b[i]));
  }
  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const aKeys = Object.keys(aRecord);
  if (aKeys.length !== Object.keys(bRecord).length) return false;
  return aKeys.every((key) => Object.hasOwn(bRecord, key) && Object.is(aRecord[key], bRecord[key]));
}
