/**
 * Renderer side of app-state persistence.
 *
 * - v2 (split storage, `state:*` channels): the index (settings +
 *   conversation metadata) is sent only when it changed; transcripts only for
 *   conversations whose transcript source changed identity since the last
 *   save. Transcripts are loaded lazily when a conversation is opened.
 * - legacy (`load-state` / `save-state`), used when the preload lacks the v2
 *   methods: the whole state is written, but only when something changed.
 *
 * Saves are debounced (1 s, at most 10 s while changes keep coming).
 * `beforeunload` synchronously flushes only a pending delta.
 */

import type { ChatMessage, Conversation } from "@shared/chat/types";
import { appSettingsStore, toPersistedSettings } from "./appSettings";
import { convoListStore, findConvo, updateConvo } from "./convoList";
import {
  collectPersistableConversations,
  commitBaseline,
  createBaseline,
  isEmptyPlan,
  planStateSave,
  revertBaseline,
  toLegacyPayload,
  toStateSaveRequest,
  type SaveBaseline,
  type SavePlan,
  type SnapshotCache,
  type SnapshotEntry,
} from "../app/persist/snapshot";
import { normalizeConversationState } from "../app/conversation/sessions";
import { getLiveConversation, liveConversationsStore } from "../app/stores/live";
import { queueStore } from "../app/stores/queue";
import { getTranscriptStatus, isTranscriptPending, setTranscriptStatus, transcriptStatusStore } from "../app/stores/transcripts";
import { errorMessage, getApi } from "../app/lib/api";

export type PersistenceMode = "v2" | "legacy";

const SAVE_DEBOUNCE_MS = 1000;
const SAVE_MAX_WAIT_MS = 10_000;

let mode: PersistenceMode | null = null;
let baseline: SaveBaseline = createBaseline();
const snapshotCache: SnapshotCache = new Map();
let timer: ReturnType<typeof setTimeout> | null = null;
let firstPendingAt = 0;
const transcriptLoads = new Map<string, Promise<void>>();

/** Whether the running preload exposes the v2 split-persistence channels. */
export function detectPersistenceMode(): PersistenceMode {
  const api = getApi();
  return api && typeof api.stateLoad === "function" && typeof api.stateSave === "function" ? "v2" : "legacy";
}

export function getPersistenceMode(): PersistenceMode | null {
  return mode;
}

function collect(): SnapshotEntry[] {
  return collectPersistableConversations(
    { convos: convoListStore.getState().convos, getLive: getLiveConversation, isTranscriptPending },
    snapshotCache,
  );
}

function buildPlan(): { plan: SavePlan; entries: SnapshotEntry[] } {
  const entries = collect();
  const plan = planStateSave(
    {
      entries,
      activeId: convoListStore.getState().activeId,
      settings: toPersistedSettings(appSettingsStore.getState()),
      queuedMessages: queueStore.getState(),
      isTranscriptPending,
    },
    baseline,
  );
  return { plan, entries };
}

function clearTimer(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  firstPendingAt = 0;
}

function handleSaveResult(plan: SavePlan, ok: boolean): void {
  if (ok) return;
  revertBaseline(plan, baseline);
  scheduleSave();
}

/** Compute and send the pending delta. `sync` uses the blocking channel (beforeunload). */
export function flushSave({ sync = false }: { sync?: boolean } = {}): void {
  clearTimer();
  const api = getApi();
  if (!api || !mode) return;
  const { plan, entries } = buildPlan();
  if (isEmptyPlan(plan)) return;
  commitBaseline(plan, baseline);

  try {
    if (mode === "v2") {
      const request = toStateSaveRequest(plan);
      if (sync && typeof api.stateSaveSync === "function") {
        handleSaveResult(plan, api.stateSaveSync(request));
      } else {
        api.stateSave(request).then(
          (ok) => handleSaveResult(plan, ok),
          (error: unknown) => {
            console.error("[persistence] state:save failed:", errorMessage(error));
            handleSaveResult(plan, false);
          },
        );
      }
      return;
    }
    const payload = toLegacyPayload(plan, entries);
    if (sync && typeof api.saveStateSync === "function") {
      handleSaveResult(plan, api.saveStateSync(payload));
    } else {
      api.saveState(payload).then(
        (ok) => handleSaveResult(plan, ok),
        (error: unknown) => {
          console.error("[persistence] save-state failed:", errorMessage(error));
          handleSaveResult(plan, false);
        },
      );
    }
  } catch (error) {
    console.error("[persistence] save failed:", errorMessage(error));
    revertBaseline(plan, baseline);
  }
}

