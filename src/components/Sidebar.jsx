import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useFontScale } from "../contexts/FontSizeContext";
import { createTranslator } from "../i18n";
import { Plus, Search, Trash2, FolderOpen, ChevronRight, Workflow, FolderPlus } from "lucide-react";
import WindowDragSpacer from "./WindowDragSpacer";
import { WINDOW_DRAG_HEIGHT } from "../windowChrome";
import ProjectGroup from "./ProjectGroup";
import { getMOrMulticaFallback } from "../data/models";
import { applyPaneInteractionStyle, getPaneInteractionStyle } from "../utils/paneSurface";

const COLLAPSE_PERSIST_DELAY_MS = 1200;
const SEARCH_DEBOUNCE_MS = 120;
const SEARCH_CHUNK_SIZE = 4;

function getMainRepoRoot(dir) {
  if (!dir) return dir;
  const wtIdx = dir.indexOf("/.worktrees/");
  return wtIdx !== -1 ? dir.slice(0, wtIdx) : dir;
}

function waitForPaint() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function getSearchTokens(query) {
  return normalizeSearchText(query)
    .split(" ")
    .filter(Boolean);
}

function matchesSearch(text, tokens) {
  if (!tokens.length) return true;
  if (!text) return false;
  return tokens.every((token) => text.includes(token));
}

