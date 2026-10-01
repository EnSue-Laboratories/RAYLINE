import { forwardRef, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { FloatingMenuLayout } from "./floatingMenu";
import { SHEET_BG } from "./styles";

export interface FloatingSheetProps {
  layout: FloatingMenuLayout;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  /** Cap the height (lists); input-only sheets size to content. */
  limitHeight?: boolean;
  children: ReactNode;
}

/**
 * Portal panel for the new-chat dropdowns. Escape closes it and returns
 * focus to the anchor's button; pointer events don't leak to the card.
 */
const FloatingSheet = forwardRef<HTMLDivElement, FloatingSheetProps>(function FloatingSheet(
  { layout, anchorRef, onClose, limitHeight = true, children },
  ref,
) {
  const style: CSSProperties = {
    position: "fixed",
    top: layout.top,
    left: layout.left,
    zIndex: 500,
    width: layout.width,
    maxHeight: limitHeight ? layout.maxHeight : undefined,
    background: SHEET_BG,
    backdropFilter: "blur(48px) saturate(1.2)",
    border: "1px solid var(--pane-border)",
    borderRadius: 10,
    padding: 3,
    boxShadow: "var(--shadow-md)",
    animation: "dropIn .15s ease",
    WebkitAppRegion: "no-drag",
    display: "flex",
    flexDirection: "column",
  };
  return createPortal(
    <div
      ref={ref}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.nativeEvent.isComposing) {
          event.preventDefault();
          event.stopPropagation();
          onClose();
          anchorRef.current?.querySelector("button")?.focus();
        }
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      style={style}
    >
      {children}
    </div>,
    document.body,
  );
});

export default FloatingSheet;
