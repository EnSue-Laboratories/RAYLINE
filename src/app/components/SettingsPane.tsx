import { lazy, memo, Suspense } from "react";
import { appSettingsStore } from "../../store/appSettings";
import { useStore } from "../../store/createStore";
import { settingSetters } from "../actions/settings";
import { patchUi, useUi } from "../stores/ui";

// Code-split: Settings is large and only needed once opened.
const Settings = lazy(() => import("../../components/Settings"));

const closeSettings = () => patchUi({ showSettings: false });

/** Lazily loaded Settings; mounted only while open. Reads the settings store directly. */
export const SettingsPane = memo(function SettingsPane() {
  const settings = useStore(appSettingsStore, (s) => s);
  const platform = useUi("platform");
  return (
    <Suspense fallback={null}>
      <Settings
        {...settingSetters}
        wallpaper={settings.wallpaper}
        appearance={settings.appearance}
        fontSize={settings.fontSize}
        defaultPrBranch={settings.defaultPrBranch}
        coauthorEnabled={settings.coauthorEnabled}
        appBlur={settings.appBlur}
        appOpacity={settings.appOpacity}
        developerMode={settings.developerMode}
        sidebarTerminalEnabled={settings.sidebarTerminalEnabled}
        remoteSshCommand={settings.remoteSshCommand}
        chromeControlsOnHover={settings.chromeControlsOnHover}
        notificationSound={settings.notificationSound}
        notificationsMuted={settings.notificationsMuted}
        platform={platform}
        locale={settings.locale}
        windowControlsVisible={platform === "win32"}
        onClose={closeSettings}
      />
    </Suspense>
  );
});
