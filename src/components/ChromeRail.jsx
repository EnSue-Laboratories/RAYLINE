import { PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import HoverIconButton from "./HoverIconButton";
import { CHROME_RAIL_BUTTON_SIZE, CHROME_RAIL_GAP, CHROME_RAIL_LEFT, CHROME_RAIL_TOP } from "../windowChrome";

export default function ChromeRail({ sidebarOpen, onToggleSidebar, onNew, showNewButton = false }) {
  const buttonStyle = {
    width: CHROME_RAIL_BUTTON_SIZE,
    height: CHROME_RAIL_BUTTON_SIZE,
    borderRadius: 7,
    background: "rgba(10,10,12,0.24)",
    backdropFilter: "blur(10px)",
    border: "1px solid rgba(255,255,255,0.06)",
    boxShadow: "0 6px 18px rgba(0,0,0,0.18)",
    WebkitAppRegion: "no-drag",
    pointerEvents: "auto",
  };

  return (
    <div
      style={{
        position: "fixed",
        top: CHROME_RAIL_TOP,
        left: CHROME_RAIL_LEFT,
        display: "flex",
        alignItems: "center",
        gap: CHROME_RAIL_GAP,
        zIndex: 60,
        WebkitAppRegion: "no-drag",
        pointerEvents: "auto",
      }}
    >
      <HoverIconButton
        tooltip={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        ariaLabel={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        onClick={onToggleSidebar}
        style={buttonStyle}
      >
        {sidebarOpen ? <PanelLeftClose size={15} strokeWidth={1.5} /> : <PanelLeftOpen size={15} strokeWidth={1.5} />}
      </HoverIconButton>

      {showNewButton ? (
        <HoverIconButton
          tooltip="New chat"
          ariaLabel="New chat"
          onClick={onNew}
          style={buttonStyle}
        >
          <Plus size={15} strokeWidth={1.5} />
        </HoverIconButton>
      ) : null}
    </div>
  );
}
