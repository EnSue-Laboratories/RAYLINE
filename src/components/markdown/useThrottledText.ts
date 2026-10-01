import { useEffect, useRef, useState } from "react";

/** Above this size the streaming tail re-parses at most every TAIL_THROTTLE_MS. */
export const LARGE_TAIL_CHARS = 8 * 1024;
export const TAIL_THROTTLE_MS = 100;

/**
 * Latest `text`, but while `throttle` is on it updates at most every
 * `intervalMs` (trailing edge, so the final value always lands).
 */
export function useThrottledText(text: string, throttle: boolean, intervalMs = TAIL_THROTTLE_MS): string {
  const [shown, setShown] = useState(text);
  const shownAtRef = useRef(0);
  // Unthrottled: track `text` directly (render-phase sync, no extra commit).
  if (!throttle && shown !== text) setShown(text);
  useEffect(() => {
    if (!throttle || shown === text) return undefined;
    const wait = Math.max(0, shownAtRef.current + intervalMs - performance.now());
    const timer = window.setTimeout(() => {
      shownAtRef.current = performance.now();
      setShown(text);
    }, wait);
    return () => window.clearTimeout(timer);
  }, [text, throttle, shown, intervalMs]);
  return throttle ? shown : text;
}
