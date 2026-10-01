import { useEffect } from "react";
import { getActiveId } from "../../store/convoList";
import { hydrateConversationPreviews, selectConversation } from "../actions/navigation";
import { cancelLabControlUpdates } from "../actions/settings";
import { startProjectsDerivation } from "../derived/projects";
import { startDerivedStores } from "../derived/store";
import { installDevFixtures } from "../devFixtures";
import { startActiveConversationEffects } from "../effects/activeConversation";
import { startSessionCapture } from "../effects/captureSessions";
import { startIpcListeners, startWindowListeners } from "../effects/ipc";
import { startStreamingTabs } from "../effects/streamingTabs";
import { startWindowOpacitySync } from "../effects/windowOpacity";
import { loadPersistedState } from "../persist/load";
import { refreshCliInstalled } from "../stores/runtime";

/**
 * Start every store subscription and listener, load persisted state, then
 * open the active conversation and hydrate missing previews. Runs once.
 */
export function useAppLifecycle(): void {
  useEffect(() => {
    let cancelled = false;
    let stopAfterLoad: (() => void)[] = [];
    const stops = [
      startDerivedStores(),
      startProjectsDerivation(),
      startStreamingTabs(),
      startSessionCapture(),
      startActiveConversationEffects(),
      startIpcListeners(),
      startWindowListeners(),
      installDevFixtures(),
    ];
    void refreshCliInstalled();

    loadPersistedState().then(
      (stopPersistence) => {
        if (cancelled) {
          stopPersistence();
          return;
        }
        stopAfterLoad = [stopPersistence, startWindowOpacitySync()];
        const active = getActiveId();
        if (active) void selectConversation(active);
        void hydrateConversationPreviews();
      },
      (error: unknown) => console.error("[app] state load failed:", error),
    );

    return () => {
      cancelled = true;
      for (const stop of [...stops, ...stopAfterLoad]) stop();
      cancelLabControlUpdates();
    };
  }, []);
}
