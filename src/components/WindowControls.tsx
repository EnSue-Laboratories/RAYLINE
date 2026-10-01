import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { Minus, Square, X } from "lucide-react";
import { NO_DRAG } from "../utils/appRegion";

const IDLE_COLOR = "rgba(255,255,255,0.45)";

const buttonBaseStyle: CSSProperties = {
  width: 30,
  height: 24,
  borderRadius: 7,
  border: "none",
  background: "none",
  color: IDLE_COLOR,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  transition: "background .15s ease, color .15s ease",
  padding: 0,
  ...NO_DRAG,
};

type WindowAction = "minimize" | "maximize" | "close";

interface WindowBridge {
  windowMinimize: () => Promise<boolean>;
  windowToggleMaximize: () => Promise<boolean>;
  windowClose: () => Promise<boolean>;
}

/** `window.api` (main / terminal windows) or `window.ghApi` (Project Manager); absent in plain vite dev. */
function getBridge(): Partial<WindowBridge> | null {
  const api: Partial<WindowBridge> | undefined = window.api;
  const ghApi: Partial<WindowBridge> | undefined = window.ghApi;
  return api || ghApi || null;
}

function setHoverStyle(target: HTMLElement, role: WindowAction, hovered: boolean) {
  if (!hovered) {
    target.style.background = "none";
    target.style.color = IDLE_COLOR;
  } else if (role === "close") {
    target.style.background = "rgba(228,76,76,0.18)";
    target.style.color = "rgba(228,76,76,0.95)";
  } else {
    target.style.background = "rgba(255,255,255,0.08)";
    target.style.color = "rgba(255,255,255,0.9)";
  }
}

// Windows keeps a top-level drag region across the header. Cancelling
// pointer-down keeps the buttons from being treated as drag targets, so the
// click reaches the IPC handler.
function stopMouseDown(event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
}

export interface WindowControlsProps {
  /** Shown on Windows / Linux (custom title bar). */
  visible?: boolean;
}

/** Minimize / maximize / close buttons for frameless windows. */
export default function WindowControls({ visible = false }: WindowControlsProps) {
  if (!visible) return null;

  const bridge = getBridge();
  const minimize = bridge?.windowMinimize;
  const toggleMaximize = bridge?.windowToggleMaximize;
  const close = bridge?.windowClose;
  if (!minimize || !toggleMaximize || !close) return null;

  const buttons: { role: WindowAction; label: string; title: string; action: () => Promise<boolean>; icon: ReactNode }[] = [
    { role: "minimize", label: "Minimize window", title: "Minimize", action: minimize, icon: <Minus size={14} strokeWidth={1.9} /> },
    { role: "maximize", label: "Maximize window", title: "Maximize", action: toggleMaximize, icon: <Square size={12} strokeWidth={1.8} /> },
    { role: "close", label: "Close window", title: "Close", action: close, icon: <X size={14} strokeWidth={1.9} /> },
  ];

  return (
    <div style={{ position: "fixed", top: 12, right: 12, display: "flex", gap: 6, zIndex: 140, ...NO_DRAG }}>
      {buttons.map(({ role, label, title, action, icon }) => (
        <button
          key={role}
          aria-label={label}
          title={title}
          onMouseDown={stopMouseDown}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void action();
          }}
          style={buttonBaseStyle}
          onMouseEnter={(event) => setHoverStyle(event.currentTarget, role, true)}
          onMouseLeave={(event) => setHoverStyle(event.currentTarget, role, false)}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}
