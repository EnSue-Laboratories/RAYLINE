import { memo } from "react";
import { Plus, X, Terminal as TerminalIcon } from "lucide-react";
import type { TerminalSessionInfo } from "@shared/terminal/types";
import { MAC_TRAFFIC_LIGHT_SAFE_WIDTH, WINDOW_DRAG_HEIGHT } from "../../windowChrome";
import { useFontScale } from "../../contexts/FontSizeContext";
import IconButton from "./IconButton";
import TabBar from "./TabBar";
import { FONT_FAMILY, type AppRegionStyle } from "./theme";

interface TerminalToolbarProps {
  sessions: readonly TerminalSessionInfo[];
  activeSession: string | null;
  onSelectSession: (name: string) => void;
  onKillSession: (name: string) => void;
  onCreate: () => void;
  onClose?: () => void;
  windowMode: boolean;
  windowControlsVisible: boolean;
  isMac: boolean;
}

const dragRegion: AppRegionStyle = { WebkitAppRegion: "drag" };
const noDragRegion: AppRegionStyle = { WebkitAppRegion: "no-drag" };

/** Drawer / window header: title, new + close buttons, and the session tabs. */
function TerminalToolbar({
  sessions,
  activeSession,
  onSelectSession,
  onKillSession,
  onCreate,
  onClose,
  windowMode,
  windowControlsVisible,
  isMac,
}: TerminalToolbarProps) {
  const s = useFontScale();
  return (
    <div style={{ position: "relative", zIndex: 2, flexShrink: 0, overflow: "hidden" }}>
      <div style={{ position: "relative" }}>
        <div
          style={{
            ...dragRegion,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: WINDOW_DRAG_HEIGHT,
            padding: windowMode && isMac ? `0 14px 0 ${MAC_TRAFFIC_LIGHT_SAFE_WIDTH + 8}px` : "0 14px",
          }}
        >
          <div style={{ ...dragRegion, display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
            <TerminalIcon size={13} strokeWidth={1.5} color="var(--text-muted)" />
            <span
              style={{
                fontSize: s(10),
                fontFamily: FONT_FAMILY,
                color: "var(--text-muted)",
                letterSpacing: ".08em",
                userSelect: "none",
                whiteSpace: "nowrap",
              }}
            >
              TERMINALS
            </span>
          </div>

          <div style={{ ...noDragRegion, display: "flex", alignItems: "center", gap: 6 }}>
            <IconButton onClick={onCreate} title="New terminal">
              <Plus size={13} strokeWidth={1.5} />
            </IconButton>
            <IconButton onClick={onClose} title={windowMode ? "Close window" : "Close drawer"}>
              <X size={13} strokeWidth={1.5} />
            </IconButton>
            {windowMode && windowControlsVisible && <div style={{ width: 120, flexShrink: 0 }} />}
          </div>
        </div>

        {/* Tab bar — only when there are multiple sessions */}
        {sessions.length > 1 && (
          <TabBar
            sessions={sessions}
            activeSession={activeSession}
            onSelectSession={onSelectSession}
            onKillSession={onKillSession}
          />
        )}
      </div>
    </div>
  );
}

export default memo(TerminalToolbar);
