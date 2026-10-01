import { describe, expect, it } from "vitest";
import {
  buildOpenCodeConfigOverlay,
  buildOpenCodeRunArgs,
  buildPromptParts,
  normalizeOpenCodeRuntimeConfig,
  parseOpenCodeModel,
  shouldEnableThinking,
} from "../config";
import {
  createOpenCodeServerStreamState,
  extractOpenCodeErrorMessage,
  extractOpenCodeSessionId,
  extractSseData,
  isOpenCodeIdleEvent,
  normalizeOpenCodeServerEvent,
  parseOpenCodeRunLine,
  readPermissionRequest,
} from "../parser";

const NOW = 1_700_000_000_000;

describe("OpenCode config", () => {
  it("parses provider/model ids", () => {
    expect(parseOpenCodeModel("deepseek/deepseek-reasoner")).toEqual({ providerID: "deepseek", modelID: "deepseek-reasoner" });
    expect(parseOpenCodeModel("noslash")).toBeNull();
    expect(parseOpenCodeModel("/x")).toBeNull();
  });

  it("infers thinking mode unless explicitly set", () => {
    expect(shouldEnableThinking("deepseek/deepseek-r1", undefined)).toBe(true);
    expect(shouldEnableThinking("qwen/qwen3-coder", undefined)).toBe(true);
    expect(shouldEnableThinking("openai/gpt-4o", undefined)).toBe(false);
    expect(shouldEnableThinking("openai/gpt-4o", true)).toBe(true);
    expect(shouldEnableThinking("deepseek/deepseek-r1", false)).toBe(false);
  });

  it("injects credentials through env references, never on disk", () => {
    expect(normalizeOpenCodeRuntimeConfig({ providerId: "bad id!", apiKey: "k" }, null)).toBeNull();
    expect(normalizeOpenCodeRuntimeConfig({}, "acme/model")).toBeNull();
    const overlay = buildOpenCodeConfigOverlay({ apiKey: " sk-1 ", baseURL: "https://api.acme.dev" }, "acme/model");
    expect(overlay?.env).toEqual({ RAYLINE_OPENCODE_API_KEY: "sk-1", RAYLINE_OPENCODE_BASE_URL: "https://api.acme.dev" });
    expect(overlay?.configJson).not.toContain("sk-1");
    expect(JSON.parse(overlay?.configJson ?? "{}")).toEqual({
      $schema: "https://opencode.ai/config.json",
      provider: { acme: { options: { apiKey: "{env:RAYLINE_OPENCODE_API_KEY}", baseURL: "{env:RAYLINE_OPENCODE_BASE_URL}" } } },
    });
  });

  it("builds run args with session, fork, model and files", () => {
    expect(buildOpenCodeRunArgs({ cwd: "/w", sessionId: "ses_1", forkSession: true, model: "a/b", filePaths: ["/f", "/img.png"], prompt: "p" })).toEqual([
      "run",
      "--format",
      "json",
      "--dangerously-skip-permissions",
      "--dir",
      "/w",
      "--session",
      "ses_1",
      "--fork",
      "--model",
      "a/b",
      "--file",
      "/f",
      "--file",
      "/img.png",
      "--",
      "p",
    ]);
  });

  it("sends images as file parts", () => {
    expect(buildPromptParts("hi", ["data:image/png;base64,QQ==", "nope"])).toEqual([
      { type: "text", text: "hi" },
      { type: "file", mime: "image/png", filename: "rayline-image-1", url: "data:image/png;base64,QQ==" },
    ]);
  });
});

