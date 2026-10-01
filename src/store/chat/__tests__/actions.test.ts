import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStreamPayload } from "@shared/agent/events";
import type { ChatMessage } from "@shared/chat/types";
import {
  appendLocalMessages,
  applyStreamPayloads,
  cancelMessage,
  editAndResend,
  loadMessages,
  markMulticaConnected,
  prepareMessage,
  replaceMessages,
  startPreparedMessage,
} from "../actions";
import { handleAgentDone, handleAgentError } from "../agentBridge";
import { conversationsStore, getConversation, getLastCommitPriority, resetConversationsStoreForTests } from "../store";
import { assistant, convo } from "./helpers";

const api = {
  agentStart: vi.fn(),
  agentCancel: vi.fn(),
  agentEditAndResend: vi.fn(),
  loadSession: vi.fn(),
};

const dispatchEvent = vi.fn();

beforeEach(() => {
  resetConversationsStoreForTests();
  dispatchEvent.mockReset();
  vi.stubGlobal("window", { api, dispatchEvent, setTimeout, clearTimeout });
  for (const fn of Object.values(api)) fn.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const user: ChatMessage = { id: "u1", role: "user", text: "hi" };

describe("send lifecycle", () => {
  it("prepareMessage appends user + streaming assistant and gates startPreparedMessage", () => {
    const pendingId = prepareMessage({ conversationId: "c1", prompt: "hello" });
    const data = getConversation("c1");
    expect(data.isStreaming).toBe(true);
    expect(data.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(startPreparedMessage({ conversationId: "c1", pendingId: "stale", prompt: "hello" })).toBe(false);
    expect(startPreparedMessage({ conversationId: "c1", pendingId, prompt: "hello", provider: "multica", multicaToken: "tok" })).toBe(true);
    expect(api.agentStart).toHaveBeenCalledWith(expect.objectContaining({ conversationId: "c1", prompt: "hello", _multicaToken: "tok" }));
    expect(api.agentStart.mock.calls[0]?.[0]).not.toHaveProperty("pendingId");
  });

  it("cancel before start finalizes the placeholder and tells main", () => {
    prepareMessage({ conversationId: "c1", prompt: "hello" });
    const before = getConversation("c1").messages[0];
    cancelMessage("c1");
    const data = getConversation("c1");
    expect(data.isStreaming).toBe(false);
    expect(data.messages[1]).toMatchObject({ isStreaming: false, isThinking: false });
    expect(data.messages[0]).toBe(before);
    expect(api.agentCancel).toHaveBeenCalledWith({ conversationId: "c1" });
    expect(startPreparedMessage({ conversationId: "c1", pendingId: "anything", prompt: "x" })).toBe(false);
  });

  it("editAndResend truncates, resets the entry and forks the session", () => {
    resetConversationsStoreForTests(new Map([["c1", convo([user, assistant(), { id: "u2", role: "user", text: "two" }], { _claudeSessionId: "s" })]]));
    expect(editAndResend({ conversationId: "c1", sessionId: "s", messageIndex: 2, newText: "edited" })).toBe(true);
    const data = getConversation("c1");
    expect(data.messages.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(data.messages[2]).toMatchObject({ text: "edited" });
    expect(data._claudeSessionId).toBeUndefined();
    expect(api.agentEditAndResend).toHaveBeenCalledWith(expect.objectContaining({ resumeSessionId: "s", forkSession: true, prompt: "edited" }));
  });
});

describe("loading / replacing", () => {
  it("loadMessages seeds only empty conversations", () => {
    loadMessages("c1", [user]);
    expect(getConversation("c1").messages).toEqual([user]);
    loadMessages("c1", []);
    expect(getConversation("c1").messages).toEqual([user]);
  });

  it("replaceMessages / appendLocalMessages assign ids and stop streaming", () => {
    replaceMessages("c1", [{ role: "user", text: "a" }]);
    appendLocalMessages("c1", [{ role: "system", text: "out", mode: "shell-result" }]);
    const data = getConversation("c1");
    expect(data.isStreaming).toBe(false);
    expect(data.messages.every((m) => typeof m.id === "string" && m.id.length > 0)).toBe(true);
    replaceMessages("c1", null);
    expect(getConversation("c1").messages).toEqual([]);
  });

  it("markMulticaConnected is idempotent", () => {
    markMulticaConnected("c1");
    const state = conversationsStore.getState();
    markMulticaConnected("c1");
    expect(conversationsStore.getState()).toBe(state);
    expect(getConversation("c1").multicaConnected).toBe(true);
  });
});

describe("stream application", () => {
  it("applies a batch with one commit and keeps other conversations by identity", () => {
    const other = convo([user]);
    resetConversationsStoreForTests(new Map([["c1", convo([user])], ["c2", other]]));
    const listener = vi.fn();
    const unsubscribe = conversationsStore.subscribe(listener);
    const priorities: string[] = [];
    const unsubscribePriority = conversationsStore.subscribe(() => priorities.push(getLastCommitPriority()));
    const batch: AgentStreamPayload[] = [
      { conversationId: "c1", event: { type: "stream_event", event: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } } } },
      { conversationId: "c1", event: { type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "x" } } } },
    ];
    applyStreamPayloads(batch, "transition");
    unsubscribe();
    unsubscribePriority();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(priorities).toEqual(["transition"]);
    expect(getLastCommitPriority()).toBe("urgent");
    expect(conversationsStore.getState().byId.get("c2")).toBe(other);
  });

  it("dispatches the multica agent status effect after commit", () => {
    applyStreamPayloads([{ conversationId: "c1", event: { type: "multica:agent:status", payload: { agent: { id: "a", name: "A" } } } }]);
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
  });
});

