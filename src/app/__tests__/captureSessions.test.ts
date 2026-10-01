import { describe, expect, it } from "vitest";
import { applySessionCaptures, findNewSessionCaptures } from "../effects/captureSessions";
import { createConversationSession, normalizeConversationState } from "../conversation/sessions";
import { convo, live } from "./fixtures";

describe("session capture", () => {
  it("records new native ids per provider, mapping Claude/Codex to remote providers in use", () => {
    const pending = createConversationSession({ id: "s1", provider: "remote-codex", createdAt: 1, updatedAt: 1 });
    const normalized = normalizeConversationState(convo({ id: "c", sessions: [pending], activeSessionId: "s1" }));
    const data = { ...live([]), _codexThreadId: "t-1", _grokSessionId: "g-1" };
    const captures = findNewSessionCaptures(normalized, normalized.sessions[0] ?? null, data);
    expect(captures).toEqual([
      { provider: "remote-codex", nativeSessionId: "t-1" },
      { provider: "grok", nativeSessionId: "g-1" },
    ]);
    const next = applySessionCaptures(normalized, normalized.sessions[0] ?? null, captures);
    expect(next.providerSessions).toEqual({ "remote-codex": "t-1", grok: "g-1" });
    expect(next.sessions.find((s) => s.id === "s1")?.nativeSessionId).toBe("t-1");
    expect(findNewSessionCaptures(next, null, data)).toEqual([]);
  });
});