function stringifySearchValue(value) {
  if (typeof value === "string") return value;
  if (value == null) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getMessageSearchText(message) {
  if (!message || typeof message !== "object") return "";
  const chunks = [];

  if (typeof message.text === "string" && message.text.trim()) {
    chunks.push(message.text.trim());
  }
  if (typeof message.command === "string" && message.command.trim()) {
    chunks.push(message.command.trim());
  }
  if (Array.isArray(message.parts)) {
    for (const part of message.parts) {
      if (!part || typeof part !== "object") continue;
      if (typeof part.title === "string" && part.title.trim()) {
        chunks.push(part.title.trim());
      }
      if (typeof part.text === "string" && part.text.trim()) {
        chunks.push(part.text.trim());
      }
      if (part.result != null) {
        const resultText = stringifySearchValue(part.result).trim();
        if (resultText) chunks.push(resultText);
      }
      if (part.args != null) {
        const argsText = stringifySearchValue(part.args).trim();
        if (argsText) chunks.push(argsText);
      }
    }
  }

  return chunks.join("\n").trim();
}

function getConversationSearchSessionIds(conversation) {
  const ids = new Set();
  if (conversation?.sessionId) ids.add(conversation.sessionId);
  for (const session of conversation?.sessions || []) {
    if (session?.nativeSessionId) ids.add(session.nativeSessionId);
  }
  return [...ids];
}

function getConversationLocalSearchBody(conversation) {
  const chunks = [];
  if (typeof conversation?.lastPreview === "string" && conversation.lastPreview.trim()) {
    chunks.push(conversation.lastPreview.trim());
  }
  for (const message of conversation?.archivedMessages || []) {
    const text = getMessageSearchText(message);
    if (text) chunks.push(text);
  }
  return chunks.join("\n\n").trim();
}

function buildConversationSearchVersion(conversation) {
  return [
    conversation?.id || "",
    conversation?.title || "",
    conversation?.lastPreview || "",
    conversation?.ts || 0,
    conversation?.updatedAt || 0,
    Array.isArray(conversation?.archivedMessages) ? conversation.archivedMessages.length : 0,
    getConversationSearchSessionIds(conversation).join("|"),
  ].join("::");
}

function buildSearchExcerpt(sourceText, query, tokens, limit = 96) {
  const collapsed = String(sourceText || "").replace(/\s+/g, " ").trim();
  if (!collapsed) return "";

  const lower = collapsed.toLowerCase();
  let matchIndex = query ? lower.indexOf(query) : -1;
  let matchLength = matchIndex >= 0 ? query.length : 0;

  if (matchIndex < 0) {
    for (const token of tokens) {
      const idx = lower.indexOf(token);
      if (idx >= 0 && (matchIndex < 0 || idx < matchIndex)) {
        matchIndex = idx;
        matchLength = token.length;
      }
    }
  }

  if (matchIndex < 0) {
    return collapsed.length > limit ? `${collapsed.slice(0, limit - 1).trim()}…` : collapsed;
  }

  const desiredStart = Math.max(0, matchIndex - Math.floor((limit - Math.max(matchLength, 12)) / 2));
  const start = Math.min(desiredStart, Math.max(0, collapsed.length - limit));
  const end = Math.min(collapsed.length, start + limit);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < collapsed.length ? "…" : "";
  return `${prefix}${collapsed.slice(start, end).trim()}${suffix}`;
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
        context: meta.context || "",
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
        context: meta.context || "",
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


function GitHubIcon({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export default function Sidebar({ convos, active, onSelect, onNew, onDelete, onToggleSidebar, cwd, onPickFolder, onOpenSettings, onOpenProjectManager, onOpenDispatch, onOpenNewProject, projects, draftsPath, onToggleProjectCollapse, onHideProject, onEditProjectContext, onNewInProject, draftsCollapsed, onToggleDraftsCollapsed, developerMode = true, multicaModels = [], isOpen = true, windowsChrome = false, hasUpdate = false, locale = "en-US" }) {
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
  const [searchResults, setSearchResults] = useState(convos);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchCacheRef = useRef(new Map());
  const searchRunRef = useRef(0);

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

  useEffect(() => {
    const convoIds = new Set(convos.map((conversation) => conversation.id));
    for (const convoId of searchCacheRef.current.keys()) {
      if (!convoIds.has(convoId)) {
        searchCacheRef.current.delete(convoId);
      }
    }
  }, [convos]);

  const searchQuery = useMemo(() => normalizeSearchText(search), [search]);
  const searchActive = searchQuery.length > 0;

  const loadConversationSearchRecord = useCallback(async (conversation) => {
    const version = buildConversationSearchVersion(conversation);
    const cached = searchCacheRef.current.get(conversation.id);
    if (cached?.version === version) return cached;

    const titleText = String(conversation?.title || "").trim();
    const localBodyText = getConversationLocalSearchBody(conversation);
    const sessionIds = getConversationSearchSessionIds(conversation);

    let sessionBodyText = "";
    if (sessionIds.length > 0 && window.api?.loadSessionSearchText) {
      const sessionResults = await Promise.all(
        sessionIds.map((sessionId) =>
          window.api.loadSessionSearchText(sessionId).catch(() => null)
        )
      );
      sessionBodyText = sessionResults
        .map((result) => result?.text || "")
        .filter(Boolean)
        .join("\n\n")
        .trim();
    }

    const bodyText = [localBodyText, sessionBodyText].filter(Boolean).join("\n\n").trim();
    const record = {
      version,
      titleText,
      titleSearchText: normalizeSearchText(titleText),
      bodyText,
      bodySearchText: normalizeSearchText(bodyText),
    };
    searchCacheRef.current.set(conversation.id, record);
    return record;
  }, []);

  useEffect(() => {
    const runId = searchRunRef.current + 1;
    searchRunRef.current = runId;

    if (!searchActive) {
      setSearchLoading(false);
      setSearchResults(convos);
      return undefined;
    }

    setSearchLoading(true);
    setSearchResults([]);

    const tokens = getSearchTokens(searchQuery);
    let cancelled = false;

    const timeoutId = setTimeout(() => {
      void (async () => {
        await waitForPaint();

        if (cancelled || searchRunRef.current !== runId) return;

        const matches = [];
        for (let index = 0; index < convos.length; index += SEARCH_CHUNK_SIZE) {
          const chunk = convos.slice(index, index + SEARCH_CHUNK_SIZE);
          const resolvedChunk = await Promise.all(
            chunk.map(async (conversation) => {
              const record = await loadConversationSearchRecord(conversation);
              const titleMatch = matchesSearch(record.titleSearchText, tokens);
              const bodyMatch = matchesSearch(record.bodySearchText, tokens);
              if (!titleMatch && !bodyMatch) return null;

              const preview = bodyMatch
                ? buildSearchExcerpt(record.bodyText, searchQuery, tokens)
                : "";

              return {
                ...conversation,
                _searchPreview: preview || null,
              };
            })
          );

          if (cancelled || searchRunRef.current !== runId) return;

          for (const match of resolvedChunk) {
            if (match) matches.push(match);
          }

          await waitForPaint();
        }

        if (cancelled || searchRunRef.current !== runId) return;

        setSearchResults(matches);
        setSearchLoading(false);
      })().catch(() => {
        if (cancelled || searchRunRef.current !== runId) return;
        setSearchResults([]);
        setSearchLoading(false);
      });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [convos, loadConversationSearchRecord, searchActive, searchQuery]);

  const visibleConvos = searchActive ? searchResults : convos;

  const { projectGroups, drafts } = useMemo(() => {
    return groupConvosByProject(visibleConvos, projects, draftsPath);
  }, [draftsPath, projects, visibleConvos]);
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

  const searchResultCount = searchResults.length;
  const showSearchNoResults = searchActive && !searchLoading && searchResultCount === 0 && convos.length > 0;
  const showSearchLoadingState = searchActive && searchLoading;

  const cwdShort = cwd ? (() => {
    const parts = cwd.split(/[\\/]+/);
    const wtIdx = parts.indexOf(".worktrees");
    if (wtIdx >= 0 && wtIdx + 1 < parts.length) {
      return `${parts[wtIdx - 1]} / ${parts[wtIdx + 1]}`;
    }
    return parts.filter(Boolean).slice(-2).join("/");
  })() : null;

  // ── Windows collapsed: sidebar fully hidden; SidebarWindowsHeader overlay takes over ──
  if (windowsChrome && !isOpen) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {windowsChrome ? (
        /* SidebarWindowsHeader (fixed overlay) 自己提供拖拽区域，这里不再设 drag */
        <div style={{ height: WINDOW_DRAG_HEIGHT, flexShrink: 0 }} />
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
            fontFamily: "var(--font-ui)", transition: "all .15s",
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
            fontFamily: "var(--font-ui)", transition: "all .15s",
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
            fontFamily: "var(--font-ui)", transition: "all .15s",
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
              fontFamily: "var(--font-ui)", transition: "all .15s",
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
            fontFamily: "var(--font-ui)", transition: "all .15s",
            textAlign: "left",
          }}
          onMouseEnter={(e) => { applyPaneInteractionStyle(e.currentTarget, "hover"); e.currentTarget.style.color = "color-mix(in srgb, var(--text-primary) 87%, transparent)"; }}
          onMouseLeave={(e) => { applyPaneInteractionStyle(e.currentTarget, "idle"); e.currentTarget.style.color = "color-mix(in srgb, var(--text-primary) 60%, transparent)"; }}
        >
          <Search size={15} strokeWidth={1.5} />
          {t("sidebar.search")}
        </button>}
        {searchOpen && <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
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
              onBlur={() => { setSF(false); if (!search.trim()) { setSearchOpen(false); } }}
              autoFocus
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                color: "color-mix(in srgb, var(--text-primary) 87%, transparent)",
                fontSize: s(11),
                fontFamily: "var(--font-mono)",
              }}
            />
          </div>
          {searchActive && (
            <div
              style={{
                minHeight: 16,
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "0 2px 0 10px",
                fontSize: s(8.5),
                fontFamily: "var(--font-mono)",
                letterSpacing: ".08em",
                color: showSearchLoadingState
                  ? "color-mix(in srgb, var(--text-primary) 45%, transparent)"
                  : "color-mix(in srgb, var(--text-primary) 35%, transparent)",
              }}
            >
              {showSearchLoadingState ? (
                <>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {[0, 1, 2].map((index) => (
                      <span
                        key={index}
                        className="sidebar-search-loader-dot"
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: "50%",
                          background: "currentColor",
                          animationDelay: `${index * 0.12}s`,
                        }}
                      />
                    ))}
                  </span>
                  {t("sidebar.searchingChats")}
                </>
              ) : (
                searchResultCount === 0
                  ? t("sidebar.searchNoResults")
                  : t("sidebar.searchHits", { value: searchResultCount, suffix: searchResultCount === 1 ? "" : "S" })
              )}
            </div>
          )}
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
              fontFamily: "var(--font-mono)",
              color: "color-mix(in srgb, var(--text-primary) 16%, transparent)",
              letterSpacing: ".08em",
            }}>
              {t("sidebar.noConversations")}
            </div>
            <div style={{
              fontSize: s(10),
              color: "color-mix(in srgb, var(--text-primary) 11%, transparent)",
              fontFamily: "var(--font-ui)",
            }}>
              {t("sidebar.noConversationsHint")}
            </div>
          </div>
        )}
        {showSearchNoResults && (
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 180,
            gap: 8,
            padding: "40px 20px",
            textAlign: "center",
          }}>
            <div style={{
              fontSize: s(11),
              fontFamily: "var(--font-mono)",
              color: "color-mix(in srgb, var(--text-primary) 16%, transparent)",
              letterSpacing: ".08em",
            }}>
              {t("sidebar.searchNoResults")}
            </div>
            <div style={{
              fontSize: s(10),
              color: "color-mix(in srgb, var(--text-primary) 11%, transparent)",
              fontFamily: "var(--font-ui)",
            }}>
              {t("sidebar.searchNoResultsHint")}
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
            onEditContext={onEditProjectContext}
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
                  fontFamily: "var(--font-mono)",
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
                            fontFamily: "var(--font-ui)",
                            flex: 1,
                            minWidth: 0,
                          }}
                        >
                          {c.title}
                        </span>
                        {(c.tags || []).slice(0, 2).map((t) => (
                          <span key={t} style={{
                            fontSize: 9, padding: "1px 5px", borderRadius: 4, marginLeft: 4,
                            background: "color-mix(in srgb, var(--accent) 12%, transparent)",
                            color: "color-mix(in srgb, var(--accent) 85%, transparent)",
                            fontFamily: "var(--font-mono)", flexShrink: 0,
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
                          fontFamily: "var(--font-content)",
                          fontWeight: 300,
                        }}
                      >
                        {c._searchPreview || c.lastPreview || "Empty"}
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
                        fontFamily: "var(--font-mono)",
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
            fontFamily: "var(--font-mono)",
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
        <span style={{ fontSize: s(8), fontFamily: "var(--font-mono)", color: "color-mix(in srgb, var(--text-primary) 41%, transparent)", letterSpacing: ".06em" }}>
          {searchActive
            ? (
              searchLoading
                ? t("sidebar.chatsCount", { value: convos.length })
                : t("sidebar.searchHits", { value: searchResultCount, suffix: searchResultCount === 1 ? "" : "S" })
            )
            : t("sidebar.chatsCount", { value: convos.length })}
        </span>
      </div>
    </div>
  );
}
