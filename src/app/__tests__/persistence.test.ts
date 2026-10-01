import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StateSaveRequest } from "@shared/state/types";
import { convoListStore } from "../../store/convoList";
import { createV2Baseline, ensureTranscriptLoaded, flushSave, startPersistence } from "../../store/persistence";
import { liveConversationsStore } from "../stores/live";
import { getTranscriptStatus, markTranscriptsUnloaded } from "../stores/transcripts";
import { convo, live, user } from "./fixtures";

describe("persistence scheduler (v2)", () => {
  const saves: StateSaveRequest[] = [];
  const syncSaves: StateSaveRequest[] = [];
  let listeners: Record<string, () => void> = {};
  let stop: () => void = () => {};

  beforeEach(() => {
    vi.useFakeTimers();
    saves.length = 0;
    syncSaves.length = 0;
    listeners = {};
    vi.stubGlobal("window", {
      api: {
        stateLoad: () => Promise.resolve(null),
        stateSave: (request: StateSaveRequest) => {
          saves.push(request);
          return Promise.resolve(true);
        },
        stateSaveSync: (request: StateSaveRequest) => {
          syncSaves.push(request);
          return true;
        },
        stateLoadConversation: () => Promise.resolve([user("u1", "from disk")]),
      },
      addEventListener: (name: string, fn: () => void) => {
        listeners[name] = fn;
      },
      removeEventListener: () => {},
    });
    convoListStore.setState({ convos: [convo({ id: "a" }), convo({ id: "b" })], activeId: "a" });
    liveConversationsStore.setState(new Map());
    markTranscriptsUnloaded(["a", "b"]);
    stop = startPersistence("v2", createV2Baseline(["a", "b"]));
  });

  afterEach(() => {
    stop();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("debounces, sends the index once, and never writes unloaded transcripts", () => {
    vi.advanceTimersByTime(999);
    expect(saves).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(saves).toHaveLength(1);
    expect(saves[0]?.index?.convos.map((c) => c.id)).toEqual(["a", "b"]);
    expect(saves[0]?.transcripts).toBeUndefined();

    // Nothing changed → nothing sent.
    flushSave();
    expect(saves).toHaveLength(1);
  });

  it("sends only the streaming conversation's transcript, bounded by max-wait", async () => {
    vi.advanceTimersByTime(1000);
    await ensureTranscriptLoaded("a");
    expect(getTranscriptStatus("a")).toBe("loaded");
    saves.length = 0;

    // Stream flushes every 30 ms keep resetting the debounce; max-wait still saves.
    for (let t = 0; t < 10_500; t += 30) {
      liveConversationsStore.setState(new Map([["a", live([user("u1", "from disk"), user("u2", `tick ${t}`)], true)]]));
      vi.advanceTimersByTime(30);
    }
    expect(saves.length).toBeGreaterThanOrEqual(1);
    const request = saves[0];
    expect(request?.transcripts?.upserts.map((u) => u.id)).toEqual(["a"]);
    expect(request?.transcripts?.deletes).toEqual([]);
  });

  it("beforeunload flushes only a pending delta synchronously", () => {
    vi.advanceTimersByTime(1000);
    listeners.beforeunload?.();
    expect(syncSaves).toHaveLength(0);

    convoListStore.setState((prev) => ({ ...prev, convos: prev.convos.filter((c) => c.id !== "b") }));
    listeners.beforeunload?.();
    expect(syncSaves).toHaveLength(1);
    expect(syncSaves[0]?.transcripts?.deletes).toEqual(["b"]);
  });
});
