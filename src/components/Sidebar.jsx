import { useState, useMemo, useRef } from "react";
import { useFontScale } from "../contexts/FontSizeContext";
import { Plus, Search, Trash2, FolderOpen, ChevronRight, Workflow, FolderPlus } from "lucide-react";
import WindowDragSpacer from "./WindowDragSpacer";
import ProjectGroup from "./ProjectGroup";
import { getMOrMulticaFallback } from "../data/models";
import { applyPaneInteractionStyle, getPaneInteractionStyle } from "../utils/paneSurface";
import { createTranslator } from "../i18n";

function getMainRepoRoot(dir) {
  if (!dir) return dir;
  const wtIdx = dir.indexOf("/.worktrees/");
  return wtIdx !== -1 ? dir.slice(0, wtIdx) : dir;
}

function isDraftConversation(conversation, draftsPath) {
  if (!conversation) return false;
  if (conversation.cwd == null) return true;
  if (!draftsPath) return false;
  return getMainRepoRoot(conversation.cwd) === getMainRepoRoot(draftsPath);
}

function groupConvosByProject(convos, projectsMeta, draftsPath) {
  const groups = {};
  const drafts = [];
  for (const c of convos) {
    if (isDraftConversation(c, draftsPath)) {
      drafts.push(c);
      continue;
    }
    const root = c.cwd ? getMainRepoRoot(c.cwd) : null;
    if (!root) continue;
    if (!groups[root]) {
      const meta = projectsMeta?.[root] || {};
      groups[root] = {
        cwdRoot: root,
        name: meta.name || root.split("/").pop(),
        collapsed: meta.collapsed ?? false,
        hidden: meta.hidden ?? false,
        convos: [],
      };
    }
    groups[root].convos.push(c);
  }
  // Also include manually added projects with 0 convos
  for (const [projectPath, meta] of Object.entries(projectsMeta || {})) {
    const root = getMainRepoRoot(projectPath);
    if (!root || (draftsPath && root === getMainRepoRoot(draftsPath))) continue;
    if (meta.manual && !groups[root]) {
      groups[root] = {
        cwdRoot: root,
        name: root.split("/").pop(),
        collapsed: meta.collapsed ?? false,
        hidden: meta.hidden ?? false,
        convos: [],
      };
    }
  }
  const sorted = Object.values(groups).sort((a, b) => {
    const aTs = a.convos.length ? Math.max(...a.convos.map(c => c.ts)) : 0;
    const bTs = b.convos.length ? Math.max(...b.convos.map(c => c.ts)) : 0;
    return bTs - aTs;
  });

  // Disambiguate duplicate basenames
  const nameCounts = {};
  sorted.forEach(g => { nameCounts[g.name] = (nameCounts[g.name] || 0) + 1; });
  sorted.forEach(g => {
    if (nameCounts[g.name] > 1) {
      const parts = g.cwdRoot.split("/");
      const parent = parts.length >= 2 ? parts[parts.length - 2] : "";
      if (parent) g.name = `${g.name} (${parent})`;
    }
  });

  // Add latest timestamp for header display
  sorted.forEach(g => {
    g.latestTs = g.convos.length ? Math.max(...g.convos.map(c => c.ts)) : null;
  });

  return { projectGroups: sorted, drafts };
}

