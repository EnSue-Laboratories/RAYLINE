import { memo } from "react";
import { usePrefersReducedMotion } from "../../hooks/useWindowActivity";
import { useUi } from "../stores/ui";
import { ChatPane } from "./ChatPane";
import { ModelsBridge } from "./ModelsBridge";
import { Overlays } from "./Overlays";
import { SettingsPane } from "./SettingsPane";
import { SidebarPane } from "./SidebarPane";
import { TerminalBridge } from "./TerminalBridge";
import { WallpaperBackground } from "./WallpaperBackground";
import { WindowChrome } from "./WindowChrome";

/**
 * Main pane (PR #230): ChatArea stays mounted while Settings is open so the
 * composer's draft and scroll position survive; Settings overlays it.
 */
const MainPane = memo(function MainPane() {
  const showSettings = useUi("showSettings");
  const prefersReducedMotion = usePrefersReducedMotion();
  return (
    <div style={{ position: "relative", flex: 1, minWidth: 0, height: "100%", overflow: "hidden", display: "flex" }}>
      <div
        aria-hidden={showSettings}
        inert={showSettings}
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          opacity: showSettings ? 0 : 1,
          pointerEvents: showSettings ? "none" : "auto",
          transition: prefersReducedMotion ? "none" : "opacity .12s ease",
        }}
      >
        <ChatPane />
      </div>
      {showSettings ? (
        <div style={{ position: "absolute", inset: 0, zIndex: 80, display: "flex" }}>
          <SettingsPane />
        </div>
      ) : null}
    </div>
  );
});

/** Window layout. Every child subscribes to its own store slices. */
export const AppShell = memo(function AppShell() {
  const platform = useUi("platform");
  const windowsChrome = platform === "win32";
  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", overflow: "hidden", position: "relative" }}>
      <ModelsBridge />
      <WallpaperBackground />
      <WindowChrome windowsChrome={windowsChrome} />
      <div style={{ display: "flex", flex: 1, minWidth: 0, height: "100%" }}>
        <SidebarPane windowsChrome={windowsChrome} />
        <MainPane />
        <Overlays />
        {/* Optional in-app terminal drawer; the default surface is the dedicated window. */}
        <TerminalBridge />
      </div>
    </div>
  );
});
