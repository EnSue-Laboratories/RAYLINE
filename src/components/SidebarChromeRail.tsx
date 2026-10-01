import { useState, type ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen, Plus, Settings } from "lucide-react";
import { useTranslator } from "../contexts/LocaleContext";
import {
  SIDEBAR_CHROME_RAIL_HEIGHT,
  SIDEBAR_CHROME_RAIL_LEFT,
  SIDEBAR_CHROME_RAIL_TOP,
  SIDEBAR_CHROME_RAIL_WIDTH,
} from "../windowChrome";
import { NO_DRAG } from "../utils/appRegion";

interface RailButtonProps {
  label: string;
  onClick?: () => void;
  active?: boolean;
  visible?: boolean;
  children: ReactNode;
}

function RailButton({ label, onClick, active = false, visible = true, children }: RailButtonProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      aria-label={label}
      // Stays focusable while hidden (PR #230): focusing reveals the rail.
      tabIndex={0}
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
        background: active || hovered ? "var(--control-bg)" : "transparent",
        color:
          hovered || active
            ? "color-mix(in srgb, var(--text-primary) 89%, transparent)"
            : "color-mix(in srgb, var(--text-primary) 46%, transparent)",
        cursor: "pointer",
        padding: 0,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(-2px)",
        transition: "background .16s ease, color .16s ease, opacity .14s ease, transform .14s ease",
        pointerEvents: visible ? "auto" : "none",
        ...NO_DRAG,
        userSelect: "none",
      }}
    >
      <span style={{ display: "flex", pointerEvents: "none", ...NO_DRAG }}>{children}</span>
    </button>
  );
}

export interface SidebarChromeRailProps {
  sidebarOpen: boolean;
  settingsOpen: boolean;
  /** Hide the buttons until the rail is hovered or focused. */
  controlsOnHover?: boolean;
  onToggleSidebar?: () => void;
  onNew?: () => void;
  onOpenSettings?: () => void;
}

/** macOS floating rail next to the traffic lights: sidebar toggle, new chat, settings. */
export default function SidebarChromeRail({
  sidebarOpen,
  settingsOpen,
  controlsOnHover = false,
  onToggleSidebar,
  onNew,
  onOpenSettings,
}: SidebarChromeRailProps) {
  const t = useTranslator();
  const [railHovered, setRailHovered] = useState(false);
  const [railFocused, setRailFocused] = useState(false);
  const controlsVisible = !controlsOnHover || railHovered || railFocused;

  return (
    <div
      aria-label={t("chromeRail.controls")}
      onFocusCapture={() => setRailFocused(true)}
      onBlurCapture={(event) => {
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !event.currentTarget.contains(next)) setRailFocused(false);
      }}
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
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 0.1,
        pointerEvents: controlsOnHover ? "auto" : "none",
        ...NO_DRAG,
        userSelect: "none",
        isolation: "isolate",
      }}
      onMouseDownCapture={(event) => event.stopPropagation()}
      onPointerDownCapture={(event) => event.stopPropagation()}
    >
      <RailButton
        label={sidebarOpen ? t("chromeRail.collapseSidebar") : t("chromeRail.expandSidebar")}
        onClick={onToggleSidebar}
        visible={controlsVisible}
      >
        {sidebarOpen ? <PanelLeftClose size={15} strokeWidth={1.55} /> : <PanelLeftOpen size={15} strokeWidth={1.55} />}
      </RailButton>

      <RailButton label={t("chromeRail.newChat")} onClick={onNew} visible={controlsVisible}>
        <Plus size={15} strokeWidth={1.6} />
      </RailButton>

      <RailButton
        label={settingsOpen ? t("chromeRail.closeSettings") : t("settings.title")}
        onClick={onOpenSettings}
        active={settingsOpen}
        visible={controlsVisible}
      >
        <Settings size={14} strokeWidth={1.55} />
      </RailButton>
    </div>
  );
}
