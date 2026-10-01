import { describe, expect, it } from "vitest";
import type { ChatMessage, TextPart } from "@shared/chat/types";
import { ConversationDraft, StoreDraft } from "../draft";
import type { ConversationRuntime } from "../types";
import { assistant, convo, run, se } from "./helpers";

const user: ChatMessage = { id: "u1", role: "user", text: "hi" };

describe("ConversationDraft copy-on-write", () => {
  it("copies conversation, messages, message, parts and part at most once per flush", () => {
    const textPart: TextPart = { type: "text", text: "a", _streamKey: "0:0" };
    const otherPart: TextPart = { type: "text", text: "old" };
    const base = convo([user, assistant([otherPart, textPart])]);
    const baseSnapshot = structuredClone(base);
    const draft = new ConversationDraft("c1", base);

    const message = draft.editAssistant(1);
    if (!message) throw new Error("missing assistant");
    const part1 = draft.editPart(message, 1);
    const part2 = draft.editPart(message, 1);
    expect(part1).toBe(part2);
    expect(draft.editAssistant(1)).toBe(message);
    expect(draft.editParts(message)).toBe(draft.editParts(message));

    if (part1?.type === "text") part1.text += "b";
    const result = draft.result();
    // Base is never mutated.
    expect(base).toEqual(baseSnapshot);
    expect(result).not.toBe(base);
    expect(result?.messages).not.toBe(base.messages);
    // Untouched message and part keep identity.
    expect(result?.messages[0]).toBe(user);
    const resultParts = result?.messages[1]?.role === "assistant" ? result.messages[1].parts : undefined;
    expect(resultParts?.[0]).toBe(otherPart);
    expect(resultParts?.[1]).not.toBe(textPart);
    expect(resultParts?.[1]).toEqual({ ...textPart, text: "ab" });
  });

  it("reports no change and keeps the base when nothing is written", () => {
    const base = convo([user]);
    const draft = new ConversationDraft("c1", base);
    draft.set("isStreaming", true);
    expect(draft.changed).toBe(false);
    expect(draft.result()).toBe(base);
  });

  it("does not create a missing conversation unless touched", () => {
    const draft = new ConversationDraft("c1", undefined);
    expect(draft.exists).toBe(false);
    expect(draft.result()).toBeUndefined();
    draft.touch();
    expect(draft.result()).toEqual({ messages: [], isStreaming: true, error: null });
  });

  it("replace drops every field not in the new value", () => {
    const base = convo([user], { _claudeSessionId: "s", multicaConnected: true });
    const draft = new ConversationDraft("c1", base);
    draft.replace({ messages: [], isStreaming: false, error: null });
    expect(draft.result()).toEqual({ messages: [], isStreaming: false, error: null });
  });
});

describe("StoreDraft", () => {
  it("returns the same map when no conversation changed", () => {
    const base: ReadonlyMap<string, ConversationRuntime> = new Map([["c1", convo([user])]]);
    const draft = new StoreDraft(base);
    draft.conversation("c1");
    draft.conversation("missing");
    expect(draft.commit()).toBe(base);
  });

  it("copies the map once and keeps untouched conversations by identity", () => {
    const other = convo([user]);
    const base: ReadonlyMap<string, ConversationRuntime> = new Map([["c1", convo([user, assistant()])], ["c2", other]]);
    const draft = new StoreDraft(base);
    draft.conversation("c1").set("error", "boom");
    draft.conversation("c3", () => ({ messages: [], isStreaming: false, error: null })).touch();
    const next = draft.commit();
    expect(next).not.toBe(base);
    expect(next.get("c2")).toBe(other);
    expect(next.get("c1")?.error).toBe("boom");
    expect([...next.keys()]).toEqual(["c1", "c2", "c3"]);
  });
});

describe("one draft per flush", () => {
  it("many text deltas yield one copy of the streaming part; earlier messages untouched", () => {
    const earlier: ChatMessage = { id: "old", role: "assistant", parts: [{ type: "text", text: "done" }] };
    const base = convo([earlier, user]);
    const { result } = run(
      base,
      se({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
      se({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hel" } }),
      se({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "lo" } }),
    );
    expect(result?.messages[0]).toBe(earlier);
    expect(result?.messages[1]).toBe(user);
    const last = result?.messages[2];
    expect(last?.role === "assistant" && last.parts?.[0]).toMatchObject({ type: "text", text: "Hello" });
  });

  it("a second flush copies again and leaves the first flush's objects frozen", () => {
    const first = run(convo([user]), se({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }), se({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "a" } })).result;
    const snapshot = structuredClone(first);
    const second = run(first, se({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "b" } })).result;
    expect(first).toEqual(snapshot);
    expect(second?.messages[0]).toBe(first?.messages[0]);
    const lastFirst = first?.messages[1];
    const lastSecond = second?.messages[1];
    expect(lastSecond).not.toBe(lastFirst);
    expect(lastSecond?.role === "assistant" && lastSecond.parts?.[0]).toMatchObject({ text: "ab" });
  });
});
