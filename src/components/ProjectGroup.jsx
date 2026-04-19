import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, FolderClosed, Plus, MoreHorizontal, Trash2 } from "lucide-react";
import { useFontScale } from "../contexts/FontSizeContext";
import { getM } from "../data/models";
import { relativeTime } from "../utils/time";
import { applyPaneInteractionStyle, getPaneInteractionStyle } from "../utils/paneSurface";

export default function ProjectGroup({
  project,
  active,
  onSelect,
  onDelete,
  onNewInProject,
  onToggleCollapse,
  onHideProject,
  searchActive,
}) {
  const s = useFontScale();
  const [headerHovered, setHeaderHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const moreRef = useRef(null);
  const menuRef = useRef(null);

  const expanded = searchActive || !project.collapsed;

  // Close context menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (moreRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setMenuOpen(false);
      setMenuPos(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  if (project.hidden) return null;

  const openMenu = () => {
    if (!moreRef.current) return;
    const rect = moreRef.current.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + 4,
      left: rect.left,
    });
    setMenuOpen(true);
  };

  const closeMenu = () => {
    setMenuOpen(false);
    setMenuPos(null);
  };

  return (
    <div style={{ marginBottom: 2 }}>
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          padding: "5px 6px",
          borderRadius: 6,
          minHeight: 26,
          cursor: "pointer",
          transition: "background .15s",
          userSelect: "none",
          ...(headerHovered ? getPaneInteractionStyle("hover") : getPaneInteractionStyle("idle")),
        }}
        onMouseEnter={() => setHeaderHovered(true)}
        onMouseLeave={() => setHeaderHovered(false)}
        onClick={() => onToggleCollapse(project.cwdRoot)}
      >
        {/* Chevron */}
        <span
          style={{
            display: "flex",
            alignItems: "center",
            color: "rgba(255,255,255,0.25)",
            transform: `rotate(${expanded ? 90 : 0}deg)`,
            transition: "transform .15s",
            flexShrink: 0,
          }}
        >
          <ChevronRight size={12} strokeWidth={1.5} />
        </span>

        {/* Folder icon */}
        <span
          style={{
            display: "flex",
            alignItems: "center",
            color: "rgba(255,255,255,0.3)",
            flexShrink: 0,
          }}
        >
          <FolderClosed size={13} strokeWidth={1.5} />
        </span>

        {/* Project name */}
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: s(11),
            fontFamily: "'JetBrains Mono', monospace",
            color: "rgba(255,255,255,0.4)",
            letterSpacing: ".04em",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {project.name}
        </span>

        <div style={{ marginLeft: "auto", width: 42, height: 18, position: "relative", flexShrink: 0 }}>
          {project.latestTs && (
            <span
              style={{
                position: "absolute",
                right: 0,
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: s(9),
                fontFamily: "'JetBrains Mono', monospace",
                color: "rgba(255,255,255,0.15)",
                letterSpacing: ".04em",
                opacity: headerHovered ? 0 : 1,
                pointerEvents: "none",
                transition: "opacity .15s",
              }}
            >
              {relativeTime(project.latestTs)}
            </span>
          )}

          <div
            style={{
              position: "absolute",
              right: 0,
              top: "50%",
              transform: "translateY(-50%)",
              display: "flex",
              alignItems: "center",
              gap: 2,
              opacity: headerHovered ? 1 : 0,
              pointerEvents: headerHovered ? "auto" : "none",
              transition: "opacity .15s",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => onNewInProject(project.cwdRoot)}
              title="New chat in project"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "none",
                border: "none",
                color: "rgba(255,255,255,0.25)",
                cursor: "pointer",
                padding: 3,
                borderRadius: 4,
                transition: "color .15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.65)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.25)"; }}
            >
              <Plus size={11} strokeWidth={1.5} />
            </button>

            <button
              ref={moreRef}
              onClick={openMenu}
              title="More options"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "none",
                border: "none",
                color: "rgba(255,255,255,0.25)",
                cursor: "pointer",
                padding: 3,
                borderRadius: 4,
                transition: "color .15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.65)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.25)"; }}
            >
              <MoreHorizontal size={11} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </div>

      {/* Conversation list */}
      {expanded && (
      <div
        className="folder-convo-scroll"
        style={{
          maxHeight: 320,
          overflowY: project.convos.length > 4 ? "auto" : "visible",
          overflowX: "hidden",
        }}
      >
      {project.convos.map((c) => {
        const isActive = c.id === active;
        const cm = getM(c.model);

        return (
          <div
            key={c.id}
            onClick={() => onSelect(c.id)}
            style={{
              position: "relative",
              padding: "12px 6px 12px 28px",
              borderRadius: 8,
              cursor: "pointer",
              marginBottom: 1,
              transition: "all .12s",
              ...(isActive ? getPaneInteractionStyle("active") : getPaneInteractionStyle("idle")),
            }}
            onMouseEnter={(e) => {
              if (!isActive) applyPaneInteractionStyle(e.currentTarget, "hover");
              const actions = e.currentTarget.querySelector(".convo-actions");
              if (actions) actions.style.opacity = "1";
            }}
            onMouseLeave={(e) => {
              if (!isActive) applyPaneInteractionStyle(e.currentTarget, "idle");
              const actions = e.currentTarget.querySelector(".convo-actions");
              if (actions) actions.style.opacity = "0";
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
              <div style={{ flex: 1, minWidth: 0, paddingRight: 18 }}>
                <div
                  style={{
                    fontSize: s(12.5),
                    color: isActive ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.45)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontFamily: "system-ui,sans-serif",
                    marginBottom: 4,
                  }}
                >
                  {c.title}
                </div>
                <div
                  style={{
                    fontSize: s(11),
                    color: "rgba(255,255,255,0.3)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontFamily: "'Lato',system-ui,sans-serif",
                    fontWeight: 300,
                  }}
                >
                  {c.lastPreview || "Empty"}
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
                onClick={(e) => onDelete(c.id, e)}
                style={{
                  background: "none",
                  border: "none",
                  color: "rgba(255,255,255,0.25)",
                  cursor: "pointer",
                  padding: 1,
                  transition: "color .15s",
                  display: "flex",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(200,80,80,0.5)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.25)"; }}
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
                  fontFamily: "'JetBrains Mono',monospace",
                  color: "rgba(255,255,255,0.35)",
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
                    fontFamily: "'JetBrains Mono',monospace",
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
                  RUNNING
                </div>
              )}
            </div>
          </div>
        );
      })}
      </div>
      )}

      {/* Context menu portal */}
      {menuOpen && menuPos && createPortal(
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            top: menuPos.top,
            left: menuPos.left,
            zIndex: 400,
            minWidth: 180,
            background: "rgba(8,8,12,0.55)",
            backdropFilter: "blur(48px) saturate(1.2)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 10,
            padding: 3,
            boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
            animation: "dropIn .15s ease",
            WebkitAppRegion: "no-drag",
          }}
        >
          <MenuBtn
            s={s}
            label="Open in Finder"
            onClick={() => {
              window.api?.openPath?.(project.cwdRoot);
              closeMenu();
            }}
          />
          <MenuBtn
            s={s}
            label="Copy path"
            onClick={() => {
              navigator.clipboard.writeText(project.cwdRoot);
              closeMenu();
            }}
          />

          {/* Divider */}
          <div style={{ height: 1, background: "rgba(255,255,255,0.04)", margin: "3px 8px" }} />

          <MenuBtn
            s={s}
            label="Hide project"
            danger
            onClick={() => {
              onHideProject(project.cwdRoot);
              closeMenu();
            }}
          />
        </div>,
        document.body
      )}
    </div>
  );
}

function MenuBtn({ s, label, onClick, danger = false }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        padding: "8px 13px",
        background: "transparent",
        border: "none",
        borderRadius: 7,
        color: danger ? "rgba(210,80,80,0.7)" : "rgba(255,255,255,0.55)",
        fontSize: s(11),
        fontFamily: "system-ui, sans-serif",
        cursor: "pointer",
        textAlign: "left",
        transition: "all .12s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(255,255,255,0.04)";
        e.currentTarget.style.color = danger ? "rgba(220,90,90,1)" : "rgba(255,255,255,0.85)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = danger ? "rgba(210,80,80,0.7)" : "rgba(255,255,255,0.55)";
      }}
    >
      {label}
    </button>
  );
}
