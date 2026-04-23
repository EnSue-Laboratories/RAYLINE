import { useEffect, useState } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function readWindowActivity() {
  const isVisible = typeof document === "undefined" ? true : !document.hidden;
  const isFocused = typeof document === "undefined" ? true : (document.hasFocus?.() ?? true);
  const prefersReducedMotion = typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(REDUCED_MOTION_QUERY).matches
    : false;

  return {
    isVisible,
    isFocused,
    prefersReducedMotion,
  };
}

export default function useWindowActivity() {
  const [activity, setActivity] = useState(readWindowActivity);

  useEffect(() => {
    const media = typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(REDUCED_MOTION_QUERY)
      : null;
    const sync = () => setActivity(readWindowActivity());

    sync();
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    window.addEventListener("blur", sync);

    if (media?.addEventListener) {
      media.addEventListener("change", sync);
    } else if (media?.addListener) {
      media.addListener(sync);
    }

    return () => {
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener("blur", sync);

      if (media?.removeEventListener) {
        media.removeEventListener("change", sync);
      } else if (media?.removeListener) {
        media.removeListener(sync);
      }
    };
  }, []);

  return activity;
}
