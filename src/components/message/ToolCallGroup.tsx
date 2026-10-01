import { memo, useState } from "react";
import { ChevronDown, ChevronRight, Layers, Loader2 } from "lucide-react";
import type { MessagePart } from "@shared/chat/types";
import { useFontScale } from "../../contexts/FontSizeContext";
import { shallowEqual } from "../../store/createStore";
import { ToolCallBlock } from "./blocks";
import { summarizeToolNames } from "./partGroups";

interface ToolCallGroupProps {
  /** The grouped tool parts (all `type: "tool"`). */
  parts: readonly MessagePart[];
}

/**
 * "N tool calls" — collapsed by default; children mount only when expanded.
 * TODO(i18n): "{count} tool calls" → `chat.toolCallsGroup` once data-i18n adds it.
 */
function ToolCallGroup({ parts }: ToolCallGroupProps) {
  const s = useFontScale();
  const [expanded, setExpanded] = useState(false);
  const running = parts.some((part) => part.type === "tool" && part.status === "running");
  const { names, more } = summarizeToolNames(parts);
  const summary = names.join(", ") + (more > 0 ? ` +${more}` : "");

  return (
    <div data-copy-image-ignore="true" style={{ margin: "8px 0", borderRadius: 8, border: "1px solid var(--pane-border)", overflow: "hidden" }}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          padding: "8px 12px",
          background: "var(--control-bg-subtle)",
          border: "none",
          color: "var(--text-secondary)",
          cursor: "pointer",
          fontSize: s(11),
          fontFamily: "var(--font-mono)",
          textAlign: "left",
        }}
      >
        <Layers size={13} strokeWidth={1.5} />
        <span style={{ color: "var(--text-primary)", flexShrink: 0 }}>{parts.length} tool calls</span>
        <span style={{ color: "var(--text-muted)", fontSize: s(10), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
          {summary}
        </span>
        <span style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
          {running && <Loader2 size={10} strokeWidth={2} style={{ color: "var(--text-muted)", animation: "spin 1s linear infinite" }} />}
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
      </button>
      {expanded && (
        <div style={{ padding: "0 8px" }}>
          {parts.map((part, index) =>
            part.type === "tool" ? <ToolCallBlock key={part.id || index} tool={part} /> : null,
          )}
        </div>
      )}
    </div>
  );
}

// Group slices are rebuilt on every flush; compare their parts by identity.
export default memo(ToolCallGroup, (prev, next) => shallowEqual(prev.parts, next.parts));
