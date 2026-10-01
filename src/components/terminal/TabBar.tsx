import { memo } from "react";
import { X } from "lucide-react";
import type { TerminalSessionInfo } from "@shared/terminal/types";
import { useFontScale } from "../../contexts/FontSizeContext";
import { FONT_FAMILY } from "./theme";

interface TabBarProps {
  sessions: readonly TerminalSessionInfo[];
  activeSession: string | null;
  onSelectSession: (name: string) => void;
  onKillSession: (name: string) => void;
  background?: string;
}

interface SessionTabProps {
  name: string;
  isActive: boolean;
  onSelectSession: (name: string) => void;
  onKillSession: (name: string) => void;
}

const SessionTab = memo(function SessionTab({ name, isActive, onSelectSession, onKillSession }: SessionTabProps) {
  const s = useFontScale();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        minHeight: 28,
        padding: "5px 10px",
        cursor: "pointer",
        flexShrink: 0,
        background: isActive ? "var(--bg-tertiary)" : "transparent",
        borderRadius: 7,
        transition: "background .15s, color .15s",
      }}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.background = "var(--hover-overlay)";
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.background = "transparent";
      }}
      onClick={() => onSelectSession(name)}
    >
      <span
        style={{
          fontSize: s(11),
          fontFamily: FONT_FAMILY,
          color: isActive ? "var(--text-secondary)" : "var(--text-muted)",
          maxWidth: 120,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          letterSpacing: ".04em",
        }}
      >
        {name}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onKillSession(name);
        }}
        title="Kill session"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 14,
          height: 14,
          borderRadius: 3,
          background: "transparent",
          border: "none",
          color: "var(--text-muted)",
          cursor: "pointer",
          padding: 0,
          flexShrink: 0,
          transition: "color .15s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
      >
        <X size={10} strokeWidth={2} />
      </button>
    </div>
  );
});

function TabBar({ sessions, activeSession, onSelectSession, onKillSession, background = "transparent" }: TabBarProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        overflowX: "auto",
        background,
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
        scrollbarWidth: "none",
        padding: "5px 8px 4px",
      }}
    >
      {sessions.map((session) => (
        <SessionTab
          key={session.name}
          name={session.name}
          isActive={session.name === activeSession}
          onSelectSession={onSelectSession}
          onKillSession={onKillSession}
        />
      ))}
    </div>
  );
}

export default memo(TabBar);
