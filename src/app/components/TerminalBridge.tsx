import { memo, useCallback, useEffect, useLayoutEffect } from "react";
import { useAppSetting } from "../../store/appSettings";
import { useStore } from "../../store/createStore";
import { convoListStore } from "../../store/convoList";
import TerminalDrawer from "../../components/TerminalDrawer";
import useTerminal from "../../hooks/useTerminal";
import { getApi } from "../lib/api";
import { resolveTerminalCwd, toggleSidebarTerminalDrawer } from "../actions/terminal";
import { getTerminalApi, publishTerminal } from "../stores/terminal";
import { patchUi, useUi } from "../stores/ui";
import type { TerminalCreateOptions } from "@shared/terminal/types";

function selectActiveCwd(state: { convos: { id: string; cwd?: string | null }[]; activeId: string | null }): string | null | undefined {
  if (!state.activeId) return undefined;
  const active = state.convos.find((c) => c.id === state.activeId);
  return active ? active.cwd : undefined;
}

/**
 * Owns `useTerminal()` (which polls sessions) so its updates re-render only
 * this subtree. Publishes the API + session count/window state for the chat
 * header and handlers, keeps the terminal surface preference in sync, and
 * renders the optional sidebar drawer.
 */
export const TerminalBridge = memo(function TerminalBridge() {
  const terminal = useTerminal();
  const sidebarTerminalEnabled = useAppSetting("sidebarTerminalEnabled");
  const drawerOpen = useUi("sidebarTerminalOpen");
  const draftsPath = useUi("draftsPath");
  const platform = useUi("platform");
  const wallpaper = useAppSetting("wallpaper");
  const appCwd = useAppSetting("cwd");
  const activeCwd = useStore(convoListStore, selectActiveCwd);
  const cwd = resolveTerminalCwd(activeCwd, draftsPath, appCwd);

  useLayoutEffect(() => {
    publishTerminal(terminal);
  });

  useEffect(() => {
    if (sidebarTerminalEnabled) void getTerminalApi()?.closeWindow();
    else patchUi({ sidebarTerminalOpen: false });
    void getApi()?.setTerminalSurfacePreference({ sidebarTerminalEnabled });
  }, [sidebarTerminalEnabled]);

  useEffect(() => {
    const api = getApi();
    if (!api || typeof api.onTerminalSidebarRevealRequest !== "function") return undefined;
    return api.onTerminalSidebarRevealRequest(() => {
      const term = getTerminalApi();
      if (sidebarTerminalEnabled) {
        void term?.closeWindow();
        patchUi({ sidebarTerminalOpen: true });
        return;
      }
      void term?.openWindow();
    });
  }, [sidebarTerminalEnabled]);

  const createSidebarSession = useCallback(
    (opts: TerminalCreateOptions) => getTerminalApi()?.createSession({ ...opts, reveal: false }),
    [],
  );

  if (!sidebarTerminalEnabled) return null;
  return (
    <TerminalDrawer
      sessions={terminal.sessions}
      activeSession={terminal.activeSession}
      onSelectSession={terminal.setActiveSession}
      onCreateSession={createSidebarSession}
      cwd={cwd}
      onKillSession={terminal.killSession}
      onSendInput={terminal.sendInput}
      onResizeSession={terminal.resizeSession}
      drawerOpen={drawerOpen}
      onToggleDrawer={toggleSidebarTerminalDrawer}
      registerTerminal={terminal.registerTerminal}
      unregisterTerminal={terminal.unregisterTerminal}
      wallpaper={wallpaper}
      windowControlsVisible={platform === "win32"}
    />
  );
});
