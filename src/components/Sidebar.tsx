import { memo, useCallback, useMemo, useState, type MouseEvent } from "react";
import { useStableCallback } from "../hooks/useStableCallback";
import { WINDOW_DRAG_HEIGHT } from "../windowChrome";
import ProjectGroup from "./ProjectGroup";
import WindowDragSpacer from "./WindowDragSpacer";
import { useFontScale } from "../contexts/FontSizeContext";
import { useLocaleTranslator } from "./sidebar/useLocaleTranslator";
import DraftsSection from "./sidebar/DraftsSection";
import {
  applyCollapsedOverrides,
  formatCwdShort,
  groupConvosByProject,
  isProjectGroupListed,
} from "./sidebar/projectGrouping";
import { createArrayStabilizer } from "./sidebar/rowStability";
import SidebarFooter from "./sidebar/SidebarFooter";
import SidebarMenu, { type SearchStatus } from "./sidebar/SidebarMenu";
import SidebarNotice from "./sidebar/SidebarNotice";
import type {
  DeleteConversation,
  ExtraModels,
  ProjectsMeta,
  SelectConversation,
  SidebarConversation,
} from "./sidebar/types";
import { useProjectCollapse } from "./sidebar/useProjectCollapse";
import { useSidebarSearch } from "./sidebar/useSidebarSearch";

export type { SidebarConversation } from "./sidebar/types";

const NO_MODELS: ExtraModels = [];

export interface SidebarProps {
  /** Sidebar rows; reuse row objects across renders so memoized rows can skip. */
  convos: readonly SidebarConversation[];
  active: string | null | undefined;
  onSelect: SelectConversation;
  onDelete: DeleteConversation;
  onNew?: () => void;
  /** Footer folder label source. */
  cwd?: string | null;
  onPickFolder?: () => void;
  onOpenProjectManager?: () => void;
  onOpenDispatch?: () => void;
  onOpenNewProject?: () => void;
  projects?: ProjectsMeta | null;
  draftsPath?: string | null;
  /** Called (debounced) with the new collapsed state of a project root. */
  onToggleProjectCollapse: (cwdRoot: string, collapsed: boolean) => void;
  onHideProject: (cwdRoot: string) => void;
  onEditProjectContext?: (cwdRoot: string, context: string) => void;
  /** New chat preselecting a project root; null = drafts. */
  onNewInProject: (cwdRoot: string | null) => void;
  draftsCollapsed?: boolean;
  onToggleDraftsCollapsed?: () => void;
  developerMode?: boolean;
  multicaModels?: ExtraModels;
  /** Only meaningful with `windowsChrome`: a closed Windows sidebar renders nothing. */
  isOpen?: boolean;
  windowsChrome?: boolean;
  locale?: string;
  /** Accepted for App compatibility; handled by SidebarChromeRail / SidebarWindowsHeader. */
  onToggleSidebar?: () => void;
  onOpenSettings?: () => void;
  hasUpdate?: boolean;
}

