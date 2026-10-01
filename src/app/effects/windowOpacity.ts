import { appSettingsStore } from "../../store/appSettings";
import { getApi } from "../lib/api";

/** Push the window opacity setting to Electron (after the initial load). */
export function startWindowOpacitySync(): () => void {
  let last: number | null = null;
  const sync = () => {
    const api = getApi();
    if (!api || typeof api.setWindowOpacity !== "function") return;
    const { appOpacity } = appSettingsStore.getState();
    if (appOpacity === last) return;
    last = appOpacity;
    void api.setWindowOpacity(Math.max(0.3, Math.min(1, appOpacity / 100)));
  };
  sync();
  return appSettingsStore.subscribe(sync);
}
