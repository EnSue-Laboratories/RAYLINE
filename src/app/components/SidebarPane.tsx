import { memo } from "react";
import { appSettingsStore, clampNumber, setAppSetting, useAppSetting } from "../../store/appSettings";
import { convoListStore, useActiveId } from "../../store/convoList";
import { useStore } from "../../store/createStore";
import { getPaneSurfaceStyle } from "../../utils/paneSurface";
import { usePrefersReducedMotion } from "../../hooks/useWindowActivity";
import { deleteConversation, pickFolder } from "../actions/conversations";
import { openNewChat, openNewChatInProject } from "../actions/create";
import { selectConversation } from "../actions/navigation";
import { editProjectContext, hideProject, toggleProjectCollapse } from "../actions/projects";
import { useSidebarRows } from "../derived/store";
import { getApi } from "../lib/api";
import { useModelsField } from "../stores/models";
import { patchUi, uiStore, useUi } from "../stores/ui";
import { resolveTerminalCwd } from "../actions/terminal";
import Sidebar from "../../components/Sidebar";

export const SIDEBAR_WIDTH = 264;
const WINDOWS_SIDEBAR_WIDTH = 220;

const toggleSidebar = () => patchUi({ sidebarOpen: !uiStore.getState().sidebarOpen });
const openDispatch = () => patchUi({ showDispatchCard: true });
const openSettings = () => patchUi({ showSettings: true });
const openNewProject = () => patchUi({ showNewProject: true });
const openProjectManager = () => getApi()?.openProjectManager();
const toggleDraftsCollapsed = () => setAppSetting("draftsCollapsed", (prev) => !prev);

function selectActiveCwd(state: { convos: { id: string; cwd?: string | null }[]; activeId: string | null }): string | null | undefined {
  if (!state.activeId) return undefined;
  const active = state.convos.find((c) => c.id === state.activeId);
  return active ? active.cwd : undefined;
}

function selectHasWallpaper(state: { wallpaper: { dataUrl: string | null } | null }): boolean {
  return Boolean(state.wallpaper?.dataUrl);
}

/** Sidebar column (width/visibility, pane surface) + the memoized Sidebar. */
export const SidebarPane = memo(function SidebarPane({ windowsChrome }: { windowsChrome: boolean }) {
  const sidebarOpen = useUi("sidebarOpen");
  const draftsPath = useUi("draftsPath");
  const hasUpdate = useUi("hasUpdate");
  const activeId = useActiveId();
  const rows = useSidebarRows();
  const locale = useAppSetting("locale");
  const projects = useAppSetting("projects");
  const draftsCollapsed = useAppSetting("draftsCollapsed");
  const developerMode = useAppSetting("developerMode");
  const sidebarActiveOpacity = useAppSetting("sidebarActiveOpacity");
  const appCwd = useAppSetting("cwd");
  const hasWallpaper = useStore(appSettingsStore, selectHasWallpaper);
  const activeCwd = useStore(convoListStore, selectActiveCwd);
  const availableModels = useModelsField("availableModels");
  const prefersReducedMotion = usePrefersReducedMotion();

  const sidebarWidth = sidebarOpen ? (windowsChrome ? WINDOWS_SIDEBAR_WIDTH : SIDEBAR_WIDTH) : 0;

  return (
    <div
      style={{
        width: sidebarWidth,
        minWidth: sidebarWidth,
        borderRight: `1px solid ${sidebarOpen ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0)"}`,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        zIndex: 10,
        flexShrink: 0,
        ...getPaneSurfaceStyle(hasWallpaper, {
          hoverOpacity: clampNumber(sidebarActiveOpacity * 0.6, 0.8, sidebarActiveOpacity, sidebarActiveOpacity),
          activeOpacity: sidebarActiveOpacity,
        }),
        backdropFilter: hasWallpaper ? "saturate(1.1)" : "none",
        transition: prefersReducedMotion ? "none" : "border-color .18s ease",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden={!windowsChrome && !sidebarOpen}
        style={{
          width: windowsChrome ? "100%" : SIDEBAR_WIDTH,
          minWidth: windowsChrome ? "100%" : SIDEBAR_WIDTH,
          height: "100%",
          opacity: sidebarOpen ? 1 : 0,
          transform: sidebarOpen ? "translateX(0)" : "translateX(-12px)",
          transition: prefersReducedMotion ? "none" : "opacity .16s ease, transform .22s cubic-bezier(.16,1,.3,1)",
          pointerEvents: windowsChrome || sidebarOpen ? "auto" : "none",
        }}
      >
        <Sidebar
          convos={rows}
          active={activeId}
          onSelect={selectConversation}
          onNew={openNewChat}
          onOpenDispatch={openDispatch}
          onDelete={deleteConversation}
          onToggleSidebar={toggleSidebar}
          isOpen={windowsChrome ? sidebarOpen : true}
          windowsChrome={windowsChrome}
          locale={locale}
          cwd={resolveTerminalCwd(activeCwd, draftsPath, appCwd)}
          onPickFolder={pickFolder}
          onOpenSettings={openSettings}
          onOpenProjectManager={openProjectManager}
          onOpenNewProject={openNewProject}
          projects={projects}
          draftsPath={draftsPath}
          onToggleProjectCollapse={toggleProjectCollapse}
          onHideProject={hideProject}
          onEditProjectContext={editProjectContext}
          onNewInProject={openNewChatInProject}
          draftsCollapsed={draftsCollapsed}
          onToggleDraftsCollapsed={toggleDraftsCollapsed}
          developerMode={developerMode}
          multicaModels={availableModels}
          hasUpdate={hasUpdate}
        />
      </div>
    </div>
  );
});