function scheduleSave(): void {
  if (!mode) return;
  const now = Date.now();
  if (!firstPendingAt) firstPendingAt = now;
  if (timer) clearTimeout(timer);
  const wait = Math.max(0, Math.min(SAVE_DEBOUNCE_MS, firstPendingAt + SAVE_MAX_WAIT_MS - now));
  timer = setTimeout(() => flushSave(), wait);
}

function handleBeforeUnload(): void {
  if (timer) flushSave({ sync: true });
}

/**
 * Start saving after the initial load. `initial` is the baseline describing
 * what is already on disk.
 */
export function startPersistence(nextMode: PersistenceMode, initial: SaveBaseline): () => void {
  mode = nextMode;
  baseline = initial;
  snapshotCache.clear();
  const unsubscribers = [
    convoListStore.subscribe(scheduleSave),
    appSettingsStore.subscribe(scheduleSave),
    liveConversationsStore.subscribe(scheduleSave),
    queueStore.subscribe(scheduleSave),
    transcriptStatusStore.subscribe(scheduleSave),
  ];
  window.addEventListener("beforeunload", handleBeforeUnload);
  // Normalization during load usually changes the index; save it once.
  scheduleSave();
  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
    window.removeEventListener("beforeunload", handleBeforeUnload);
    clearTimer();
    mode = null;
  };
}

/** Baseline for a v2 index load: every listed conversation has a transcript file. */
export function createV2Baseline(conversationIds: readonly string[]): SaveBaseline {
  const initial = createBaseline();
  for (const id of conversationIds) initial.savedIds.add(id);
  return initial;
}

/** Baseline for a legacy load: transcripts are inline and already on disk. */
export function createLegacyBaseline(convos: readonly Conversation[]): SaveBaseline {
  const initial = createBaseline();
  for (const convo of convos) {
    initial.savedKeys.set(convo.id, convo.archivedMessages);
    initial.savedIds.add(convo.id);
  }
  return initial;
}

function isMessageArray(value: unknown): value is ChatMessage[] {
  return Array.isArray(value);
}

/**
 * Load a conversation's transcript if it is still on disk only (v2). Resolves
 * once `conversation.archivedMessages` holds the stored transcript. Safe to
 * call repeatedly; concurrent callers share one request.
 */
export function ensureTranscriptLoaded(id: string): Promise<void> {
  if (getTranscriptStatus(id) === "loaded") return Promise.resolve();
  const inFlight = transcriptLoads.get(id);
  if (inFlight) return inFlight;

  const api = getApi();
  if (!api || typeof api.stateLoadConversation !== "function") {
    setTranscriptStatus(id, "loaded");
    return Promise.resolve();
  }

  setTranscriptStatus(id, "loading");
  const load = api
    .stateLoadConversation(id)
    .then(
      (messages) => (isMessageArray(messages) ? messages : []),
      (error: unknown) => {
        console.error("[persistence] state:load-conversation failed:", errorMessage(error));
        return null;
      },
    )
    .then((messages) => {
      if (messages === null) {
        // Leave it unloaded so we never overwrite the file with a partial transcript.
        setTranscriptStatus(id, "unloaded");
        return;
      }
      updateConvo(id, (convo) => normalizeConversationState({ ...convo, archivedMessages: messages }));
      const loaded = findConvo(id);
      if (loaded) baseline.savedKeys.set(id, loaded.archivedMessages);
      setTranscriptStatus(id, "loaded");
    })
    .finally(() => {
      transcriptLoads.delete(id);
    });
  transcriptLoads.set(id, load);
  return load;
}
