import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useFontScale } from "../contexts/FontSizeContext";
import { createTranslator } from "../i18n";
import { Plus, Search, Trash2, PanelLeftClose, PanelLeftOpen, FolderOpen, Settings as SettingsIcon, ChevronRight, Workflow, FolderPlus } from "lucide-react";
import WindowDragSpacer from "./WindowDragSpacer";
import { SIDEBAR_TOGGLE_SIZE, SIDEBAR_TOGGLE_TOP, WINDOW_DRAG_HEIGHT } from "../windowChrome";
import ProjectGroup from "./ProjectGroup";
import { getMOrMulticaFallback } from "../data/models";
import { applyPaneInteractionStyle, getPaneInteractionStyle } from "../utils/paneSurface";

const COLLAPSE_PERSIST_DELAY_MS = 1200;

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
        latestTs: null,
      };
    }
    groups[root].convos.push(c);
    groups[root].latestTs = Math.max(groups[root].latestTs || 0, c.ts || 0);
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
        latestTs: null,
      };
    }
  }
  const sorted = Object.values(groups).sort((a, b) => {
    const aTs = a.latestTs || 0;
    const bTs = b.latestTs || 0;
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

  return { projectGroups: sorted, drafts };
}

function IconRailBtn({ onClick, title, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 40, height: 40, borderRadius: 8,
        background: "none", border: "none", cursor: "pointer",
        color: "color-mix(in srgb, var(--text-primary) 55%, transparent)", transition: "background .15s, color .15s",
        WebkitAppRegion: "no-drag",
        flexShrink: 0,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--control-bg)"; e.currentTarget.style.color = "color-mix(in srgb, var(--text-primary) 88%, transparent)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "color-mix(in srgb, var(--text-primary) 55%, transparent)"; }}
    >
      {children}
    </button>
  );
}