describe("run --format json lines", () => {
  it("forwards known events and wraps plain output", () => {
    const text = parseOpenCodeRunLine('{"type":"text","sessionID":"ses_1","part":{"id":"p1","type":"text","text":"hi"}}');
    expect(text?.kind).toBe("event");
    expect(extractOpenCodeSessionId(text?.kind === "event" ? text.event : null)).toBe("ses_1");
    expect(parseOpenCodeRunLine("Loading model…")).toEqual({ kind: "stdout", event: { type: "opencode_stdout", text: "Loading model…\n" } });
    expect(parseOpenCodeRunLine('{"type":"unknown_thing"}')).toEqual({ kind: "ignored", type: "unknown_thing" });
  });

  it("extracts error messages from every known spelling", () => {
    expect(extractOpenCodeErrorMessage({ type: "error", message: " m " })).toBe("m");
    expect(extractOpenCodeErrorMessage({ type: "error", error: "e" })).toBe("e");
    expect(extractOpenCodeErrorMessage({ type: "error", error: { message: "nested" } })).toBe("nested");
    expect(extractOpenCodeErrorMessage({ type: "error", error: { data: { message: "deep" } } })).toBe("deep");
    expect(extractOpenCodeErrorMessage({ type: "error" })).toBeNull();
  });
});

describe("serve SSE normalization", () => {
  it("reassembles deltas onto the part text and skips user messages", () => {
    const state = createOpenCodeServerStreamState(null);
    normalizeOpenCodeServerEvent({ type: "message.updated", properties: { info: { id: "u1", role: "user" } } }, state, NOW);
    expect(normalizeOpenCodeServerEvent({ type: "message.part.updated", properties: { part: { id: "up", messageID: "u1", type: "text", text: "me" } } }, state, NOW)).toEqual([]);

    const started = normalizeOpenCodeServerEvent(
      { type: "message.part.updated", properties: { part: { id: "r1", messageID: "a1", sessionID: "ses_9", type: "reasoning", text: "Th", time: { start: 5 } } } },
      state,
      NOW,
    );
    expect(started).toMatchObject([{ type: "reasoning", reasoning: "Th", sessionID: "ses_9" }]);
    expect(state.sessionId).toBe("ses_9");

    const delta = normalizeOpenCodeServerEvent({ type: "message.part.delta", properties: { partID: "r1", messageID: "a1", sessionID: "ses_9", delta: "ink" } }, state, NOW);
    expect(delta).toMatchObject([{ type: "reasoning", reasoning: "Think", part: { time: { start: 5 } }, timestamp: NOW }]);
  });

  it("maps step / tool parts and session errors", () => {
    const state = createOpenCodeServerStreamState("ses_1");
    expect(normalizeOpenCodeServerEvent({ type: "message.part.updated", properties: { part: { id: "s", type: "step-finish", reason: "stop" } } }, state, NOW)).toMatchObject([
      { type: "step_finish", reason: "stop" },
    ]);
    expect(normalizeOpenCodeServerEvent({ type: "message.part.updated", properties: { part: { id: "t", type: "tool", tool: "bash" } } }, state, NOW)[0]?.type).toBe("tool_use");
    expect(normalizeOpenCodeServerEvent({ type: "session.error", properties: { error: { message: "quota" }, sessionID: "ses_1" } }, state, NOW)).toEqual([
      { type: "error", message: "quota", error: "quota", sessionID: "ses_1" },
    ]);
  });

  it("detects idle, permission requests and SSE data", () => {
    expect(isOpenCodeIdleEvent({ type: "session.idle", properties: { sessionID: "a" } }, "a")).toBe(true);
    expect(isOpenCodeIdleEvent({ type: "session.idle", properties: { sessionID: "b" } }, "a")).toBe(false);
    expect(isOpenCodeIdleEvent({ type: "session.status", properties: { status: { type: "idle" } } }, "a")).toBe(true);
    expect(isOpenCodeIdleEvent({ type: "session.status", properties: { status: { type: "busy" } } }, "a")).toBe(false);
    expect(readPermissionRequest({ type: "permission.updated", properties: { id: "perm", sessionID: "a" } }, "a")).toEqual({ sessionId: "a", permissionId: "perm" });
    expect(readPermissionRequest({ type: "permission.updated", properties: { id: "perm", sessionID: "b" } }, "a")).toBeNull();
    expect(extractSseData('event: x\ndata: {"a":\ndata: 1}')).toBe('{"a":\n1}');
  });
});
