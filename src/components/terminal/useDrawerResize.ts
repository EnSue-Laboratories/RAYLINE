import { useCallback, useRef, useState, type PointerEvent } from "react";

const MIN_WIDTH = 280;
/** Space kept free for the chat pane when dragging the drawer wider. */
const RESERVED_MAIN_WIDTH = 400;

export function clampDrawerWidth(width: number, viewportWidth: number): number {
  return Math.min(Math.max(width, MIN_WIDTH), viewportWidth - RESERVED_MAIN_WIDTH);
}

export interface DrawerResize {
  width: number;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
}

/** Pointer-captured drag on the drawer's left edge. */
export function useDrawerResize(initialWidth = 480): DrawerResize {
  const [width, setWidth] = useState(initialWidth);
  const widthRef = useRef(initialWidth);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(initialWidth);

  const onPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragging.current = true;
    startX.current = event.clientX;
    startWidth.current = widthRef.current;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const onPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const next = clampDrawerWidth(startWidth.current + (startX.current - event.clientX), window.innerWidth);
    widthRef.current = next;
    setWidth(next);
  }, []);

  const onPointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  return { width, onPointerDown, onPointerMove, onPointerUp };
}