function GitHubIcon({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export default function Sidebar({ convos, active, onSelect, onNew, onDelete, onToggleSidebar, cwd, onPickFolder, onOpenSettings, onOpenProjectManager, onOpenDispatch, onOpenNewProject, projects, draftsPath, onToggleProjectCollapse, onHideProject, onNewInProject, draftsCollapsed, onToggleDraftsCollapsed, developerMode = true, multicaModels = [], isOpen = true, windowsChrome = false, hasUpdate = false, locale = "en-US" }) {
  const s = useFontScale();
  const t = useMemo(() => createTranslator(locale), [locale]);
  const [search, setSearch]     = useState("");
  const [searchFocused, setSF]  = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [draftsHeaderHovered, setDraftsHeaderHovered] = useState(false);
  const projectsRef = useRef(projects);
  const collapsedOverridesRef = useRef({});
  const pendingCollapsePersistRef = useRef({});
  const collapsePersistTimerRef = useRef(null);
  const [collapsedOverrides, setCollapsedOverrides] = useState({});

  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  useEffect(() => {
    collapsedOverridesRef.current = collapsedOverrides;
  }, [collapsedOverrides]);

  useEffect(() => (
    () => {
      if (collapsePersistTimerRef.current) {
        clearTimeout(collapsePersistTimerRef.current);
      }
    }
  ), []);

  const searchQuery = search.toLowerCase();
  const filtered = useMemo(
    () => convos.filter((c) => c.title.toLowerCase().includes(searchQuery)),
    [convos, searchQuery]
  );

  const { projectGroups, drafts } = useMemo(() => {
    return groupConvosByProject(filtered, projects, draftsPath);
  }, [draftsPath, filtered, projects]);
  const renderedProjectGroups = useMemo(
    () => projectGroups.map((proj) => {
      if (!Object.prototype.hasOwnProperty.call(collapsedOverrides, proj.cwdRoot)) return proj;
      const collapsed = collapsedOverrides[proj.cwdRoot];
      return collapsed === proj.collapsed ? proj : { ...proj, collapsed };
    }),
    [collapsedOverrides, projectGroups]
  );
  const handleProjectCollapse = useCallback((cwdRoot) => {
    const root = getMainRepoRoot(cwdRoot);
    const current =
      collapsedOverridesRef.current[root] ??
      projectsRef.current?.[root]?.collapsed ??
      false;
    const collapsed = !current;
    const nextOverrides = { ...collapsedOverridesRef.current, [root]: collapsed };
    collapsedOverridesRef.current = nextOverrides;
    setCollapsedOverrides(nextOverrides);

    pendingCollapsePersistRef.current[root] = collapsed;
    if (collapsePersistTimerRef.current) {
      clearTimeout(collapsePersistTimerRef.current);
    }
    collapsePersistTimerRef.current = setTimeout(() => {
      const pending = pendingCollapsePersistRef.current;
      pendingCollapsePersistRef.current = {};
      collapsePersistTimerRef.current = null;
      for (const [projectRoot, nextCollapsed] of Object.entries(pending)) {
        onToggleProjectCollapse(projectRoot, nextCollapsed);
      }
    }, COLLAPSE_PERSIST_DELAY_MS);
  }, [onToggleProjectCollapse]);
  const searchActive = search.length > 0;

  const cwdShort = cwd ? (() => {
    const parts = cwd.split("/");
    const wtIdx = parts.indexOf(".worktrees");
    if (wtIdx >= 0 && wtIdx + 1 < parts.length) {
      return `${parts[wtIdx - 1]} / ${parts[wtIdx + 1]}`;
    }
    return parts.slice(-2).join("/");
  })() : null;

  // ── Icon-rail collapsed state ──────────────────────────────────────────────
  if (windowsChrome && !isOpen) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", alignItems: "center", WebkitAppRegion: "no-drag" }}>
        {/* Drag region: logo on top, expand toggle below */}
        <div style={{ height: WINDOW_DRAG_HEIGHT, width: "100%", WebkitAppRegion: "drag", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 0, position: "relative" }}>
          <button
            onClick={() => window.open("https://ensuechat.com")}
            title="Ensue Chat"
            style={{
              position: "absolute", top: 10,
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 24, height: 24, padding: 0,
              background: "none", border: "none", cursor: "pointer",
              borderRadius: 6, opacity: 0.82, transition: "opacity .15s, transform .15s",
              WebkitAppRegion: "no-drag",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = "scale(1.08)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.82"; e.currentTarget.style.transform = "scale(1)"; }}
          >
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} style={{ width: 24, height: 24, borderRadius: 5, display: "block" }} draggable={false} />
          </button>
        </div>

        {/* Action icons */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "6px 0" }}>
          <IconRailBtn onClick={onToggleSidebar} title={t("chromeRail.expandSidebar")}><PanelLeftOpen size={17} strokeWidth={1.5} /></IconRailBtn>
          <IconRailBtn onClick={onNew} title={t("sidebar.newChat")}><Plus size={17} strokeWidth={1.5} /></IconRailBtn>
          <IconRailBtn onClick={onOpenDispatch} title={t("sidebar.dispatch")}><Workflow size={17} strokeWidth={1.5} /></IconRailBtn>
          <IconRailBtn onClick={onOpenNewProject} title={t("sidebar.newProject")}><FolderPlus size={17} strokeWidth={1.5} /></IconRailBtn>
          {developerMode && <IconRailBtn onClick={onOpenProjectManager} title={t("sidebar.githubProjects")}><GitHubIcon size={17} /></IconRailBtn>}
        </div>

        <div style={{ flex: 1 }} />

        {/* Footer icons */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "10px 0 14px" }}>
          <IconRailBtn onClick={onPickFolder} title={cwdShort || t("sidebar.selectFolder")}><FolderOpen size={16} strokeWidth={1.5} /></IconRailBtn>
          <div style={{ position: "relative" }}>
            <IconRailBtn onClick={onOpenSettings} title={t("settings.title")}><SettingsIcon size={16} strokeWidth={1.5} /></IconRailBtn>
            {hasUpdate && (
              <span style={{
                position: "absolute",
                top: 4,
                right: 4,
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#FF8C42",
                boxShadow: "0 0 5px rgba(255,140,66,0.8)",
                pointerEvents: "none",
              }} />
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {windowsChrome ? (
        <div
          style={{
            height: WINDOW_DRAG_HEIGHT,
            WebkitAppRegion: "drag",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            paddingLeft: 18,
            position: "relative",
          }}
        >
          <button
            onClick={() => window.open("https://ensuechat.com")}
            title="RayLine"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: 0,
              background: "none",
              border: "none",
              cursor: "pointer",
              opacity: 0.82,
              transition: "opacity .15s",
              WebkitAppRegion: "no-drag",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.82"; }}
          >
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} style={{ width: 22, height: 22, borderRadius: 5, display: "block", flexShrink: 0 }} draggable={false} />
            <span style={{
              fontFamily: "'Barlow Condensed', 'Inter Tight', sans-serif",
              fontWeight: 600,
              fontSize: 18,
              letterSpacing: "0.12em",
              color: "color-mix(in srgb, var(--text-primary) 95%, transparent)",
              userSelect: "none",
              lineHeight: 1,
            }}>
              R<span style={{ color: "#FF4422", letterSpacing: 0 }}>/</span>YLINE<span style={{ color: "#FF4422", letterSpacing: 0 }}>.</span>
            </span>
          </button>

          <button
            onClick={onToggleSidebar}
            style={{
              position: "absolute",
              top: SIDEBAR_TOGGLE_TOP,
              right: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: SIDEBAR_TOGGLE_SIZE,
              height: SIDEBAR_TOGGLE_SIZE,
              borderRadius: 6,
              background: "none",
              border: "none",
              color: "color-mix(in srgb, var(--text-primary) 40%, transparent)",
              cursor: "pointer",
              transition: "all .2s",
              WebkitAppRegion: "no-drag",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "color-mix(in srgb, var(--text-primary) 70%, transparent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "color-mix(in srgb, var(--text-primary) 40%, transparent)";
            }}
          >
            <PanelLeftClose size={17} strokeWidth={1.5} />
          </button>
        </div>
      ) : (
        <WindowDragSpacer />
      )}

      {/* Menu items */}
      <div style={{ padding: "0 12px 14px", display: "flex", flexDirection: "column", gap: 2, WebkitAppRegion: "no-drag" }}>
        <button
          onClick={onNew}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 10px", borderRadius: 7,
            background: "none", border: "none", cursor: "pointer",
            color: "color-mix(in srgb, var(--text-primary) 60%, transparent)", fontSize: s(12),
            fontFamily: "system-ui, sans-serif", transition: "all .15s",
            textAlign: "left",
          }}
          onMouseEnter={(e) => { applyPaneInteractionStyle(e.currentTarget, "hover"); e.currentTarget.style.color = "color-mix(in srgb, var(--text-primary) 87%, transparent)"; }}
          onMouseLeave={(e) => { applyPaneInteractionStyle(e.currentTarget, "idle"); e.currentTarget.style.color = "color-mix(in srgb, var(--text-primary) 60%, transparent)"; }}
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
            color: "color-mix(in srgb, var(--text-primary) 60%, transparent)", fontSize: s(12),
            fontFamily: "system-ui, sans-serif", transition: "all .15s",
            textAlign: "left",
          }}
          onMouseEnter={(e) => { applyPaneInteractionStyle(e.currentTarget, "hover"); e.currentTarget.style.color = "color-mix(in srgb, var(--text-primary) 87%, transparent)"; }}
          onMouseLeave={(e) => { applyPaneInteractionStyle(e.currentTarget, "idle"); e.currentTarget.style.color = "color-mix(in srgb, var(--text-primary) 60%, transparent)"; }}
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
            color: "color-mix(in srgb, var(--text-primary) 60%, transparent)", fontSize: s(12),
            fontFamily: "system-ui, sans-serif", transition: "all .15s",
            textAlign: "left",
          }}
          onMouseEnter={(e) => { applyPaneInteractionStyle(e.currentTarget, "hover"); e.currentTarget.style.color = "color-mix(in srgb, var(--text-primary) 87%, transparent)"; }}
          onMouseLeave={(e) => { applyPaneInteractionStyle(e.currentTarget, "idle"); e.currentTarget.style.color = "color-mix(in srgb, var(--text-primary) 60%, transparent)"; }}
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
              color: "color-mix(in srgb, var(--text-primary) 60%, transparent)", fontSize: s(12),
              fontFamily: "system-ui, sans-serif", transition: "all .15s",
              textAlign: "left",
            }}
            onMouseEnter={(e) => { applyPaneInteractionStyle(e.currentTarget, "hover"); e.currentTarget.style.color = "color-mix(in srgb, var(--text-primary) 87%, transparent)"; }}
            onMouseLeave={(e) => { applyPaneInteractionStyle(e.currentTarget, "idle"); e.currentTarget.style.color = "color-mix(in srgb, var(--text-primary) 60%, transparent)"; }}
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
            color: "color-mix(in srgb, var(--text-primary) 60%, transparent)", fontSize: s(12),
            fontFamily: "system-ui, sans-serif", transition: "all .15s",
            textAlign: "left",
          }}
          onMouseEnter={(e) => { applyPaneInteractionStyle(e.currentTarget, "hover"); e.currentTarget.style.color = "color-mix(in srgb, var(--text-primary) 87%, transparent)"; }}
          onMouseLeave={(e) => { applyPaneInteractionStyle(e.currentTarget, "idle"); e.currentTarget.style.color = "color-mix(in srgb, var(--text-primary) 60%, transparent)"; }}
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
            border: "1px solid " + (searchFocused ? "var(--control-border)" : "var(--pane-border)"),
            borderRadius: 8,
            transition: "background .2s, color .2s, border-color .2s, box-shadow .2s, backdrop-filter .2s",
            ...(searchFocused ? getPaneInteractionStyle("active") : {
              background: "var(--pane-elevated)",
              backdropFilter: "none",
              boxShadow: "none",
            }),
          }}
        >
          <span style={{ color: "color-mix(in srgb, var(--text-primary) 49%, transparent)", flexShrink: 0, display: "flex" }}>
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
              color: "color-mix(in srgb, var(--text-primary) 87%, transparent)",
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
              color: "color-mix(in srgb, var(--text-primary) 16%, transparent)",
              letterSpacing: ".08em",
            }}>
              {t("sidebar.noConversations")}
            </div>
            <div style={{
              fontSize: s(10),
              color: "color-mix(in srgb, var(--text-primary) 11%, transparent)",
              fontFamily: "system-ui,sans-serif",
            }}>
              {t("sidebar.noConversationsHint")}
            </div>
          </div>
        )}
        {/* Project groups */}
        {renderedProjectGroups
          .filter(proj => searchActive ? proj.convos.length > 0 : (proj.convos.length > 0 || projects?.[proj.cwdRoot]?.manual))
          .map((proj) => (
          <ProjectGroup
            key={proj.cwdRoot}
            project={proj}
            active={active}
            onSelect={onSelect}
            onDelete={onDelete}
            onNewInProject={onNewInProject}
            onToggleCollapse={handleProjectCollapse}
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
                  color: "color-mix(in srgb, var(--text-primary) 27%, transparent)",
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
                  color: "color-mix(in srgb, var(--text-primary) 43%, transparent)",
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
                      color: "color-mix(in srgb, var(--text-primary) 27%, transparent)",
                      cursor: "pointer",
                      padding: 3,
                      borderRadius: 4,
                      transition: "color .15s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "color-mix(in srgb, var(--text-primary) 71%, transparent)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "color-mix(in srgb, var(--text-primary) 27%, transparent)"; }}
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
                            color: isActive ? "var(--text-primary)" : "color-mix(in srgb, var(--text-primary) 49%, transparent)",
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
                          color: "color-mix(in srgb, var(--text-primary) 33%, transparent)",
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
                        style={{ background: "none", border: "none", color: "color-mix(in srgb, var(--text-primary) 27%, transparent)", cursor: "pointer", padding: 1, transition: "color .15s", display: "flex" }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(200,80,80,0.5)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = "color-mix(in srgb, var(--text-primary) 27%, transparent)"; }}
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
                        color: "color-mix(in srgb, var(--text-primary) 38%, transparent)",
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
                        {t("sidebar.running")}
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
          borderTop: "1px solid var(--control-border)",
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
            color: "color-mix(in srgb, var(--text-primary) 49%, transparent)",
            letterSpacing: ".08em",
            padding: 0,
            transition: "color .2s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "color-mix(in srgb, var(--text-primary) 78%, transparent)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "color-mix(in srgb, var(--text-primary) 49%, transparent)"; }}
        >
          <FolderOpen size={10} strokeWidth={1.5} />
          {cwdShort || t("sidebar.selectFolder")}
        </button>
        {windowsChrome && (
          <button
            onClick={onOpenSettings}
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 22,
              height: 22,
              borderRadius: 5,
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "color-mix(in srgb, var(--text-primary) 45%, transparent)",
              transition: "color .2s",
              padding: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "color-mix(in srgb, var(--text-primary) 72%, transparent)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "color-mix(in srgb, var(--text-primary) 45%, transparent)"; }}
          >
            <SettingsIcon size={12} strokeWidth={1.5} />
            {hasUpdate && (
              <span style={{
                position: "absolute",
                top: 0,
                right: 0,
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#FF8C42",
                boxShadow: "0 0 4px rgba(255,140,66,0.7)",
                pointerEvents: "none",
              }} />
            )}
          </button>
        )}
        <span style={{ fontSize: s(8), fontFamily: "'JetBrains Mono',monospace", color: "color-mix(in srgb, var(--text-primary) 41%, transparent)", letterSpacing: ".06em" }}>
          {t("sidebar.chatsCount", { value: convos.length })}
        </span>
      </div>
    </div>
  );
}
