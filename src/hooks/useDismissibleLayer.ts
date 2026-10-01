import { type RefObject, useEffect } from "react";

/** Dispatch on window to close every open popover (e.g. on navigation). */
export const CLOSE_MENUS_EVENT = "rayline:close-menus";

/**
 * Closes a popover on outside pointer-down, Escape, or CLOSE_MENUS_EVENT.
 * Escape is captured before parent screens handle it (layered Escape), even
 * when focus stays on a trigger outside the portal; focus returns to the
 * anchor's button. Ported from #230.
 */
export function useDismissibleLayer(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  layerRef: RefObject<HTMLElement | null>,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!open) return undefined;
    const isInside = (target: EventTarget | null): boolean =>
      target instanceof Node && Boolean(anchorRef.current?.contains(target) || layerRef.current?.contains(target));

    const onPointerDown = (event: PointerEvent): void => {
      if (!isInside(event.target)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.key !== "Escape" || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
      const anchor = anchorRef.current;
      const button = anchor?.matches("button") ? anchor : anchor?.querySelector("button");
      button?.focus();
    };
    const onCloseAll = (): void => onClose();

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener(CLOSE_MENUS_EVENT, onCloseAll);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener(CLOSE_MENUS_EVENT, onCloseAll);
    };
  }, [open, anchorRef, layerRef, onClose]);
}

export default useDismissibleLayer;
