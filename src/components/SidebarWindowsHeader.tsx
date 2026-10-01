import { useState, type ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen, Plus, Settings } from "lucide-react";
import { useTranslator } from "../contexts/LocaleContext";
import { WINDOW_DRAG_HEIGHT } from "../windowChrome";
import { DRAG, NO_DRAG } from "../utils/appRegion";

const BTN_SIZE = 28;
const SIDEBAR_WIDTH = 220;

interface WinBtnProps {
  label: string;
  onClick?: () => void;
  active?: boolean;
  children: ReactNode;
}

function WinBtn({ label, onClick, active = false, children }: WinBtnProps) {
  const [hov, setHov] = useState(false);
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      onMouseDownCapture={(e) => e.stopPropagation()}
      onPointerDownCapture={(e) => e.stopPropagation()}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: BTN_SIZE,
        height: BTN_SIZE,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "none",
        borderRadius: 6,
        padding: 0,
        cursor: "pointer",
        background: active ? "var(--control-bg-active)" : hov ? "var(--control-bg)" : "transparent",
        color: hov || active ? "var(--text-primary)" : "var(--text-secondary)",
        transition: "background .15s, color .15s",
        ...NO_DRAG,
        userSelect: "none",
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

export interface SidebarWindowsHeaderProps {
  sidebarOpen: boolean;
  settingsOpen: boolean;
  onToggleSidebar?: () => void;
  onNew?: () => void;
  onOpenSettings?: () => void;
  /** Shows an update dot on the settings button. */
  hasUpdate?: boolean;
}

/** Windows title-bar overlay above the sidebar: logo, sidebar toggle, new chat, settings. */
export default function SidebarWindowsHeader({
  sidebarOpen,
  settingsOpen,
  onToggleSidebar,
  onNew,
  onOpenSettings,
  hasUpdate = false,
}: SidebarWindowsHeaderProps) {
  const t = useTranslator();
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
        ...DRAG,
        userSelect: "none",
        pointerEvents: "auto",
      }}
    >
      {/* Logo — fixed anchor replacing the macOS traffic lights */}
      <button
        onClick={() => {
          window.open("https://ensuechat.com");
        }}
        title="RayLine"
        onMouseDownCapture={(e) => e.stopPropagation()}
        onPointerDownCapture={(e) => e.stopPropagation()}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: 0,
          background: "none",
          border: "none",
          cursor: "pointer",
          opacity: 0.82,
          transition: "opacity .15s",
          ...NO_DRAG,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.82"; }}
      >
        <img
          src={`${import.meta.env.BASE_URL}favicon.svg`}
          style={{ width: 22, height: 22, borderRadius: 5, display: "block", flexShrink: 0 }}
          draggable={false}
        />
        <span
          style={{
            fontFamily: "'Barlow Condensed', 'Inter Tight', sans-serif",
            fontWeight: 600,
            fontSize: 18,
            letterSpacing: "0.12em",
            color: "var(--text-primary)",
            userSelect: "none",
            lineHeight: 1,
          }}
        >
          R<span style={{ color: "var(--brand-logo-red, #FF4422)", letterSpacing: 0 }}>/</span>YLINE
          <span style={{ color: "var(--brand-logo-red, #FF4422)", letterSpacing: 0 }}>.</span>
        </span>
      </button>

      {/* Compact button group, spaced away from the logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 2, marginLeft: 16 }}>
        <WinBtn
          label={sidebarOpen ? t("chromeRail.collapseSidebar") : t("chromeRail.expandSidebar")}
          onClick={onToggleSidebar}
        >
          {sidebarOpen ? <PanelLeftClose size={15} strokeWidth={1.55} /> : <PanelLeftOpen size={15} strokeWidth={1.55} />}
        </WinBtn>

        <WinBtn label={t("chromeRail.newChat")} onClick={onNew}>
          <Plus size={15} strokeWidth={1.6} />
        </WinBtn>

        <div style={{ position: "relative" }}>
          <WinBtn
            label={settingsOpen ? t("chromeRail.closeSettings") : t("settings.title")}
            onClick={onOpenSettings}
            active={settingsOpen}
          >
            <Settings size={14} strokeWidth={1.55} />
          </WinBtn>
          {hasUpdate && (
            <span
              style={{
                position: "absolute",
                top: 4,
                right: 4,
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#FF8C42",
                boxShadow: "0 0 4px rgba(255,140,66,0.7)",
                pointerEvents: "none",
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
