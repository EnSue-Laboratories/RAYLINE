/** Small inline part renderers: status banners and collapsible errors. */
import { AlertTriangle, PauseCircle } from "lucide-react";
import type { ErrorPart, StatusPart } from "@shared/chat/types";
import { useFontScale } from "../../contexts/FontSizeContext";

export function StatusBlock({ part }: { part: StatusPart }) {
  const s = useFontScale();
  const isPaused = part.kind === "paused";
  return (
    <div
      data-copy-image-ignore="true"
      style={{
        margin: "10px 0 14px",
        padding: "10px 12px",
        borderRadius: 12,
        border: "1px solid var(--control-border)",
        background: isPaused ? "var(--warning-bg)" : "var(--control-bg)",
        color: "var(--text-secondary)",
        maxWidth: "80%",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: s(11),
          fontFamily: "var(--font-mono)",
          letterSpacing: ".04em",
          textTransform: "uppercase",
          color: isPaused ? "var(--warning-text)" : "var(--text-secondary)",
        }}
      >
        {isPaused && <PauseCircle size={14} strokeWidth={1.8} />}
        <span>{part.title || "Status"}</span>
      </div>
      {part.text && (
        <div style={{ marginTop: 6, fontSize: s(13), lineHeight: 1.65, fontFamily: "var(--font-content)", color: "var(--text-secondary)" }}>{part.text}</div>
      )}
    </div>
  );
}

/** Collapsible run / provider error (PR #230): title + first line, full text on expand. */
export function ErrorBlock({ part }: { part: ErrorPart }) {
  const s = useFontScale();
  const text = part.text || "An error occurred.";
  const summary = part.summary || text.split("\n").map((line) => line.trim()).find(Boolean) || "Error";
  const title = part.title || "Error";
  return (
    <details
      data-copy-image-ignore="true"
      style={{
        margin: "10px 0 14px",
        maxWidth: "92%",
        border: "1px solid var(--danger-border)",
        borderRadius: 10,
        background: "var(--danger-bg-soft)",
        color: "var(--danger-text)",
        overflow: "hidden",
      }}
    >
      <summary
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "9px 11px",
          cursor: "pointer",
          listStyle: "none",
          fontSize: s(11),
          fontFamily: "var(--font-mono)",
          letterSpacing: ".04em",
        }}
      >
        <AlertTriangle size={14} strokeWidth={1.8} />
        <span style={{ flexShrink: 0, textTransform: "uppercase" }}>{title}</span>
        <span
          style={{
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: "var(--danger-text-strong)",
            letterSpacing: 0,
            textTransform: "none",
          }}
        >
          {summary}
        </span>
      </summary>
      <pre
        style={{
          margin: 0,
          padding: "0 11px 11px 33px",
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
          color: "var(--text-secondary)",
          fontSize: s(11),
          lineHeight: 1.55,
          fontFamily: "var(--font-mono)",
        }}
      >
        {text}
      </pre>
    </details>
  );
}

/** Tiny icon button under a message (edit). */
export function MsgBtn({ icon, onClick, title }: { icon: React.ReactNode; onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        background: "none",
        border: "none",
        color: "var(--text-disabled)",
        cursor: "pointer",
        padding: "2px 4px",
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 3,
        transition: "color .2s",
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.color = "var(--text-secondary)";
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.color = "var(--text-disabled)";
      }}
    >
      {icon}
    </button>
  );
}
