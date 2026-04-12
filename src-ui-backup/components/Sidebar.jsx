import { useState } from "react";
import { Plus, Search, Trash2, PanelRightOpen, PanelRight, X } from "lucide-react";
import { getM } from "../data/models";

export default function Sidebar({ convos, active, onSelect, onNew, onDelete, onToggleSidebar }) {
  const [search, setSearch]     = useState("");
  const [searchFocused, setSF]  = useState(false);

  const filtered = convos.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div
        style={{
          padding: "22px 20px 18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
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
            background: "none",
            border: "none",
            color: "rgba(255,255,255,0.5)",
            cursor: "pointer",
            transition: "color .2s",
            marginLeft: -10,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.75)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.5)"; }}
        >
          <X size={16} strokeWidth={1.5} />
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

      {/* Search */}
      <div style={{ padding: "0 12px 10px" }}>
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
              fontSize: 11,
              fontFamily: "'JetBrains Mono',monospace",
            }}
          />
        </div>
      </div>

      {/* Conversation list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "2px 6px" }}>
        {filtered.map((c, i) => {
          const isActive = c.id === active;
          const cm = getM(c.model);
          const lastMsg = c.msgs.length > 0 ? c.msgs[c.msgs.length - 1].text.slice(0, 45) : "Empty";

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
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.018)"; }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12.5,
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
                      fontSize: 11,
                      color: "rgba(255,255,255,0.3)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontFamily: "'Lato',system-ui,sans-serif",
                      fontWeight: 300,
                    }}
                  >
                    {lastMsg}
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontFamily: "'JetBrains Mono',monospace" }}>
                    {c.ts}
                  </span>
                  {isActive && (
                    <button
                      onClick={(e) => onDelete(c.id, e)}
                      style={{ background: "none", border: "none", color: "rgba(255,255,255,0.25)", cursor: "pointer", padding: 1, transition: "color .15s", display: "flex" }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(200,80,80,0.5)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.25)"; }}
                    >
                      <Trash2 size={12} strokeWidth={1.5} />
                    </button>
                  )}
                </div>
              </div>

              <div
                style={{
                  marginTop: 6,
                  fontSize: 9,
                  fontFamily: "'JetBrains Mono',monospace",
                  color: "rgba(255,255,255,0.35)",
                  letterSpacing: ".08em",
                }}
              >
                {cm.tag}
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
        }}
      >
        <span style={{ fontSize: 8, fontFamily: "'JetBrains Mono',monospace", color: "rgba(255,255,255,0.28)", letterSpacing: ".1em" }}>
          {convos.length} THREADS
        </span>
        <span style={{ fontSize: 8, fontFamily: "'JetBrains Mono',monospace", color: "rgba(255,255,255,0.2)", letterSpacing: ".06em" }}>
          V0.3
        </span>
      </div>
    </div>
  );
}
