import { useCallback, useLayoutEffect, useState, type RefObject } from "react";
import { getFloatingMenuLayout, type FloatingMenuLayout } from "./floatingMenu";

/** Tracks a dropdown's fixed position next to `anchorRef` (resize, scroll, anchor resize). */
export function useFloatingLayout(
  anchorRef: RefObject<HTMLElement | null>,
  preferredWidth: number,
  preferredMaxHeight: number,
): FloatingMenuLayout | null {
  const [layout, setLayout] = useState<FloatingMenuLayout | null>(null);

  const update = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    setLayout(getFloatingMenuLayout(rect, preferredWidth, preferredMaxHeight, {
      width: window.innerWidth,
      height: window.innerHeight,
    }));
  }, [anchorRef, preferredWidth, preferredMaxHeight]);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    // ResizeObserver reports the initial size right away, which also places
    // the menu before the first paint of its content.
    const observer = new ResizeObserver(update);
    observer.observe(anchor);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchorRef, update]);

  return layout;
}
