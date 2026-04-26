import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen, Plus, Settings } from "lucide-react";
import { WINDOW_DRAG_HEIGHT } from "../windowChrome";

const BTN_SIZE = 28;

const SIDEBAR_WIDTH = 220;

function WinBtn({ label, onClick, active = false, children }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      onMouseDownCapture={(e) => e.stopPropagation()}
      onPointerDownCapture={(e) => e.stopPropagation()}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: BTN_SIZE,
        height: BTN_SIZE,
        display: "flex", alignItems: "center", justifyContent: "center",
        border: "none", borderRadius: 6, padding: 0, cursor: "pointer",
        background: active ? "rgba(255,255,255,0.055)" : hov ? "rgba(255,255,255,0.07)" : "transparent",
        color: hov || active ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.42)",
        transition: "background .15s, color .15s",
        WebkitAppRegion: "no-drag",
        userSelect: "none",
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

export default function SidebarWindowsHeader({
  sidebarOpen,
  settingsOpen,
  onToggleSidebar,
  onNew,
  onOpenSettings,
  hasUpdate = false,
}) {
  return (
    <div
      onMouseDownCapture={(e) => e.stopPropagation()}
      onPointerDownCapture={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: SIDEBAR_WIDTH,
        height: WINDOW_DRAG_HEIGHT,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        paddingLeft: 18,
        paddingRight: 6,
        WebkitAppRegion: "drag",
        userSelect: "none",
        pointerEvents: "auto",
      }}
    >
      {/* Logo — fixed anchor replacing Mac traffic lights */}
      <button
        onClick={() => window.open("https://ensuechat.com")}
        title="RayLine"
        onMouseDownCapture={(e) => e.stopPropagation()}
        onPointerDownCapture={(e) => e.stopPropagation()}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: 0, background: "none", border: "none", cursor: "pointer",
          opacity: 0.82, transition: "opacity .15s",
          WebkitAppRegion: "no-drag",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.82"; }}
      >
        <img
          src={`${import.meta.env.BASE_URL}favicon.svg`}
          style={{ width: 22, height: 22, borderRadius: 5, display: "block", flexShrink: 0 }}
          draggable={false}
        />
        <span style={{
          fontFamily: "'Barlow Condensed', 'Inter Tight', sans-serif",
          fontWeight: 600, fontSize: 18, letterSpacing: "0.12em",
          color: "rgba(218,218,222,0.95)", userSelect: "none", lineHeight: 1,
        }}>
          R<span style={{ color: "#FF4422", letterSpacing: 0 }}>/</span>YLINE
          <span style={{ color: "#FF4422", letterSpacing: 0 }}>.</span>
        </span>
      </button>

      {/* 三个按钮紧凑排列，整体与 logo 保持距离 */}
      <div style={{ display: "flex", alignItems: "center", gap: 2, marginLeft: 16 }}>

      {/* Expand / Collapse */}
      <WinBtn
        label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        onClick={onToggleSidebar}
      >
        {sidebarOpen
          ? <PanelLeftClose size={15} strokeWidth={1.55} />
          : <PanelLeftOpen size={15} strokeWidth={1.55} />}
      </WinBtn>

      {/* New chat */}
      <WinBtn label="New chat" onClick={onNew}>
        <Plus size={15} strokeWidth={1.6} />
      </WinBtn>

      {/* Settings */}
      <div style={{ position: "relative" }}>
        <WinBtn
          label={settingsOpen ? "Close settings" : "Settings"}
          onClick={onOpenSettings}
          active={settingsOpen}
        >
          <Settings size={14} strokeWidth={1.55} />
        </WinBtn>
        {hasUpdate && (
          <span style={{
            position: "absolute", top: 4, right: 4,
            width: 6, height: 6, borderRadius: "50%",
            background: "#FF8C42", boxShadow: "0 0 4px rgba(255,140,66,0.7)",
            pointerEvents: "none",
          }} />
        )}
      </div>

      </div>{/* end button group */}
    </div>
  );
}
