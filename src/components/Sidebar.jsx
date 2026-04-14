import { useState } from "react";
import { useFontScale } from "../contexts/FontSizeContext";
import { Plus, Search, Trash2, X, FolderOpen, Settings as SettingsIcon, Github } from "lucide-react";
import { getM } from "../data/models";

export default function Sidebar({ convos, active, onSelect, onNew, onDelete, onToggleSidebar, cwd, onPickFolder, onOpenSettings, onOpenProjectManager }) {
  const s = useFontScale();
  const [search, setSearch]     = useState("");
  const [searchFocused, setSF]  = useState(false);

  const filtered = convos.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase())
  );

  const cwdShort = cwd ? (() => {
    const parts = cwd.split("/");
    const wtIdx = parts.indexOf(".worktrees");
    if (wtIdx >= 0 && wtIdx + 1 < parts.length) {
      return `${parts[wtIdx - 1]} / ${parts[wtIdx + 1]}`;
    }
    return parts.slice(-2).join("/");
  })() : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Drag region for window dragging — clears traffic lights */}
      <div style={{ height: 52, WebkitAppRegion: "drag", flexShrink: 0 }} />

      {/* Header */}
      <div
        style={{
          padding: "0 20px 18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          WebkitAppRegion: "no-drag",
        }}
      >
        <button
          onClick={onToggleSidebar}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            borderRadius: 7,
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.04)",
            color: "rgba(255,255,255,0.5)",
            cursor: "pointer",
            transition: "all .2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.05)";
            e.currentTarget.style.color = "rgba(255,255,255,0.75)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.02)";
            e.currentTarget.style.color = "rgba(255,255,255,0.5)";
          }}
        >
          <X size={14} strokeWidth={1.5} />
        </button>

        <button
          onClick={onNew}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            borderRadius: 7,
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.04)",
            color: "rgba(255,255,255,0.5)",
            cursor: "pointer",
            transition: "all .2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.05)";
            e.currentTarget.style.color = "rgba(255,255,255,0.75)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.02)";
            e.currentTarget.style.color = "rgba(255,255,255,0.5)";
          }}
        >
          <Plus size={16} strokeWidth={1.5} />
        </button>
      </div>

      {/* Search — only show when there are conversations */}
      {convos.length > 0 && <div style={{ padding: "0 12px 10px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            padding: "6px 10px",
            background: searchFocused ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.045)",
            border: "1px solid " + (searchFocused ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.08)"),
            borderRadius: 8,
            transition: "all .2s",
          }}
        >
          <span style={{ color: "rgba(255,255,255,0.45)", flexShrink: 0, display: "flex" }}>
            <Search size={13} strokeWidth={1.5} />
          </span>
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setSF(true)}
            onBlur={() => setSF(false)}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              color: "rgba(255,255,255,0.8)",
              fontSize: s(11),
              fontFamily: "'JetBrains Mono',monospace",
            }}
          />
        </div>
      </div>}

      {/* Conversation list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "2px 6px" }}>
        {convos.length === 0 && (
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            gap: 8,
            padding: "40px 20px",
            textAlign: "center",
          }}>
            <div style={{
              fontSize: s(11),
              fontFamily: "'JetBrains Mono',monospace",
              color: "rgba(255,255,255,0.15)",
              letterSpacing: ".08em",
            }}>
              NO CONVERSATIONS
            </div>
            <div style={{
              fontSize: s(10),
              color: "rgba(255,255,255,0.1)",
              fontFamily: "system-ui,sans-serif",
            }}>
              Start typing to begin
            </div>
          </div>
        )}
        {filtered.map((c, i) => {
          const isActive = c.id === active;
          const cm = getM(c.model);

          return (
            <div
              key={c.id}
              onClick={() => onSelect(c.id)}
              style={{
                padding: "12px 12px",
                borderRadius: 8,
                cursor: "pointer",
                marginBottom: 1,
                background: isActive ? "rgba(255,255,255,0.035)" : "transparent",
                transition: "all .12s",
                animation: `fadeSlide .2s ease ${i * 0.03}s both`,
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.018)";
                const actions = e.currentTarget.querySelector(".convo-actions");
                if (actions) actions.style.opacity = "1";
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = "transparent";
                const actions = e.currentTarget.querySelector(".convo-actions");
                if (actions) actions.style.opacity = "0";
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
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

                <div className="convo-actions" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0, opacity: 0, transition: "opacity .15s" }}>
                  <button
                    onClick={(e) => onDelete(c.id, e)}
                    style={{ background: "none", border: "none", color: "rgba(255,255,255,0.25)", cursor: "pointer", padding: 1, transition: "color .15s", display: "flex" }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(200,80,80,0.5)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.25)"; }}
                  >
                    <Trash2 size={12} strokeWidth={1.5} />
                  </button>
                </div>
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

      {/* Footer */}
      <div
        style={{
          padding: "12px 20px",
          borderTop: "1px solid rgba(255,255,255,0.02)",
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
            fontFamily: "'JetBrains Mono',monospace",
            color: "rgba(255,255,255,0.28)",
            letterSpacing: ".08em",
            padding: 0,
            transition: "color .2s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.5)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.28)"; }}
        >
          <FolderOpen size={10} strokeWidth={1.5} />
          {cwdShort || "SELECT FOLDER"}
        </button>
        <button
          onClick={onOpenSettings}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 22,
            height: 22,
            borderRadius: 5,
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "rgba(255,255,255,0.28)",
            transition: "color .2s",
            padding: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.5)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.28)"; }}
        >
          <SettingsIcon size={12} strokeWidth={1.5} />
        </button>
        <button
          onClick={onOpenProjectManager}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 22,
            height: 22,
            borderRadius: 5,
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "rgba(255,255,255,0.28)",
            transition: "color .2s",
            padding: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.5)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.28)"; }}
        >
          <Github size={12} strokeWidth={1.5} />
        </button>
        <span style={{ fontSize: s(8), fontFamily: "'JetBrains Mono',monospace", color: "rgba(255,255,255,0.2)", letterSpacing: ".06em" }}>
          {convos.length} CHATS
        </span>
      </div>
    </div>
  );
}
