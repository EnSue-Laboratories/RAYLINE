import { describe, expect, it } from "vitest";
import type { ChatMessage, ConversationData } from "@shared/chat/types";
import {
  collectPersistableConversations,
  commitBaseline,
  createBaseline,
  isEmptyPlan,
  planStateSave,
  revertBaseline,
  toLegacyPayload,
  toStateSaveRequest,
  type SnapshotCache,
} from "../persist/snapshot";
import { EMPTY_LIVE, assistant, convo, live, user } from "./fixtures";

const SETTINGS = { cwd: null, defaultModel: "sonnet", locale: "en-US" } as const;

function setup(liveMap: Map<string, ConversationData>, pending: Set<string> = new Set()) {
  const cache: SnapshotCache = new Map();
  const getLive = (id: string) => liveMap.get(id) ?? EMPTY_LIVE;
  const isTranscriptPending = (id: string) => pending.has(id);
  return { cache, getLive, isTranscriptPending };
}

describe("collectPersistableConversations", () => {
  it("reuses cached snapshots while the row and live data are unchanged", () => {
    const rows = [convo({ id: "a", archivedMessages: [user("u", "hi")] }), convo({ id: "b" })];
    const liveMap = new Map<string, ConversationData>();
    const ctx = setup(liveMap);
    const first = collectPersistableConversations({ convos: rows, ...ctx }, ctx.cache);
    expect(first.map((e) => e.id)).toEqual(["a"]); // "b" has no messages → not persisted
    const second = collectPersistableConversations({ convos: rows, ...ctx }, ctx.cache);
    expect(second[0]).toBe(first[0]);

    liveMap.set("a", live([user("u", "hi"), assistant("x", "streamed")], true));
    const third = collectPersistableConversations({ convos: rows, ...ctx }, ctx.cache);
    expect(third[0]).not.toBe(first[0]);
    expect(third[0]?.snapshot.lastPreview).toBe("streamed");
    expect(third[0]?.transcriptKey).toBe(liveMap.get("a")?.messages);
  });

  it("keeps rows whose transcript is still on disk (lazy load)", () => {
    const rows = [convo({ id: "p" })];
    const ctx = setup(new Map(), new Set(["p"]));
    expect(collectPersistableConversations({ convos: rows, ...ctx }, ctx.cache).map((e) => e.id)).toEqual(["p"]);
  });
});

describe("planStateSave", () => {
  function plan(rows: ReturnType<typeof convo>[], liveMap: Map<string, ConversationData>, baseline = createBaseline(), pending = new Set<string>()) {
    const ctx = setup(liveMap, pending);
    const entries = collectPersistableConversations({ convos: rows, ...ctx }, ctx.cache);
    return {
      entries,
      plan: planStateSave(
        { entries, activeId: rows[0]?.id ?? null, settings: SETTINGS, queuedMessages: [], isTranscriptPending: ctx.isTranscriptPending },
        baseline,
      ),
    };
  }

  it("writes the index and dirty transcripts once, then nothing", () => {
    const transcript: ChatMessage[] = [user("u", "hi")];
    const rows = [convo({ id: "a", archivedMessages: transcript })];
    const baseline = createBaseline();
    const first = plan(rows, new Map(), baseline).plan;
    expect(first.indexChanged).toBe(true);
    expect(first.upserts.map((u) => u.id)).toEqual(["a"]);
    expect(first.index.convos[0]).not.toHaveProperty("archivedMessages");
    commitBaseline(first, baseline);

    const second = plan(rows, new Map(), baseline).plan;
    expect(isEmptyPlan(second)).toBe(true);
  });

  it("sends only the index when metadata changes but the transcript source does not", () => {
    const transcript: ChatMessage[] = [user("u", "hi")];
    const baseline = createBaseline();
    commitBaseline(plan([convo({ id: "a", archivedMessages: transcript })], new Map(), baseline).plan, baseline);
    const renamed = plan([convo({ id: "a", title: "Renamed", archivedMessages: transcript })], new Map(), baseline).plan;
    const request = toStateSaveRequest(renamed);
    expect(request.index?.convos[0]?.title).toBe("Renamed");
    expect(request.transcripts).toBeUndefined();
  });

  it("never writes pending transcripts and deletes removed conversations", () => {
    const baseline = createBaseline();
    baseline.savedIds.add("gone");
    baseline.savedIds.add("p");
    const result = plan([convo({ id: "p" })], new Map(), baseline, new Set(["p"])).plan;
    expect(result.upserts).toEqual([]);
    expect(result.deletes).toEqual(["gone"]);
  });

  it("revertBaseline makes a failed save retry", () => {
    const baseline = createBaseline();
    const first = plan([convo({ id: "a", archivedMessages: [user("u", "hi")] })], new Map(), baseline).plan;
    commitBaseline(first, baseline);
    revertBaseline(first, baseline);
    const retry = plan([convo({ id: "a", archivedMessages: first.upserts[0]?.archivedMessages ?? [] })], new Map(), baseline).plan;
    expect(retry.indexChanged).toBe(true);
  });

  it("legacy payload inlines full snapshots and resolves the active id", () => {
    const { plan: p, entries } = plan([convo({ id: "a", archivedMessages: [user("u", "hi")] })], new Map());
    const payload = toLegacyPayload(p, entries);
    expect(payload.active).toBe("a");
    expect(payload.convos?.[0]?.archivedMessages).toHaveLength(1);
    expect(payload).not.toHaveProperty("version");
  });
});