function GitHubIcon({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export default function Sidebar({ convos, active, onSelect, onNew, onDelete, cwd, onPickFolder, onOpenProjectManager, onOpenDispatch, onOpenNewProject, projects, draftsPath, onToggleProjectCollapse, onHideProject, onNewInProject, draftsCollapsed, onToggleDraftsCollapsed, developerMode = true, multicaModels = [], locale = "en-US" }) {
  const s = useFontScale();
  const [search, setSearch]     = useState("");
  const [searchFocused, setSF]  = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [draftsHeaderHovered, setDraftsHeaderHovered] = useState(false);
  const t = useMemo(() => createTranslator(locale), [locale]);

  const filtered = convos.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase())
  );

  const folderOrderRef = useRef([]);
  const { projectGroups, drafts } = useMemo(() => {
    const result = groupConvosByProject(filtered, projects, draftsPath);
    const currentRoots = new Set(result.projectGroups.map(g => g.cwdRoot));
    const prevOrder = folderOrderRef.current.filter(r => currentRoots.has(r));
    const known = new Set(prevOrder);
    const newcomers = result.projectGroups
      .filter(g => !known.has(g.cwdRoot))
      .sort((a, b) => (b.latestTs || 0) - (a.latestTs || 0))
      .map(g => g.cwdRoot);
    const nextOrder = [...newcomers, ...prevOrder];
    folderOrderRef.current = nextOrder;
    const byRoot = new Map(result.projectGroups.map(g => [g.cwdRoot, g]));
    return {
      projectGroups: nextOrder.map(r => byRoot.get(r)).filter(Boolean),
      drafts: result.drafts,
    };
  }, [draftsPath, filtered, projects]);
  const searchActive = search.length > 0;

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
      <WindowDragSpacer />

      {/* Menu items */}
      <div style={{ padding: "0 12px 14px", display: "flex", flexDirection: "column", gap: 2, WebkitAppRegion: "no-drag" }}>
        <button
          onClick={onNew}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 10px", borderRadius: 7,
            background: "none", border: "none", cursor: "pointer",
            color: "rgba(255,255,255,0.55)", fontSize: s(12),
            fontFamily: "system-ui, sans-serif", transition: "all .15s",
            textAlign: "left",
          }}
          onMouseEnter={(e) => { applyPaneInteractionStyle(e.currentTarget, "hover"); e.currentTarget.style.color = "rgba(255,255,255,0.8)"; }}
          onMouseLeave={(e) => { applyPaneInteractionStyle(e.currentTarget, "idle"); e.currentTarget.style.color = "rgba(255,255,255,0.55)"; }}
        >
          <Plus size={15} strokeWidth={1.5} />
          {t("sidebar.newChat")}
        </button>
        <button
          onClick={onOpenDispatch}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 10px", borderRadius: 7,
            background: "none", border: "none", cursor: "pointer",
            color: "rgba(255,255,255,0.55)", fontSize: s(12),
            fontFamily: "system-ui, sans-serif", transition: "all .15s",
            textAlign: "left",
          }}
          onMouseEnter={(e) => { applyPaneInteractionStyle(e.currentTarget, "hover"); e.currentTarget.style.color = "rgba(255,255,255,0.8)"; }}
          onMouseLeave={(e) => { applyPaneInteractionStyle(e.currentTarget, "idle"); e.currentTarget.style.color = "rgba(255,255,255,0.55)"; }}
        >
          <Workflow size={15} strokeWidth={1.5} />
          {t("sidebar.dispatch")}
        </button>
        <button
          onClick={onOpenNewProject}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 10px", borderRadius: 7,
            background: "none", border: "none", cursor: "pointer",
            color: "rgba(255,255,255,0.55)", fontSize: s(12),
            fontFamily: "system-ui, sans-serif", transition: "all .15s",
            textAlign: "left",
          }}
          onMouseEnter={(e) => { applyPaneInteractionStyle(e.currentTarget, "hover"); e.currentTarget.style.color = "rgba(255,255,255,0.8)"; }}
          onMouseLeave={(e) => { applyPaneInteractionStyle(e.currentTarget, "idle"); e.currentTarget.style.color = "rgba(255,255,255,0.55)"; }}
        >
          <FolderPlus size={15} strokeWidth={1.5} />
          {t("sidebar.newProject")}
        </button>
        {developerMode && (
          <button
            onClick={onOpenProjectManager}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 10px", borderRadius: 7,
              background: "none", border: "none", cursor: "pointer",
              color: "rgba(255,255,255,0.55)", fontSize: s(12),
              fontFamily: "system-ui, sans-serif", transition: "all .15s",
              textAlign: "left",
            }}
            onMouseEnter={(e) => { applyPaneInteractionStyle(e.currentTarget, "hover"); e.currentTarget.style.color = "rgba(255,255,255,0.8)"; }}
            onMouseLeave={(e) => { applyPaneInteractionStyle(e.currentTarget, "idle"); e.currentTarget.style.color = "rgba(255,255,255,0.55)"; }}
          >
            <GitHubIcon size={15} />
            {t("sidebar.githubProjects")}
          </button>
        )}
        {convos.length > 0 && !searchOpen && <button
          onClick={() => setSearchOpen(true)}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 10px", borderRadius: 7,
            background: "none", border: "none", cursor: "pointer",
            color: "rgba(255,255,255,0.55)", fontSize: s(12),
            fontFamily: "system-ui, sans-serif", transition: "all .15s",
            textAlign: "left",
          }}
          onMouseEnter={(e) => { applyPaneInteractionStyle(e.currentTarget, "hover"); e.currentTarget.style.color = "rgba(255,255,255,0.8)"; }}
          onMouseLeave={(e) => { applyPaneInteractionStyle(e.currentTarget, "idle"); e.currentTarget.style.color = "rgba(255,255,255,0.55)"; }}
        >
          <Search size={15} strokeWidth={1.5} />
          {t("sidebar.search")}
        </button>}
        {searchOpen && <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            marginTop: 6,
            padding: "6px 10px",
            border: "1px solid " + (searchFocused ? "rgba(255,255,255,0.12)" : "var(--pane-border)"),
            borderRadius: 8,
            transition: "background .2s, color .2s, border-color .2s, box-shadow .2s, backdrop-filter .2s",
            ...(searchFocused ? getPaneInteractionStyle("active") : {
              background: "var(--pane-elevated)",
              backdropFilter: "none",
              boxShadow: "none",
            }),
          }}
        >
          <span style={{ color: "rgba(255,255,255,0.45)", flexShrink: 0, display: "flex" }}>
            <Search size={13} strokeWidth={1.5} />
          </span>
          <input
            type="text"
            placeholder={t("sidebar.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setSF(true)}
            onBlur={() => { setSF(false); if (!search) { setSearchOpen(false); } }}
            autoFocus
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              color: "rgba(255,255,255,0.8)",
              fontSize: s(11),
              fontFamily: "'JetBrains Mono',monospace",
            }}
          />
        </div>}
      </div>

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
              {t("sidebar.noConversations")}
            </div>
            <div style={{
              fontSize: s(10),
              color: "rgba(255,255,255,0.1)",
              fontFamily: "system-ui,sans-serif",
            }}>
              {t("sidebar.noConversationsHint")}
            </div>
          </div>
        )}
        {/* Project groups */}
        {projectGroups
          .filter(proj => searchActive ? proj.convos.length > 0 : (proj.convos.length > 0 || projects?.[proj.cwdRoot]?.manual))
          .map((proj) => (
          <ProjectGroup
            key={proj.cwdRoot}
            project={proj}
            active={active}
            onSelect={onSelect}
            onDelete={onDelete}
            onNewInProject={onNewInProject}
            onToggleCollapse={onToggleProjectCollapse}
            onHideProject={onHideProject}
            searchActive={searchActive}
            multicaModels={multicaModels}
          />
        ))
        }

        {/* Drafts section */}
        {drafts.length > 0 && (
          <div style={{ marginBottom: 2 }}>
            {/* Drafts header */}
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
              }}
              onClick={onToggleDraftsCollapsed}
              onMouseEnter={(e) => {
                setDraftsHeaderHovered(true);
                applyPaneInteractionStyle(e.currentTarget, "hover");
              }}
              onMouseLeave={(e) => {
                setDraftsHeaderHovered(false);
                applyPaneInteractionStyle(e.currentTarget, "idle");
              }}
            >
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  color: "rgba(255,255,255,0.25)",
                  transform: `rotate(${(searchActive || !draftsCollapsed) ? 90 : 0}deg)`,
                  transition: "transform .15s",
                  flexShrink: 0,
                }}
              >
                <ChevronRight size={12} strokeWidth={1.5} />
              </span>
              <span
                style={{
                  fontSize: s(11),
                  fontFamily: "'JetBrains Mono', monospace",
                  color: "rgba(255,255,255,0.4)",
                  letterSpacing: ".04em",
                }}
              >
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
                    opacity: draftsHeaderHovered ? 1 : 0,
                    pointerEvents: draftsHeaderHovered ? "auto" : "none",
                    transition: "opacity .15s",
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => onNewInProject(null)}
                    title="New draft chat"
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
                </div>
              </div>
            </div>

            {/* Draft conversation rows */}
            {(searchActive || !draftsCollapsed) && drafts.map((c, i) => {
              const isActive = c.id === active;
              const cm = getMOrMulticaFallback(c.model, multicaModels);

              return (
                <div
                  key={c.id}
                  onClick={() => onSelect(c.id)}
                  style={{
                    padding: "12px 12px 12px 28px",
                    borderRadius: 8,
                    cursor: "pointer",
                    marginBottom: 1,
                    transition: "all .12s",
                    animation: `fadeSlide .2s ease ${i * 0.03}s both`,
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
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          marginBottom: 4,
                          display: "flex",
                          alignItems: "center",
                          minWidth: 0,
                        }}
                      >
                        <span
                          style={{
                            fontSize: s(12.5),
                            color: isActive ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.45)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            fontFamily: "system-ui,sans-serif",
                            flex: 1,
                            minWidth: 0,
                          }}
                        >
                          {c.title}
                        </span>
                        {(c.tags || []).slice(0, 2).map((t) => (
                          <span key={t} style={{
                            fontSize: 9, padding: "1px 5px", borderRadius: 4, marginLeft: 4,
                            background: "rgba(180,220,255,0.12)", color: "rgba(180,220,255,0.85)",
                            fontFamily: "monospace", flexShrink: 0,
                          }}>{t}</span>
                        ))}
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
        )}
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
            color: "rgba(255,255,255,0.45)",
            letterSpacing: ".08em",
            padding: 0,
            transition: "color .2s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.72)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.45)"; }}
        >
          <FolderOpen size={10} strokeWidth={1.5} />
          {cwdShort || "SELECT FOLDER"}
        </button>
        <span style={{ fontSize: s(8), fontFamily: "'JetBrains Mono',monospace", color: "rgba(255,255,255,0.38)", letterSpacing: ".06em" }}>
          {convos.length} CHATS
        </span>
      </div>
    </div>
  );
}
