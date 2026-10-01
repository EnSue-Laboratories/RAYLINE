import { useEffect, useState } from "react";

type IdleHandle = { kind: "idle"; id: number } | { kind: "timeout"; id: number };

function scheduleIdle(callback: () => void, timeout: number): IdleHandle {
  if (typeof window.requestIdleCallback === "function") {
    return { kind: "idle", id: window.requestIdleCallback(callback, { timeout }) };
  }
  return { kind: "timeout", id: window.setTimeout(callback, 1) };
}

function cancelIdle(handle: IdleHandle): void {
  if (handle.kind === "idle") window.cancelIdleCallback(handle.id);
  else window.clearTimeout(handle.id);
}

/**
 * False on the committing render, true once the browser is idle afterwards
 * (bounded by `timeout`). Lets expensive decoration (syntax highlighting) run
 * after the plain content has painted. Stays true once reached.
 */
export function useIdleReady(enabled: boolean, timeout = 500): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!enabled || ready) return undefined;
    const handle = scheduleIdle(() => setReady(true), timeout);
    return () => cancelIdle(handle);
  }, [enabled, ready, timeout]);
  return enabled && ready;
}
