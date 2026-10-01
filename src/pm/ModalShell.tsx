import type { CSSProperties, ReactNode } from "react";
import { X } from "lucide-react";
import { modalBackdropStyle, modalCloseButtonStyle, modalPanelStyle } from "./styles";

interface ModalShellProps {
  title: ReactNode;
  onClose: () => void;
  width: number;
  children: ReactNode;
  /** Extra panel styles (shadow, max height, font). */
  panelStyle?: CSSProperties;
  headerBorder?: string;
}

/** Backdrop (click to close) + elevated panel with a title row and close button. */
export default function ModalShell({ title, onClose, width, children, panelStyle, headerBorder = "1px solid var(--control-bg)" }: ModalShellProps) {
  return (
    <div onClick={onClose} style={modalBackdropStyle}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...modalPanelStyle,
          width,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          ...panelStyle,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: headerBorder,
            flexShrink: 0,
          }}
        >
          {title}
          <button onClick={onClose} style={modalCloseButtonStyle}>
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
