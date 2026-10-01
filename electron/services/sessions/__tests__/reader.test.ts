import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AssistantMessage, ChatMessage, ToolPart } from "@shared/chat/types";
import { MAX_MESSAGES, createSessionReader, type SessionReader } from "../reader";
import {
  assistant,
  claudeSessionPath,
  codexAssistant,
  codexMeta,
  codexRolloutPath,
  codexUser,
  makeRoots,
  toolResult,
  user,
  writeJsonl,
  type FixtureRoots,
} from "./fixtures";

const CWD = "/work/demo-app";
const PROJECT = "-work-demo-app";
const THREAD = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";

function toolParts(message: ChatMessage | undefined): ToolPart[] {
  if (message?.role !== "assistant") return [];
  return (message.parts ?? []).filter((p): p is ToolPart => p.type === "tool");
}

let roots: FixtureRoots;
let reader: SessionReader;

beforeEach(async () => {
  roots = await makeRoots();
  reader = createSessionReader(roots);
});

afterEach(async () => {
  await roots.cleanup();
});

describe("loadSessionMessages (claude)", () => {
  it("parses messages, links every tool result and reads the cwd", async () => {
    await writeJsonl(claudeSessionPath(roots, PROJECT, "s1"), [
      { type: "summary", summary: "ignored" },
      user("<system-reminder>hidden</system-reminder>Fix the build", { uuid: "u-1", cwd: CWD }),
      assistant([
        { type: "text", text: "Looking." },
        { type: "tool_use", id: "t1", name: "Bash", input: { command: "ls" } },
        { type: "tool_use", id: "t2", name: "Read", input: { file_path: "a.ts" } },
      ], { uuid: "a-1" }),
      toolResult("t1", "file-a\nfile-b"),
      toolResult("t2", [{ type: "text", text: "contents" }]),
      assistant([{ type: "text", text: "Done." }]),
      user("Base directory for this skill: /x"),
      "not json at all",
    ]);

    const session = await reader.loadSessionMessages("s1");
    expect(session.provider).toBe("claude");
    expect(session.cwd).toBe(CWD);
    expect(session.messages).toHaveLength(2);
    expect(session.messages[0]).toEqual({ id: "u-1", role: "user", text: "Fix the build" });

    const reply = session.messages[1] as AssistantMessage;
    expect(reply.id).toBe("a-1");
    expect(reply.parts?.map((p) => p.type)).toEqual(["text", "tool", "tool", "text"]);
    const [t1, t2] = toolParts(reply);
    expect(t1?.result).toBe("file-a\nfile-b");
    expect(t2?.result).toBe(JSON.stringify([{ type: "text", text: "contents" }]));
  });

  it("keeps only the most recent MAX_MESSAGES messages", async () => {
    const events: unknown[] = [];
    for (let i = 0; i < MAX_MESSAGES + 10; i += 1) {
      events.push(user(`q${i}`, { uuid: `u${i}` }), assistant([{ type: "text", text: `a${i}` }], { uuid: `a${i}` }));
    }
    await writeJsonl(claudeSessionPath(roots, PROJECT, "long"), events);
    const session = await reader.loadSessionMessages("long");
    expect(session.messages).toHaveLength(MAX_MESSAGES);
    expect(session.messages.at(-1)?.id).toBe(`a${MAX_MESSAGES + 9}`);
  });

  it("returns the not-found shape for unknown ids", async () => {
    await expect(reader.loadSessionMessages("nope")).resolves.toEqual({ messages: [], cwd: null, provider: null });
  });

  it("finds a session written after the index was built", async () => {
    await writeJsonl(claudeSessionPath(roots, PROJECT, "first"), [user("one", { cwd: CWD })]);
    expect((await reader.loadSessionMessages("first")).provider).toBe("claude");

    await writeJsonl(claudeSessionPath(roots, PROJECT, "later"), [user("two", { cwd: CWD })]);
    const [a, b] = await Promise.all([reader.loadSessionMessages("later"), reader.loadSessionMessages("later")]);
    expect(a.messages[0]).toMatchObject({ text: "two" });
    expect(b.messages[0]).toMatchObject({ text: "two" });
  });
});

