import { useEffect } from "react";

// Capture Escape before a parent screen handles it, even when focus remains
// on a trigger outside the portal. Only one popover is opened at a time.
export default function useDismissibleLayer(open, anchorRef, layerRef, onClose) {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event) => {
      if (anchorRef.current?.contains(event.target) || layerRef.current?.contains(event.target)) return;
      onClose();
    };
    const onKeyDown = (event) => {
      if (event.defaultPrevented || event.key !== "Escape" || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
      const anchor = anchorRef.current;
      (anchor?.matches("button") ? anchor : anchor?.querySelector("button"))?.focus();
    };
    const onNavigation = () => onClose();
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("rayline:close-menus", onNavigation);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("rayline:close-menus", onNavigation);
    };
  }, [open, anchorRef, layerRef, onClose]);
}
