/** Initial state load (v2 index or legacy full state) into the stores. */

import type { PersistedAppState } from "@shared/state/types";
import { isPersistedAppState } from "@shared/state/types";
import type { QueuedMessage } from "@shared/chat/types";
import { appSettingsStore, setAppSetting, settingsFromPersisted } from "../../store/appSettings";
import { convoListStore } from "../../store/convoList";
import {
  createLegacyBaseline,
  createV2Baseline,
  detectPersistenceMode,
  startPersistence,
} from "../../store/persistence";
import { normalizeProjectsMeta } from "../conversation/paths";
import { normalizeQueuedMessage } from "../conversation/queue";
import { normalizeWallpaper } from "../../utils/wallpaper";
import { getApi, errorMessage } from "../lib/api";
import { setQueue } from "../stores/queue";
import { markTranscriptsUnloaded } from "../stores/transcripts";
import { patchUi } from "../stores/ui";
import { pickRestoredActive, restoreConversations } from "./restore";

function restoreQueue(raw: unknown): QueuedMessage[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.map(normalizeQueuedMessage).filter((m): m is QueuedMessage => m !== null);
}

function applySettings(state: Omit<PersistedAppState, "convos">): void {
  appSettingsStore.setState((prev) => settingsFromPersisted(state, prev, normalizeProjectsMeta));
  // The wallpaper data URL is not persisted (too large); reload it from disk.
  const path = state.wallpaper?.path;
  const api = getApi();
  if (path && api && typeof api.readImage === "function") {
    api.readImage(path).then(
      (dataUrl) => {
        if (!dataUrl) return;
        setAppSetting("wallpaper", (prev) => (prev ? normalizeWallpaper({ ...prev, dataUrl }) : prev));
      },
      (error: unknown) => console.warn("[load] wallpaper read failed:", errorMessage(error)),
    );
  }
}

/** Load persisted state, populate the stores and start saving. Returns the persistence stopper. */
export async function loadPersistedState(): Promise<() => void> {
  const api = getApi();
  if (!api) {
    patchUi({ stateLoaded: true });
    return () => {};
  }

  api.getDraftsPath().then(
    (path) => {
      if (path) patchUi({ draftsPath: path });
    },
    () => {},
  );

  const mode = detectPersistenceMode();
  let stop: () => void = () => {};
  try {
    if (mode === "v2") {
      const index = await api.stateLoad();
      if (index) {
        const convos = restoreConversations(Array.isArray(index.convos) ? index.convos : [], { withTranscripts: false });
        markTranscriptsUnloaded(convos.map((c) => c.id));
        convoListStore.setState({ convos, activeId: pickRestoredActive(convos, index.active) });
        const queue = restoreQueue(index.queuedMessages);
        if (queue) setQueue(queue);
        applySettings(index);
        stop = startPersistence("v2", createV2Baseline(index.convos.map((c) => c.id)));
      } else {
        stop = startPersistence("v2", createV2Baseline([]));
      }
    } else {
      const raw: unknown = await api.loadState();
      const state = isPersistedAppState(raw) ? raw : null;
      if (state) {
        if (state.convos) {
          const convos = restoreConversations(state.convos, { withTranscripts: true });
          convoListStore.setState({ convos, activeId: pickRestoredActive(convos, state.active) });
        } else if (state.active) {
          convoListStore.setState((prev) => ({ ...prev, activeId: state.active ?? null }));
        }
        const queue = restoreQueue(state.queuedMessages);
        if (queue) setQueue(queue);
        applySettings(state);
      }
      stop = startPersistence("legacy", createLegacyBaseline(convoListStore.getState().convos));
    }
  } catch (error) {
    console.error("[load] failed to load persisted state:", errorMessage(error));
    // Don't start saving: an empty in-memory state must never overwrite the file.
  }
  patchUi({ stateLoaded: true });
  return stop;
}