describe("loadSessionMessages (codex)", () => {
  it("parses the rollout and attaches usage to the last assistant message", async () => {
    await writeJsonl(codexRolloutPath(roots, THREAD), [
      codexMeta(THREAD, CWD),
      { type: "event_msg", payload: { type: "task_started", model_context_window: 272000 } },
      codexUser("<environment_context>cwd</environment_context>"),
      codexUser("System context for this run:\nstuff\n--- USER PROMPT ---\nRename the module"),
      { type: "event_msg", payload: { type: "user_message", message: "Rename the module" } },
      codexAssistant("Renamed."),
      codexAssistant("Also updated imports."),
      {
        type: "event_msg",
        payload: {
          type: "token_count",
          info: { last_token_usage: { input_tokens: 10, output_tokens: 5, cached_input_tokens: 2 }, model_context_window: 272000 },
          rate_limits: { primary: { used_percent: 12.5, resets_at: 1700000000, window_minutes: 300 }, plan_type: "pro" },
        },
      },
    ]);

    const session = await reader.loadSessionMessages(THREAD);
    expect(session.provider).toBe("codex");
    expect(session.cwd).toBe(CWD);
    expect(session.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(session.messages[0]).toMatchObject({ text: "Rename the module" });
    const reply = session.messages[1] as AssistantMessage;
    expect(reply.parts).toHaveLength(2);
    expect(reply._usage).toEqual({
      input_tokens: 10,
      output_tokens: 5,
      total_tokens: null,
      cache_read_input_tokens: 2,
      cache_creation_input_tokens: 0,
      context_window: 272000,
    });
    expect(reply._rateLimits).toEqual({
      five_hour: { used_percent: 12.5, resets_at: 1700000000, window_minutes: 300 },
      plan_type: "pro",
    });
    expect(session.usageSnapshot).toEqual(reply._usage);
  });
});

describe("listSessions", () => {
  it("lists claude and codex sessions for the cwd, newest first", async () => {
    await writeJsonl(claudeSessionPath(roots, PROJECT, "old"), [user("Old question", { cwd: CWD })], 1_000_000);
    await writeJsonl(
      claudeSessionPath(roots, PROJECT, "new"),
      [user("<system-reminder>x</system-reminder>  "), user([{ type: "text", text: "Newest question" }])],
      3_000_000,
    );
    await writeJsonl(codexRolloutPath(roots, THREAD), [codexMeta(THREAD, CWD), codexUser("# AGENTS"), codexUser("Codex question")], 2_000_000);
    await writeJsonl(codexRolloutPath(roots, "0199a1b2-0000-7e5f-8a9b-0c1d2e3f4a5b"), [codexMeta("other", "/elsewhere"), codexUser("x")]);

    const sessions = await reader.listSessions(CWD);
    expect(sessions.map((s) => [s.id, s.provider, s.title])).toEqual([
      ["new", "claude", "Newest question"],
      [THREAD, "codex", "Codex question"],
      ["old", "claude", "Old question"],
    ]);
    expect(sessions.every((s) => s.cwd === CWD && s.model === null)).toBe(true);
  });

  it("still lists codex sessions when the cwd has no claude project dir", async () => {
    await writeJsonl(codexRolloutPath(roots, THREAD), [codexMeta(THREAD, CWD), codexUser("Only codex")]);
    const sessions = await reader.listSessions(CWD);
    expect(sessions.map((s) => s.title)).toEqual(["Only codex"]);
  });

  it("picks up a title that is written after the first listing", async () => {
    const file = codexRolloutPath(roots, THREAD);
    await writeJsonl(file, [codexMeta(THREAD, CWD)]);
    expect((await reader.listSessions(CWD)).map((s) => s.title)).toEqual(["Untitled"]);
    await writeJsonl(file, [codexMeta(THREAD, CWD), codexUser("Arrived later")]);
    expect((await reader.listSessions(CWD)).map((s) => s.title)).toEqual(["Arrived later"]);
  });
});

describe("loadSessionSearchText", () => {
  it("flattens every message including tool results", async () => {
    await writeJsonl(claudeSessionPath(roots, PROJECT, "s"), [
      user("needle question", { cwd: CWD }),
      assistant([{ type: "tool_use", id: "t", name: "Grep", input: { pattern: "haystack" } }]),
      toolResult("t", "found-the-needle"),
    ]);
    const result = await reader.loadSessionSearchText("s");
    expect(result.provider).toBe("claude");
    expect(result.cwd).toBe(CWD);
    expect(result.text).toContain("needle question");
    expect(result.text).toContain("found-the-needle");
    expect(result.text).toContain('"pattern":"haystack"');
    await expect(reader.loadSessionSearchText("missing")).resolves.toEqual({ text: "", cwd: null, provider: null });
  });
});

describe("moveSession / findSessionCwd", () => {
  it("copies the session into the new project dir and prefers the copy", async () => {
    const source = await writeJsonl(claudeSessionPath(roots, PROJECT, "mv"), [user("hello", { cwd: CWD })]);
    expect(reader.findSessionCwd("mv")).toBe(CWD);
    expect(reader.moveSession("mv", "/work/other")).toBe(true);

    const target = claudeSessionPath(roots, "-work-other", "mv");
    expect(await readFile(target, "utf8")).toBe(await readFile(source, "utf8"));
    await writeJsonl(target, [user("hello", { cwd: "/work/other" }), user("continued")]);
    const loaded = await reader.loadSessionMessages("mv");
    expect(loaded.messages.map((m) => (m.role === "user" ? m.text : ""))).toEqual(["hello", "continued"]);

    expect(reader.moveSession("missing", "/x")).toBe(false);
    await expect(reader.moveSessionAsync("mv", "/work/third")).resolves.toBe(true);
    // The third copy came from the (preferred) second one.
    await expect(reader.findSessionCwdAsync("mv")).resolves.toBe("/work/other");
  });
});
