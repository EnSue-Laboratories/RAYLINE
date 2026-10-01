import { describe, expect, it } from "vitest";
import {
  createConversationSession,
  getPreferredLoadSessionId,
  hasConversationMessages,
  markConversationSessionSynced,
  normalizeConversationState,
  upsertConversationSession,
} from "../conversation/sessions";
import { assistant, convo, user } from "./fixtures";

describe("normalizeConversationState", () => {
  it("migrates legacy sessionId/sessionProvider into the ledger and derives active fields", () => {
    const result = normalizeConversationState(
      convo({ id: "c1", sessionId: "native-1", sessionProvider: "claude", archivedMessages: [user("u1", "hi")] }),
    );
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]).toMatchObject({ provider: "claude", nativeSessionId: "native-1", origin: "legacy", syncedThroughMessageCount: 1 });
    expect(result.activeSessionId).toBe(result.sessions[0]?.id);
    expect(result.providerSessions).toEqual({ claude: "native-1" });
    expect(result.sessionId).toBe("native-1");
    expect(result.lastProvider).toBe("claude");
  });

  it("falls back to lastProvider for a provider-less legacy sessionId", () => {
    const result = normalizeConversationState(convo({ id: "c1", sessionId: "t-1", lastProvider: "codex" }));
    expect(result.sessions[0]).toMatchObject({ provider: "codex", nativeSessionId: "t-1", origin: "legacy-primary" });
  });

  it("strips injected prompt metadata and drops empty user messages", () => {
    const result = normalizeConversationState(
      convo({
        id: "c1",
        archivedMessages: [
          user("u1", "<system-reminder>\nx\n</system-reminder>\n\nreal prompt"),
          user("u2", "<system-reminder>only</system-reminder>"),
          assistant("a1", "answer", { _rateLimits: null }),
        ],
      }),
    );
    expect(result.archivedMessages.map((m) => m.id)).toEqual(["u1", "a1"]);
    expect(result.archivedMessages[0]).toMatchObject({ text: "real prompt" });
    expect(result.archivedMessages[1]).not.toHaveProperty("_rateLimits");
  });

  it("dedupes sessions by provider + native id, keeping the newest", () => {
    const older = createConversationSession({ id: "s1", provider: "claude", nativeSessionId: "n", updatedAt: 1, createdAt: 1 });
    const newer = createConversationSession({ id: "s2", provider: "claude", nativeSessionId: "n", updatedAt: 5, createdAt: 1 });
    const result = normalizeConversationState(convo({ id: "c1", sessions: [older, newer] }));
    expect(result.sessions.map((s) => s.id)).toEqual(["s2"]);
  });
});

describe("upsertConversationSession", () => {
  it("fills in the native id of a pending active session instead of adding one", () => {
    const pending = createConversationSession({ id: "s1", provider: "codex", nativeSessionId: null, createdAt: 1, updatedAt: 1 });
    const base = normalizeConversationState(convo({ id: "c1", sessions: [pending], activeSessionId: "s1" }));
    const next = upsertConversationSession(base, { provider: "codex", nativeSessionId: "thread-9", origin: "capture" }, { preferPendingActive: true });
    expect(next.sessions).toHaveLength(1);
    expect(next.sessions[0]).toMatchObject({ id: "s1", nativeSessionId: "thread-9", origin: "capture" });
    expect(next.providerSessions).toEqual({ codex: "thread-9" });
  });

  it("adds and activates a new session for another provider", () => {
    const base = normalizeConversationState(convo({ id: "c1", sessionId: "n1", sessionProvider: "claude" }));
    const next = upsertConversationSession(base, { provider: "codex", nativeSessionId: "t1" }, { lastProvider: "codex" });
    expect(next.sessions).toHaveLength(2);
    expect(next.sessionProvider).toBe("codex");
    expect(next.lastProvider).toBe("codex");
  });

  it("ignores inputs without a provider", () => {
    const base = normalizeConversationState(convo({ id: "c1" }));
    expect(upsertConversationSession(base, { nativeSessionId: "x" }).sessions).toHaveLength(0);
  });
});

describe("ledger helpers", () => {
  it("markConversationSessionSynced updates only the given session", () => {
    const s = createConversationSession({ id: "s1", provider: "claude", nativeSessionId: "n", createdAt: 1, updatedAt: 1 });
    const result = markConversationSessionSynced(convo({ id: "c1", sessions: [s] }), "s1", 7);
    expect(result.sessions[0]?.syncedThroughMessageCount).toBe(7);
  });

  it("getPreferredLoadSessionId prefers the active session, then lastProvider", () => {
    const a = createConversationSession({ id: "a", provider: "claude", nativeSessionId: "na", updatedAt: 1, createdAt: 1 });
    const b = createConversationSession({ id: "b", provider: "codex", nativeSessionId: "nb", updatedAt: 2, createdAt: 2 });
    expect(getPreferredLoadSessionId(convo({ id: "c", sessions: [a, b], activeSessionId: "a" }))).toBe("na");
    expect(getPreferredLoadSessionId(convo({ id: "c", sessions: [a, b], lastProvider: "claude" }))).toBe("na");
    expect(getPreferredLoadSessionId(convo({ id: "c", sessions: [a, b] }))).toBe("nb");
  });

  it("hasConversationMessages counts archive, synced sessions and live messages", () => {
    expect(hasConversationMessages(convo({ id: "c" }))).toBe(false);
    expect(hasConversationMessages(convo({ id: "c" }), { messages: [user("u", "x")] })).toBe(true);
    const synced = createConversationSession({ provider: "claude", syncedThroughMessageCount: 3 });
    expect(hasConversationMessages(convo({ id: "c", sessions: [synced] }))).toBe(true);
  });
});
