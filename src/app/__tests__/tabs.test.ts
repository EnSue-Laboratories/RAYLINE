import { describe, expect, it } from "vitest";
import type { ConversationData } from "@shared/chat/types";
import { buildPinnedTabs, neighbourTabId, tabsSignature } from "../derived/tabs";
import { applyStreamingTransition, computeStreamingTransition } from "../effects/streamingTabs";
import { EMPTY_LIVE, convo, live } from "./fixtures";

describe("pinned tabs", () => {
  it("orders by pin time and derives state", () => {
    const rows = [
      convo({ id: "b", tab: { pinned: true, pinnedAt: 2 } }),
      convo({ id: "a", title: "", tab: { pinned: true, pinnedAt: 1, runEndedAt: 5, lastSeenAt: 1 } }),
      convo({ id: "c" }),
    ];
    const liveMap = new Map<string, ConversationData>([["b", live([], true)]]);
    const tabs = buildPinnedTabs(rows, (id) => liveMap.get(id) ?? EMPTY_LIVE);
    expect(tabs).toEqual([
      { id: "a", title: "Untitled", state: "done" },
      { id: "b", title: "Chat", state: "streaming" },
    ]);
    expect(tabsSignature(tabs)).toBe(tabsSignature(buildPinnedTabs(rows, (id) => liveMap.get(id) ?? EMPTY_LIVE)));
    expect(neighbourTabId(tabs, "a")).toBe("b");
    expect(neighbourTabId(tabs, "b")).toBe("a");
    expect(neighbourTabId(tabs, "zzz")).toBeNull();
  });
});

describe("streaming transitions", () => {
  const rows = [convo({ id: "a" }), convo({ id: "b" })];
  const both = new Map<string, ConversationData>([["a", live([], true)], ["b", live([], true)]]);
  const getBoth = (id: string) => both.get(id) ?? EMPTY_LIVE;

  it("pins all streaming chats on a concurrent burst", () => {
    const t = computeStreamingTransition(rows, getBoth, new Map(), "idle");
    expect(t.round).toBe("active");
    expect([...(t.pinIds ?? [])]).toEqual(["a", "b"]);
    const pinned = applyStreamingTransition(rows, t.pinIds, t.endedIds);
    expect(pinned.every((c) => c.tab?.pinned)).toBe(true);
  });

  it("does not re-pin after the user dismissed the round", () => {
    const t = computeStreamingTransition(rows, getBoth, new Map(), "dismissed");
    expect(t.pinIds).toBeNull();
  });

  it("marks runs that ended", () => {
    const prev = new Map([["a", true]]);
    const t = computeStreamingTransition(rows, () => EMPTY_LIVE, prev, "active");
    expect(t.endedIds).toEqual(["a"]);
    expect(t.round).toBe("idle");
    const next = applyStreamingTransition(rows, t.pinIds, t.endedIds);
    expect(next[0]?.tab?.runEndedAt).toEqual(expect.any(Number));
    expect(next[1]).toBe(rows[1]);
  });
});
