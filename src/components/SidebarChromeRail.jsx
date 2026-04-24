import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen, Plus, Settings } from "lucide-react";
import {
  SIDEBAR_CHROME_RAIL_HEIGHT,
  SIDEBAR_CHROME_RAIL_LEFT,
  SIDEBAR_CHROME_RAIL_TOP,
  SIDEBAR_CHROME_RAIL_WIDTH,
} from "../windowChrome";

function RailButton({ label, onClick, active = false, visible = true, children }) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      aria-label={label}
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      title={label}
      onClick={onClick}
      onMouseDownCapture={(event) => event.stopPropagation()}
      onPointerDownCapture={(event) => event.stopPropagation()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 28,
        height: 26,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "none",
        borderRadius: 7,
        background: active
          ? "rgba(255,255,255,0.055)"
          : hovered
            ? "rgba(255,255,255,0.07)"
            : "transparent",
        color: hovered || active ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.42)",
        cursor: "pointer",
        padding: 0,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(-2px)",
        transition: "background .16s ease, color .16s ease, opacity .14s ease, transform .14s ease",
        pointerEvents: visible ? "auto" : "none",
        WebkitAppRegion: "no-drag",
        userSelect: "none",
      }}
    >
      <span
        style={{
          display: "flex",
          pointerEvents: "none",
          WebkitAppRegion: "no-drag",
        }}
      >
        {children}
      </span>
    </button>
  );
}

export default function SidebarChromeRail({ sidebarOpen, settingsOpen, controlsOnHover = false, onToggleSidebar, onNew, onOpenSettings }) {
  const [railHovered, setRailHovered] = useState(false);
  const controlsVisible = !controlsOnHover || railHovered;

  return (
    <div
      aria-label="Window controls"
      onMouseEnter={() => setRailHovered(true)}
      onMouseLeave={() => setRailHovered(false)}
      style={{
        position: "fixed",
        top: SIDEBAR_CHROME_RAIL_TOP,
        left: SIDEBAR_CHROME_RAIL_LEFT,
        zIndex: 1000,
        width: SIDEBAR_CHROME_RAIL_WIDTH,
        height: SIDEBAR_CHROME_RAIL_HEIGHT,
        display: "flex",
        alignItems: "right",
        justifyContent: "right",
        gap: 0.1,
        pointerEvents: controlsOnHover ? "auto" : "none",
        WebkitAppRegion: "no-drag",
        userSelect: "none",
        isolation: "isolate",
      }}
      onMouseDownCapture={(event) => event.stopPropagation()}
      onPointerDownCapture={(event) => event.stopPropagation()}
    >
      <RailButton
        label={sidebarOpen ? "Collapse sidebar" : "Open sidebar"}
        onClick={onToggleSidebar}
        visible={controlsVisible}
      >
        {sidebarOpen ? (
          <PanelLeftClose size={15} strokeWidth={1.55} />
        ) : (
          <PanelLeftOpen size={15} strokeWidth={1.55} />
        )}
      </RailButton>

      <RailButton label="New chat" onClick={onNew} visible={controlsVisible}>
        <Plus size={15} strokeWidth={1.6} />
      </RailButton>

      <RailButton label={settingsOpen ? "Close settings" : "Settings"} onClick={onOpenSettings} active={settingsOpen} visible={controlsVisible}>
        <Settings size={14} strokeWidth={1.55} />
      </RailButton>
    </div>
  );
}
