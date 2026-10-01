import { useSyncExternalStore } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export interface WindowActivity {
  isVisible: boolean;
  isFocused: boolean;
  prefersReducedMotion: boolean;
}

function getReducedMotionQuery(): MediaQueryList | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(REDUCED_MOTION_QUERY)
    : null;
}

function readWindowActivity(): WindowActivity {
  const isVisible = typeof document === "undefined" ? true : !document.hidden;
  const isFocused = typeof document === "undefined" ? true : document.hasFocus();
  const prefersReducedMotion = getReducedMotionQuery()?.matches ?? false;
  return { isVisible, isFocused, prefersReducedMotion };
}

// One shared snapshot + one set of DOM listeners for every consumer.
let snapshot: WindowActivity | null = null;
const listeners = new Set<() => void>();
let detach: (() => void) | null = null;

function getSnapshot(): WindowActivity {
  snapshot ??= readWindowActivity();
  return snapshot;
}

function sync(): void {
  const next = readWindowActivity();
  const prev = snapshot;
  if (
    prev &&
    prev.isVisible === next.isVisible &&
    prev.isFocused === next.isFocused &&
    prev.prefersReducedMotion === next.prefersReducedMotion
  ) {
    return;
  }
  snapshot = next;
  for (const listener of listeners) listener();
}

function attach(): () => void {
  const media = getReducedMotionQuery();
  document.addEventListener("visibilitychange", sync);
  window.addEventListener("focus", sync);
  window.addEventListener("blur", sync);
  media?.addEventListener("change", sync);
  return () => {
    document.removeEventListener("visibilitychange", sync);
    window.removeEventListener("focus", sync);
    window.removeEventListener("blur", sync);
    media?.removeEventListener("change", sync);
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!detach && typeof window !== "undefined") {
    detach = attach();
    sync();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && detach) {
      detach();
      detach = null;
      snapshot = null;
    }
  };
}

/** Window visibility / focus / reduced-motion, shared across all subscribers. */
export default function useWindowActivity(): WindowActivity {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function getReducedMotionSnapshot(): boolean {
  return getSnapshot().prefersReducedMotion;
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getReducedMotionSnapshot, getReducedMotionSnapshot);
}
