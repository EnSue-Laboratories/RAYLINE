import { memo } from "react";
import { useAppSetting } from "../../store/appSettings";
import { openNewChat } from "../actions/create";
import SidebarChromeRail from "../../components/SidebarChromeRail";
import SidebarWindowsHeader from "../../components/SidebarWindowsHeader";
import WindowControls from "../../components/WindowControls";
import { patchUi, uiStore, useUi } from "../stores/ui";

const toggleSidebar = () => patchUi({ sidebarOpen: !uiStore.getState().sidebarOpen });
const toggleSettings = () => patchUi({ showSettings: !uiStore.getState().showSettings });

/** Window controls + sidebar toggle/new/settings chrome (Windows header or macOS rail). */
export const WindowChrome = memo(function WindowChrome({ windowsChrome }: { windowsChrome: boolean }) {
  const sidebarOpen = useUi("sidebarOpen");
  const settingsOpen = useUi("showSettings");
  const hasUpdate = useUi("hasUpdate");
  const controlsOnHover = useAppSetting("chromeControlsOnHover");
  return (
    <>
      <WindowControls visible={windowsChrome} />
      {windowsChrome ? (
        <SidebarWindowsHeader
          sidebarOpen={sidebarOpen}
          settingsOpen={settingsOpen}
          onToggleSidebar={toggleSidebar}
          onNew={openNewChat}
          onOpenSettings={toggleSettings}
          hasUpdate={hasUpdate}
        />
      ) : (
        <SidebarChromeRail
          sidebarOpen={sidebarOpen}
          settingsOpen={settingsOpen}
          controlsOnHover={controlsOnHover}
          onToggleSidebar={toggleSidebar}
          onNew={openNewChat}
          onOpenSettings={toggleSettings}
        />
      )}
    </>
  );
});
