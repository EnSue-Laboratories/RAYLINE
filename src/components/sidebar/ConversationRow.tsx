import { memo, useCallback, type MouseEvent } from "react";
import { Trash2 } from "lucide-react";
import { getMOrMulticaFallback } from "../../data/models";
import { applyPaneInteractionStyle, getPaneInteractionStyle } from "../../utils/paneSurface";
import { areConversationRowsEqual } from "./projectGroupEquality";
import type { DeleteConversation, ExtraModels, FontScale, SelectConversation, SidebarConversation } from "./types";

export interface ConversationRowProps {
  conversation: SidebarConversation;
  isActive: boolean;
  onSelect: SelectConversation;
  onDelete: DeleteConversation;
  multicaModels: ExtraModels;
  rowHeight: number;
  s: FontScale;
  /** Absolute offset inside a virtualized list; undefined renders in flow. */
  top?: number;
}

function setRowActionsOpacity(row: HTMLElement, opacity: string) {
  const actions = row.querySelector<HTMLElement>(".convo-actions");
  if (actions) actions.style.opacity = opacity;
}

function ConversationRow({
  conversation: c,
  isActive,
  onSelect,
  onDelete,
  multicaModels,
  rowHeight,
  s,
  top,
}: ConversationRowProps) {
  const cm = getMOrMulticaFallback(c.model, multicaModels);
  const id = c.id;

  const handleSelect = useCallback(() => onSelect(id), [id, onSelect]);
  const handleDelete = useCallback((event: MouseEvent) => onDelete(id, event), [id, onDelete]);

  return (
    <div
      onClick={handleSelect}
      style={{
        position: top === undefined ? "relative" : "absolute",
        ...(top === undefined ? null : { top, left: 0, right: 0 }),
        height: rowHeight - 1,
        padding: "11px 6px 10px 28px",
        borderRadius: 8,
        cursor: "pointer",
        marginBottom: 1,
        overflow: "hidden",
        contain: "layout paint style",
        transition: "background .12s, box-shadow .12s, color .12s",
        ...getPaneInteractionStyle(isActive ? "active" : "idle"),
      }}
      onMouseEnter={(e) => {
        if (!isActive) applyPaneInteractionStyle(e.currentTarget, "hover");
        setRowActionsOpacity(e.currentTarget, "1");
      }}
      onMouseLeave={(e) => {
        if (!isActive) applyPaneInteractionStyle(e.currentTarget, "idle");
        setRowActionsOpacity(e.currentTarget, "0");
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
        <div style={{ flex: 1, minWidth: 0, paddingRight: 18 }}>
          <div
            style={{
              fontSize: s(12.5),
              color: isActive ? "var(--text-primary)" : "var(--sb-text-mid)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontFamily: "var(--font-ui)",
              marginBottom: 4,
            }}
          >
            {c.title}
          </div>
          <div
            style={{
              fontSize: s(11),
              color: "var(--sb-text-dim)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontFamily: "'Lato',system-ui,sans-serif",
              fontWeight: 300,
            }}
          >
            {c._searchPreview || c.lastPreview || "Empty"}
          </div>
        </div>
      </div>

      <div
        className="convo-actions"
        style={{
          position: "absolute",
          top: 12,
          right: 6,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: 0,
          transition: "opacity .15s",
        }}
      >
        <button
          onClick={handleDelete}
          style={{
            background: "none",
            border: "none",
            color: "var(--sb-text-icon)",
            cursor: "pointer",
            padding: 1,
            transition: "color .15s",
            display: "flex",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--danger-soft-text)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--sb-text-icon)"; }}
        >
          <Trash2 size={12} strokeWidth={1.5} />
        </button>
      </div>

      <div
        style={{
          marginTop: 6,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div
          style={{
            fontSize: s(9),
            fontFamily: "var(--font-mono)",
            color: "var(--sb-text-meta)",
            letterSpacing: ".08em",
            minWidth: 0,
          }}
        >
          {cm.tag}
        </div>

        {c.isStreaming && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              flexShrink: 0,
              transform: "translateX(-2px)",
              fontSize: s(8.5),
              fontFamily: "var(--font-mono)",
              color: "var(--badge-open-text)",
              letterSpacing: ".08em",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--badge-open-text)",
                animation: "dotPulse 1.2s ease-in-out infinite",
              }}
            />
            RUNNING
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(ConversationRow, areConversationRowsEqual);
