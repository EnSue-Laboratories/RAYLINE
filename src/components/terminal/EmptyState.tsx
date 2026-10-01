import { useMemo } from "react";
import { Terminal as TerminalIcon } from "lucide-react";
import { useFontScale } from "../../contexts/FontSizeContext";
import { FONT_FAMILY } from "./theme";
import { useHoverStyle } from "./useHoverStyle";

const buttonHoverStyle = {
  background: "var(--hover-overlay)",
  color: "var(--text-primary)",
};

interface EmptyStateProps {
  onCreate: () => void;
  /** Render an empty flex filler instead (terminal window). */
  blank?: boolean;
}

export default function EmptyState({ onCreate, blank = false }: EmptyStateProps) {
  const s = useFontScale();
  const buttonStyle = useMemo(() => ({
    marginTop: 12,
    padding: "6px 14px",
    borderRadius: 7,
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border)",
    color: "var(--text-muted)",
    cursor: "pointer",
    fontSize: s(11),
    fontFamily: FONT_FAMILY,
    letterSpacing: ".06em",
    transition: "background .15s, color .15s",
  }), [s]);
  const hover = useHoverStyle(buttonStyle, buttonHoverStyle);

  if (blank) return <div style={{ flex: 1, minHeight: 0 }} />;

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        userSelect: "none",
      }}
    >
      <TerminalIcon size={32} strokeWidth={1} color="var(--text-muted)" />
      <div
        style={{
          marginTop: 8,
          fontSize: s(11),
          fontFamily: FONT_FAMILY,
          color: "var(--text-muted)",
          letterSpacing: ".06em",
        }}
      >
        No active sessions
      </div>
      <button onClick={onCreate} {...hover}>
        NEW TERMINAL
      </button>
    </div>
  );
}
