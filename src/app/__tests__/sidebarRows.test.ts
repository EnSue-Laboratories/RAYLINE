import { describe, expect, it } from "vitest";
import type { ConversationData } from "@shared/chat/types";
import { buildSidebarRows, createSidebarRowCache } from "../derived/sidebarRows";
import { EMPTY_LIVE, assistant, convo, live, user } from "./fixtures";

function build(rows: ReturnType<typeof convo>[], liveMap: Map<string, ConversationData>, cache: ReturnType<typeof createSidebarRowCache>, now: number, pending: Set<string> = new Set()) {
  return buildSidebarRows(
    {
      convos: rows,
      activeId: null,
      getLive: (id) => liveMap.get(id) ?? EMPTY_LIVE,
      isTranscriptPending: (id) => pending.has(id),
      now,
    },
    cache,
  );
}

describe("buildSidebarRows", () => {
  it("reuses row objects and the array when nothing changed", () => {
    const rows = [convo({ id: "a", archivedMessages: [user("u", "hi")] })];
    const cache = createSidebarRowCache();
    const first = build(rows, new Map(), cache, 0).rows;
    const second = build(rows, new Map(), cache, 10).rows;
    expect(second).toBe(first);
  });

  it("throttles streaming previews and flags a pending flush", () => {
    const rows = [convo({ id: "a", archivedMessages: [user("u", "hi")] })];
    const cache = createSidebarRowCache();
    const liveMap = new Map([["a", live([assistant("x", "one")], true)]]);
    expect(build(rows, liveMap, cache, 0).rows[0]?.lastPreview).toBe("one");
    liveMap.set("a", live([assistant("x", "one two")], true));
    const held = build(rows, liveMap, cache, 100);
    expect(held.rows[0]?.lastPreview).toBe("one");
    expect(held.pendingFlush).toBe(true);
    const flushed = build(rows, liveMap, cache, 600);
    expect(flushed.rows[0]?.lastPreview).toBe("one two");
    // Run end: exact preview immediately.
    liveMap.set("a", live([assistant("x", "one two three")], false));
    expect(build(rows, liveMap, cache, 610).rows[0]).toMatchObject({ lastPreview: "one two three", isStreaming: false });
  });

  it("hides empty drafts but keeps rows whose transcript is unloaded", () => {
    const rows = [convo({ id: "draft" }), convo({ id: "pending" })];
    const result = build(rows, new Map(), createSidebarRowCache(), 0, new Set(["pending"]));
    expect(result.rows.map((r) => r.id)).toEqual(["pending"]);
  });
});
