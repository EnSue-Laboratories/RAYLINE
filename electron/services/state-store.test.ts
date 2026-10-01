import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ARCHIVED_TOOL_PAYLOAD_LIMIT, type PersistedAppState } from "@shared/state/types";
import type { AssistantMessage, ChatMessage, Conversation, ToolPart } from "@shared/chat/types";
import { AtomicFileWriter } from "./atomic-writer";
import { StateStore } from "./state-store";

let dir: string;

beforeEach(async () => {
  dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "rayline-state-"));
});

afterEach(async () => {
  await fs.promises.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
});

function convo(id: string, archivedMessages: ChatMessage[], extra: Partial<Conversation> = {}): Conversation {
  return {
    id,
    title: id,
    model: "sonnet",
    ts: 1,
    sessions: [],
    activeSessionId: null,
    providerSessions: {},
    sessionId: null,
    sessionProvider: null,
    archivedMessages,
    ...extra,
  };
}

function toolMessage(id: string, result: unknown): AssistantMessage {
  const part: ToolPart = { type: "tool", id: `${id}-tool`, name: "Bash", args: { command: "ls" }, result, status: "done" };
  return { id, role: "assistant", parts: [part] };
}

function store(): StateStore {
  return new StateStore({ userDataDir: dir, sweepDelayMs: null });
}

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, "utf-8")) as unknown;
}

function firstToolResult(messages: ChatMessage[]): unknown {
  const first = messages[0];
  if (first?.role !== "assistant") throw new Error("expected assistant message");
  const part = first.parts?.[0];
  if (part?.type !== "tool") throw new Error("expected tool part");
  return part.result;
}

describe("StateStore migration", () => {
  it("splits the legacy file into v2 and leaves the legacy file untouched", async () => {
    const big = "x".repeat(ARCHIVED_TOOL_PAYLOAD_LIMIT + 5000);
    const legacy: PersistedAppState = {
      locale: "en-US",
      pmRepos: ["a/b"],
      convos: [convo("c1", [toolMessage("m1", big)]), convo("c/2", [{ id: "u", role: "user", text: "hi" }])],
    };
    const legacyText = JSON.stringify(legacy, null, 2);
    fs.writeFileSync(path.join(dir, "claudi-state.json"), legacyText);

    const s = store();
    const index = await s.loadIndex();
    expect(index?.version).toBe(2);
    expect(index?.locale).toBe("en-US");
    expect(index?.pmRepos).toEqual(["a/b"]);
    expect(index?.convos.map((c) => c.id)).toEqual(["c1", "c/2"]);
    expect(index?.convos.some((c) => "archivedMessages" in c)).toBe(false);

    expect(fs.readFileSync(path.join(dir, "claudi-state.json"), "utf-8")).toBe(legacyText);
    expect(fs.existsSync(path.join(dir, "state-v2", "conversations", "c%2F2.json"))).toBe(true);

    const result = firstToolResult(await s.loadConversation("c1"));
    expect(typeof result).toBe("string");
    expect(String(result)).toMatch(/…\[truncated 5000 bytes\]$/);
    expect(String(result).length).toBeLessThan(big.length);

    // Index is compact JSON and a second store instance reads v2 directly.
    expect(fs.readFileSync(s.indexFile, "utf-8")).not.toContain("\n");
    const reloaded = await store().loadIndex();
    expect(reloaded?.convos).toHaveLength(2);
  });

  it("returns null on a fresh install and creates v2 on the first save", async () => {
    const s = store();
    expect(await s.loadIndex()).toBeNull();
    expect(await s.save({ index: { version: 2, convos: [convo("a", [])] } })).toBe(true);
    const index = readJson(s.indexFile) as { convos: Array<Record<string, unknown>> };
    expect(index.convos[0]?.archivedMessages).toBeUndefined();
  });
});

