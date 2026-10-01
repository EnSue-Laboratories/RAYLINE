import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "../concurrency";
import { runConversationSearch, type SearchRecordCache } from "../searchRunner";
import type { SidebarConversation } from "../types";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("mapWithConcurrency", () => {
  it("never exceeds the limit and keeps input order", async () => {
    let inFlight = 0;
    let peak = 0;
    const result = await mapWithConcurrency([5, 1, 4, 2, 3, 0], 2, async (n) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, n));
      inFlight -= 1;
      return n * 10;
    });
    expect(peak).toBe(2);
    expect(result).toEqual([50, 10, 40, 20, 30, 0]);
  });

  it("stops scheduling and rejects when aborted", async () => {
    const controller = new AbortController();
    const started: number[] = [];
    const gates = [deferred<void>(), deferred<void>(), deferred<void>()];
    const run = mapWithConcurrency(
      [0, 1, 2],
      1,
      async (n) => {
        started.push(n);
        await gates[n]?.promise;
        return n;
      },
      controller.signal,
    );
    controller.abort();
    gates[0]?.resolve();
    await expect(run).rejects.toThrow();
    await tick();
    expect(started).toEqual([0]);
  });

  it("propagates worker errors", async () => {
    await expect(mapWithConcurrency([1], 4, () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
  });

  it("resolves empty input", async () => {
    await expect(mapWithConcurrency([], 4, () => Promise.resolve(1))).resolves.toEqual([]);
  });
});

function convo(id: string, title: string, sessionId?: string): SidebarConversation {
  return { id, title, model: "sonnet", ts: 1, sessionId: sessionId ?? null };
}

describe("runConversationSearch", () => {
  it("loads session text with bounded concurrency and caches records", async () => {
    let inFlight = 0;
    let peak = 0;
    const calls: string[] = [];
    const loadSessionText = async (sessionId: string) => {
      calls.push(sessionId);
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await tick();
      inFlight -= 1;
      return sessionId === "s3" ? "deep needle in transcript" : "nothing";
    };
    const convos = Array.from({ length: 10 }, (_, i) => convo(`c${i}`, `chat ${i}`, `s${i}`));
    const cache: SearchRecordCache = new Map();
    const controller = new AbortController();

    const matches = await runConversationSearch({
      convos,
      query: "needle",
      tokens: ["needle"],
      cache,
      loadSessionText,
      signal: controller.signal,
      concurrency: 4,
    });

    expect(peak).toBeLessThanOrEqual(4);
    expect([...matches.entries()]).toEqual([["c3", "deep needle in transcript"]]);
    expect(cache.size).toBe(10);

    calls.length = 0;
    await runConversationSearch({
      convos: convos.slice(0, 5),
      query: "chat 4",
      tokens: ["chat", "4"],
      cache,
      loadSessionText,
      signal: controller.signal,
    });
    expect(calls).toEqual([]);
    expect(cache.size).toBe(5);
  });

  it("matches titles without a session loader", async () => {
    const matches = await runConversationSearch({
      convos: [convo("a", "Deploy script"), convo("b", "Other")],
      query: "deploy",
      tokens: ["deploy"],
      cache: new Map(),
      loadSessionText: null,
      signal: new AbortController().signal,
    });
    expect([...matches.entries()]).toEqual([["a", null]]);
  });

  it("rejects once aborted", async () => {
    const controller = new AbortController();
    const gate = deferred<string>();
    const run = runConversationSearch({
      convos: [convo("a", "x", "s1"), convo("b", "y", "s2")],
      query: "x",
      tokens: ["x"],
      cache: new Map(),
      loadSessionText: () => gate.promise,
      signal: controller.signal,
      concurrency: 1,
    });
    controller.abort();
    gate.resolve("");
    await expect(run).rejects.toThrow();
  });
});
