import { useCallback, useEffect, useRef, useState } from "react";

/** A key that is "on" for `durationMs` after `flash(key)` (e.g. a copied badge). */
export function useFlashKey(durationMs = 1500): [string | null, (key: string) => void] {
  const [active, setActive] = useState<string | null>(null);
  const timers = useRef(new Set<number>());

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const flash = useCallback((key: string) => {
    setActive(key);
    const timer = window.setTimeout(() => {
      timers.current.delete(timer);
      setActive((current) => (current === key ? null : current));
    }, durationMs);
    timers.current.add(timer);
  }, [durationMs]);

  return [active, flash];
}
