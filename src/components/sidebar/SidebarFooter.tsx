import { memo } from "react";
import { FolderOpen } from "lucide-react";
import type { FontScale } from "./types";

export interface SidebarFooterProps {
  s: FontScale;
  folderLabel: string;
  countLabel: string;
  onPickFolder?: () => void;
}

/** Current folder (click to change) and the chat / hit count. */
function SidebarFooter({ s, folderLabel, countLabel, onPickFolder }: SidebarFooterProps) {
  return (
    <div
      style={{
        padding: "12px 20px",
        borderTop: "1px solid var(--control-border)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <button
        onClick={onPickFolder}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: s(8),
          fontFamily: "var(--font-mono)",
          color: "var(--mono-dimmed)",
          letterSpacing: ".08em",
          padding: 0,
          transition: "color .2s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--mono-dimmed)"; }}
      >
        <FolderOpen size={10} strokeWidth={1.5} />
        {folderLabel}
      </button>
      <span style={{ fontSize: s(8), fontFamily: "var(--font-mono)", color: "var(--mono-dimmed)", letterSpacing: ".06em" }}>
        {countLabel}
      </span>
    </div>
  );
}

export default memo(SidebarFooter);