describe("agent-done / agent-error", () => {
  it("done finalizes live assistants only and keeps finished ones by identity", () => {
    const finished: ChatMessage = { id: "old", role: "assistant", parts: [], isStreaming: false, isThinking: false, _elapsedMs: 5 };
    resetConversationsStoreForTests(new Map([["c1", convo([finished, user, assistant()])]]));
    handleAgentDone(null, { conversationId: "c1", exitCode: 0 });
    const data = getConversation("c1");
    expect(data.isStreaming).toBe(false);
    expect(data.messages[0]).toBe(finished);
    expect(data.messages[2]).toMatchObject({ isStreaming: false });
  });

  it("done with a Codex thread schedules usage hydration when usage is missing", async () => {
    api.loadSession.mockResolvedValue({ messages: [], cwd: null, provider: "codex", usageSnapshot: { input_tokens: 9 }, rateLimitsSnapshot: null });
    resetConversationsStoreForTests(new Map([["c1", convo([user, assistant()])]]));
    handleAgentDone(null, { conversationId: "c1", provider: "codex", threadId: "th" });
    expect(getConversation("c1")._codexThreadId).toBe("th");
    await vi.waitFor(() => expect(getConversation("c1").messages[1]).toMatchObject({ _usage: { input_tokens: 9 } }));
  });

  it("error merges into the entry instead of replacing it (keeps session ids)", () => {
    resetConversationsStoreForTests(new Map([["c1", convo([user, assistant()], { _codexThreadId: "th", _claudeSessionId: "s", multicaConnected: true })]]));
    handleAgentError(null, { conversationId: "c1", error: "crashed" });
    const data = getConversation("c1");
    expect(data).toMatchObject({ error: "crashed", isStreaming: false, _codexThreadId: "th", _claudeSessionId: "s", multicaConnected: true });
    expect(data.messages[1]).toMatchObject({ isStreaming: false, parts: [{ type: "error", title: "Error", summary: "crashed", text: "crashed" }] });
  });

  it("done stores Grok / AGY / OpenCode native ids from threadId", () => {
    resetConversationsStoreForTests(new Map([["c1", convo([user, assistant()])]]));
    handleAgentDone(null, { conversationId: "c1", provider: "grok", threadId: "g-9" });
    expect(getConversation("c1")._grokSessionId).toBe("g-9");
    handleAgentDone(null, { conversationId: "c1", provider: "agy", threadId: "a-9" });
    expect(getConversation("c1")._agySessionId).toBe("a-9");
    handleAgentDone(null, { conversationId: "c1", provider: "opencode", threadId: "o-9" });
    expect(getConversation("c1")._opencodeSessionId).toBe("o-9");
  });

  it("startPreparedMessage forwards grokContinue", () => {
    const pendingId = prepareMessage({ conversationId: "c1", prompt: "x" });
    startPreparedMessage({ conversationId: "c1", pendingId, prompt: "x", provider: "grok", grokContinue: true });
    expect(api.agentStart).toHaveBeenCalledWith(expect.objectContaining({ provider: "grok", grokContinue: true }));
  });

  it("error on an unknown conversation creates an idle entry with the error", () => {
    handleAgentError(null, { conversationId: "new", error: "launch failed" });
    expect(getConversation("new")).toEqual({ messages: [], isStreaming: false, error: "launch failed" });
  });
});
