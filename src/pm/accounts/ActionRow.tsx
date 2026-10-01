import { useState, type ReactNode } from "react";
import { SYSTEM_FONT } from "../styles";

interface ActionRowProps {
  icon: ReactNode;
  title: string;
  subtitle: string;
  /** Omit to render the row disabled. */
  onClick?: () => void;
  danger?: boolean;
}

export default function ActionRow({ icon, title, subtitle, onClick, danger = false }: ActionRowProps) {
  const [hovered, setHovered] = useState(false);
  const disabled = !onClick;
  const dangerColor = hovered ? "var(--danger-text-strong)" : "var(--danger-text)";
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      disabled={disabled}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        padding: "10px 12px",
        borderRadius: 8,
        border: "none",
        cursor: disabled ? "default" : "pointer",
        background: hovered && !disabled ? "var(--pane-hover)" : "transparent",
        transition: "background .15s, color .15s",
        textAlign: "left",
        color: danger ? dangerColor : "var(--text-secondary)",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span style={{ display: "flex", width: 15, height: 15, flexShrink: 0, color: danger ? dangerColor : "var(--text-muted)" }}>
        {icon}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13, fontFamily: SYSTEM_FONT, color: "inherit" }}>{title}</span>
        <span style={{ display: "block", fontSize: 11, fontFamily: SYSTEM_FONT, color: "var(--text-disabled)", marginTop: 2 }}>
          {subtitle}
        </span>
      </span>
    </button>
  );
}
