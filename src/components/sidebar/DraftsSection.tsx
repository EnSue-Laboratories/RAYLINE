import { memo, useCallback, useState, type MouseEvent } from "react";
import { ChevronRight, Plus, Trash2 } from "lucide-react";
import { getMOrMulticaFallback } from "../../data/models";
import { applyPaneInteractionStyle, getPaneInteractionStyle } from "./boundary";
import type {
  DeleteConversation,
  ExtraModels,
  FontScale,
  SelectConversation,
  SidebarConversation,
  Translator,
} from "./types";

interface DraftRowProps {
  conversation: SidebarConversation;
  index: number;
  isActive: boolean;
  multicaModels: ExtraModels;
  runningLabel: string;
  s: FontScale;
  onSelect: SelectConversation;
  onDelete: DeleteConversation;
}

function setRowActionsOpacity(row: HTMLElement, opacity: string) {
  const actions = row.querySelector<HTMLElement>(".convo-actions");
  if (actions) actions.style.opacity = opacity;
}

const DraftRow = memo(function DraftRow({
  conversation: c,
  index,
  isActive,
  multicaModels,
  runningLabel,
  s,
  onSelect,
  onDelete,
}: DraftRowProps) {
  const cm = getMOrMulticaFallback(c.model, multicaModels);
  const id = c.id;
  const handleSelect = useCallback(() => onSelect(id), [id, onSelect]);
  const handleDelete = useCallback((event: MouseEvent) => onDelete(id, event), [id, onDelete]);

  return (
    <div
      onClick={handleSelect}
      style={{
        padding: "12px 12px 12px 28px",
        borderRadius: 8,
        cursor: "pointer",
        marginBottom: 1,
        transition: "background .12s, box-shadow .12s, color .12s",
        animation: `fadeSlide .2s ease ${index * 0.03}s both`,
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
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ marginBottom: 4, display: "flex", alignItems: "center", minWidth: 0 }}>
            <span
              style={{
                fontSize: s(12.5),
                color: isActive ? "var(--text-primary)" : "var(--sb-text-mid)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontFamily: "var(--font-ui)",
                flex: 1,
                minWidth: 0,
              }}
            >
              {c.title}
            </span>
            {(c.tags ?? []).slice(0, 2).map((tag) => (
              <span
                key={tag}
                style={{
                  fontSize: 9,
                  padding: "1px 5px",
                  borderRadius: 4,
                  marginLeft: 4,
                  background: "color-mix(in srgb, var(--accent) 12%, transparent)",
                  color: "color-mix(in srgb, var(--accent) 85%, transparent)",
                  fontFamily: "var(--font-mono)",
                  flexShrink: 0,
                }}
              >
                {tag}
              </span>
            ))}
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

        <div
          className="convo-actions"
          style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0, opacity: 0, transition: "opacity .15s" }}
        >
          <button
            onClick={handleDelete}
            style={{ background: "none", border: "none", color: "var(--sb-text-icon)", cursor: "pointer", padding: 1, transition: "color .15s", display: "flex" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(200,80,80,0.5)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--sb-text-icon)"; }}
          >
            <Trash2 size={12} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      <div style={{ marginTop: 6, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontSize: s(9), fontFamily: "var(--font-mono)", color: "var(--mono-faint)", letterSpacing: ".08em", minWidth: 0 }}>
          {cm.tag}
        </div>

        {c.isStreaming && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              flexShrink: 0,
              fontSize: s(8.5),
              fontFamily: "var(--font-mono)",
              color: "rgba(165,255,210,0.5)",
              letterSpacing: ".08em",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "rgba(165,255,210,0.5)",
                animation: "dotPulse 1.2s ease-in-out infinite",
              }}
            />
            {runningLabel}
          </div>
        )}
      </div>
    </div>
  );
});

export interface DraftsSectionProps {
  drafts: readonly SidebarConversation[];
  active: string | null | undefined;
  expanded: boolean;
  multicaModels: ExtraModels;
  s: FontScale;
  t: Translator;
  onToggleCollapsed?: () => void;
  onNewDraft: () => void;
  onSelect: SelectConversation;
  onDelete: DeleteConversation;
}

/** "DRAFTS" header and the chats that have no project. */
function DraftsSection({
  drafts,
  active,
  expanded,
  multicaModels,
  s,
  t,
  onToggleCollapsed,
  onNewDraft,
  onSelect,
  onDelete,
}: DraftsSectionProps) {
  const [headerHovered, setHeaderHovered] = useState(false);
  const runningLabel = t("sidebar.running");

  return (
    <div style={{ marginBottom: 2 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          padding: "5px 6px",
          borderRadius: 6,
          cursor: "pointer",
          transition: "background .15s",
          userSelect: "none",
        }}
        onClick={onToggleCollapsed}
        onMouseEnter={(e) => {
          setHeaderHovered(true);
          applyPaneInteractionStyle(e.currentTarget, "hover");
        }}
        onMouseLeave={(e) => {
          setHeaderHovered(false);
          applyPaneInteractionStyle(e.currentTarget, "idle");
        }}
      >
        <span
          style={{
            display: "flex",
            alignItems: "center",
            color: "var(--sb-text-icon)",
            transform: `rotate(${expanded ? 90 : 0}deg)`,
            transition: "transform .15s",
            flexShrink: 0,
          }}
        >
          <ChevronRight size={12} strokeWidth={1.5} />
        </span>
        <span style={{ fontSize: s(11), fontFamily: "var(--font-mono)", color: "var(--mono-dimmed)", letterSpacing: ".04em" }}>
          {t("sidebar.drafts")}
        </span>

        <div style={{ marginLeft: "auto", width: 18, height: 18, position: "relative", flexShrink: 0 }}>
          <div
            style={{
              position: "absolute",
              right: 0,
              top: "50%",
              transform: "translateY(-50%)",
              display: "flex",
              alignItems: "center",
              opacity: headerHovered ? 1 : 0,
              pointerEvents: headerHovered ? "auto" : "none",
              transition: "opacity .15s",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onNewDraft}
              title="New draft chat"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "none",
                border: "none",
                color: "var(--sb-text-icon)",
                cursor: "pointer",
                padding: 3,
                borderRadius: 4,
                transition: "color .15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--sb-text-hover)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--sb-text-icon)"; }}
            >
              <Plus size={11} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </div>

      {expanded &&
        drafts.map((c, i) => (
          <DraftRow
            key={c.id}
            conversation={c}
            index={i}
            isActive={c.id === active}
            multicaModels={multicaModels}
            runningLabel={runningLabel}
            s={s}
            onSelect={onSelect}
            onDelete={onDelete}
          />
        ))}
    </div>
  );
}

export default memo(DraftsSection);