describe("StateStore v2 saves", () => {
  it("writes and deletes transcripts and serves queued data before it is flushed", async () => {
    const s = store();
    await s.loadIndex();
    const pending = s.save({ transcripts: { upserts: [{ id: "a", archivedMessages: [{ id: "u", role: "user", text: "one" }] }], deletes: [] } });
    const messages = await s.loadConversation("a");
    expect(messages[0]).toMatchObject({ text: "one" });
    expect(await pending).toBe(true);

    expect(await s.save({ transcripts: { upserts: [], deletes: ["a"] } })).toBe(true);
    expect(await s.loadConversation("a")).toEqual([]);
    await s.flush();
  });

  it("keeps pmRepos owned by the Project Manager", async () => {
    const s = store();
    await s.loadIndex();
    await s.savePmRepos(["o/r"]);
    await s.save({ index: { version: 2, convos: [], pmRepos: ["stale"] } });
    expect(await s.loadPmState()).toEqual({ repos: ["o/r"], wallpaper: null });
    expect((readJson(s.indexFile) as { pmRepos: string[] }).pmRepos).toEqual(["o/r"]);
  });

  it("serves legacy load-state from v2 (full for the main window, settings-only for the PM)", async () => {
    const s = store();
    await s.loadIndex();
    await s.save({
      index: { version: 2, locale: "zh-CN", convos: [convo("a", [])] },
      transcripts: { upserts: [{ id: "a", archivedMessages: [{ id: "u", role: "user", text: "hello" }] }], deletes: [] },
    });
    const full = await s.loadLegacy("full");
    expect(full?.convos?.[0]?.archivedMessages).toHaveLength(1);
    const settings = await s.loadLegacy("settings");
    expect(settings).toEqual({ locale: "zh-CN" });
  });

  it("splits legacy save-state into v2 once v2 exists, removing dropped conversations", async () => {
    const s = store();
    await s.loadIndex();
    await s.saveLegacy({ convos: [convo("a", []), convo("b", [])] });
    expect(fs.existsSync(path.join(s.conversationsDir, "b.json"))).toBe(true);
    await s.saveLegacy({ convos: [convo("a", [])] });
    await s.flush();
    expect(fs.existsSync(path.join(s.conversationsDir, "b.json"))).toBe(false);
    expect(fs.existsSync(s.legacyFile)).toBe(false);
  });

  it("refuses a sync save before migration and accepts it afterwards", async () => {
    const s = store();
    expect(s.saveSync({ index: { version: 2, convos: [] } })).toBe(false);
    await s.loadIndex();
    expect(s.saveSync({ index: { version: 2, locale: "en-US", convos: [] } })).toBe(true);
    expect(readJson(s.indexFile)).toMatchObject({ locale: "en-US" });
  });
});

describe("StateStore legacy mode", () => {
  it("writes compact, truncated legacy state and preserves pmRepos", async () => {
    fs.writeFileSync(path.join(dir, "claudi-state.json"), JSON.stringify({ pmRepos: ["x/y"], convos: [] }));
    const s = store();
    expect(await s.loadLegacy("settings")).toEqual({ pmRepos: ["x/y"] });
    const big = "y".repeat(ARCHIVED_TOOL_PAYLOAD_LIMIT * 2);
    expect(await s.saveLegacy({ convos: [convo("a", [toolMessage("m", big)])] })).toBe(true);
    const text = fs.readFileSync(s.legacyFile, "utf-8");
    expect(text).not.toContain("\n");
    const saved = JSON.parse(text) as PersistedAppState;
    expect(saved.pmRepos).toEqual(["x/y"]);
    expect(String(firstToolResult(saved.convos?.[0]?.archivedMessages ?? []))).toContain("…[truncated");
    expect(fs.existsSync(s.indexFile)).toBe(false);
  });
});

describe("AtomicFileWriter", () => {
  it("coalesces queued writes so only the newest pending data is produced", async () => {
    const writer = new AtomicFileWriter();
    const file = path.join(dir, "out.json");
    const produced: string[] = [];
    const producer = (value: string) => () => {
      produced.push(value);
      return value;
    };
    const writes = ["1", "2", "3", "4"].map((v) => writer.write(file, producer(v)));
    await Promise.all(writes);
    expect(fs.readFileSync(file, "utf-8")).toBe("4");
    expect(produced).toEqual(["1", "4"]);
    expect(fs.readdirSync(dir).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  it("never lets an older in-flight async write overwrite a newer sync write", async () => {
    const writer = new AtomicFileWriter();
    const file = path.join(dir, "out.json");
    const asyncWrite = writer.write(file, "async-old");
    const queued = writer.write(file, "async-queued");
    writer.writeSync(file, "sync-new");
    await Promise.all([asyncWrite, queued]);
    await writer.flush();
    expect(fs.readFileSync(file, "utf-8")).toBe("sync-new");
  });

  it("serializes removes after writes", async () => {
    const writer = new AtomicFileWriter();
    const file = path.join(dir, "gone.json");
    void writer.write(file, "data");
    await writer.remove(file);
    expect(fs.existsSync(file)).toBe(false);
  });
});