function Sidebar({
  convos,
  active,
  onSelect,
  onNew,
  onDelete,
  cwd,
  onPickFolder,
  onOpenProjectManager,
  onOpenDispatch,
  onOpenNewProject,
  projects,
  draftsPath,
  onToggleProjectCollapse,
  onHideProject,
  onEditProjectContext,
  onNewInProject,
  draftsCollapsed = false,
  onToggleDraftsCollapsed,
  developerMode = true,
  multicaModels = NO_MODELS,
  isOpen = true,
  windowsChrome = false,
  locale = "en-US",
}: SidebarProps) {
  const s = useFontScale();
  const t = useLocaleTranslator(locale);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  // App hands over a new array on every stream flush; keep its identity while
  // the rows themselves are unchanged so grouping and search keys stay put.
  const [stabilizeRows] = useState(() => createArrayStabilizer<SidebarConversation>());
  const rows = useMemo(() => stabilizeRows(convos), [convos, stabilizeRows]);

  const searchState = useSidebarSearch(rows, search);
  const searchActive = searchState.active;
  const visibleConvos = searchActive ? searchState.results : rows;

  const { projectGroups, drafts } = useMemo(
    () => groupConvosByProject(visibleConvos, projects, draftsPath),
    [draftsPath, projects, visibleConvos],
  );
  const collapse = useProjectCollapse(projects, onToggleProjectCollapse);
  const listedGroups = useMemo(
    () =>
      applyCollapsedOverrides(projectGroups, collapse.overrides).filter((group) =>
        isProjectGroupListed(group, searchActive, projects),
      ),
    [collapse.overrides, projectGroups, projects, searchActive],
  );

  // Stable identities for memoized children regardless of App's callbacks.
  const handleSelect = useStableCallback((id: string) => onSelect(id));
  const handleDelete = useStableCallback((id: string, event: MouseEvent) => onDelete(id, event));
  const handleNewInProject = useStableCallback((cwdRoot: string | null) => onNewInProject(cwdRoot));
  const handleHideProject = useStableCallback((cwdRoot: string) => onHideProject(cwdRoot));
  const handleEditContext = useStableCallback((cwdRoot: string, context: string) =>
    onEditProjectContext?.(cwdRoot, context),
  );
  const handleToggleDrafts = useStableCallback(() => onToggleDraftsCollapsed?.());
  const handleNew = useStableCallback(() => onNew?.());
  const handleOpenDispatch = useStableCallback(() => onOpenDispatch?.());
  const handleOpenNewProject = useStableCallback(() => onOpenNewProject?.());
  const handleOpenProjectManager = useStableCallback(() => onOpenProjectManager?.());
  const handlePickFolder = useStableCallback(() => onPickFolder?.());
  const handleNewDraft = useCallback(() => handleNewInProject(null), [handleNewInProject]);
  const openSearch = useCallback(() => setSearchOpen(true), []);
  const dismissSearch = useCallback(() => setSearchOpen(false), []);

  const resultCount = searchState.results.length;
  const searchLoading = searchState.loading;
  const searchStatus = useMemo<SearchStatus>(
    () => ({ active: searchActive, loading: searchLoading, resultCount }),
    [resultCount, searchActive, searchLoading],
  );

  // Windows with the sidebar collapsed: SidebarWindowsHeader's overlay takes over.
  if (windowsChrome && !isOpen) return null;

  const showSearchNoResults = searchActive && !searchLoading && resultCount === 0 && convos.length > 0;
  const hitsLabel = t("sidebar.searchHits", { value: resultCount, suffix: resultCount === 1 ? "" : "S" });
  const countLabel = searchActive && !searchLoading ? hitsLabel : t("sidebar.chatsCount", { value: convos.length });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {windowsChrome ? (
        // SidebarWindowsHeader (fixed overlay) provides its own drag region.
        <div style={{ height: WINDOW_DRAG_HEIGHT, flexShrink: 0 }} />
      ) : (
        <WindowDragSpacer />
      )}

      <SidebarMenu
        s={s}
        t={t}
        developerMode={developerMode}
        hasConvos={convos.length > 0}
        searchOpen={searchOpen}
        searchValue={search}
        searchStatus={searchStatus}
        onNew={handleNew}
        onOpenDispatch={handleOpenDispatch}
        onOpenNewProject={handleOpenNewProject}
        onOpenProjectManager={handleOpenProjectManager}
        onOpenSearch={openSearch}
        onSearchChange={setSearch}
        onDismissSearch={dismissSearch}
      />

      <div style={{ flex: 1, overflowY: "auto", padding: "2px 6px" }}>
        {convos.length === 0 && (
          <SidebarNotice s={s} fill title={t("sidebar.noConversations")} hint={t("sidebar.noConversationsHint")} />
        )}
        {showSearchNoResults && (
          <SidebarNotice s={s} title={t("sidebar.searchNoResults")} hint={t("sidebar.searchNoResultsHint")} />
        )}

        {listedGroups.map((project) => (
          <ProjectGroup
            key={project.cwdRoot}
            project={project}
            active={active}
            onSelect={handleSelect}
            onDelete={handleDelete}
            onNewInProject={handleNewInProject}
            onToggleCollapse={collapse.toggle}
            onHideProject={handleHideProject}
            onEditContext={handleEditContext}
            searchActive={searchActive}
            multicaModels={multicaModels}
            locale={locale}
          />
        ))}

        {drafts.length > 0 && (
          <DraftsSection
            drafts={drafts}
            active={active}
            expanded={searchActive || !draftsCollapsed}
            multicaModels={multicaModels}
            s={s}
            t={t}
            onToggleCollapsed={handleToggleDrafts}
            onNewDraft={handleNewDraft}
            onSelect={handleSelect}
            onDelete={handleDelete}
          />
        )}
      </div>

      <SidebarFooter
        s={s}
        folderLabel={formatCwdShort(cwd) || t("sidebar.selectFolder")}
        countLabel={countLabel}
        onPickFolder={handlePickFolder}
      />
    </div>
  );
}

export default memo(Sidebar);
