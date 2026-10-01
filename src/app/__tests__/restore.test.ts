import { describe, expect, it } from "vitest";
import { pickRestoredActive, restoreConversations } from "../persist/restore";
import { convo, user } from "./fixtures";

describe("restoreConversations", () => {
  it("keeps the effort and Grok --continue encoded in legacy model ids", () => {
    const [codex, grok, explicit] = restoreConversations(
      [
        convo({ id: "a", model: "gpt55-high", archivedMessages: [user("u", "x")] }),
        convo({ id: "b", model: "grok-46-continue", archivedMessages: [user("u", "x")] }),
        convo({ id: "c", model: "gpt55-high", effort: "low", archivedMessages: [user("u", "x")] }),
      ],
      { withTranscripts: true },
    );
    expect(codex).toMatchObject({ model: "gpt-5.5", effort: "high" });
    expect(grok).toMatchObject({ model: "grok-4.6", grokContinue: true });
    expect(explicit).toMatchObject({ model: "gpt-5.5", effort: "low" });
  });

  it("drops conversations without messages only when transcripts are inline", () => {
    const rows = [convo({ id: "empty" }), convo({ id: "full", archivedMessages: [user("u", "x")] })];
    expect(restoreConversations(rows, { withTranscripts: true }).map((c) => c.id)).toEqual(["full"]);
    expect(restoreConversations(rows, { withTranscripts: false }).map((c) => c.id)).toEqual(["empty", "full"]);
  });

  it("stamps pinned tabs as run-ended and unpins a lone tab", () => {
    const rows = [
      convo({ id: "a", archivedMessages: [user("u", "x")], tab: { pinned: true, pinnedAt: 1 } }),
      convo({ id: "b", archivedMessages: [user("u", "x")], tab: { pinned: true, pinnedAt: 2 } }),
    ];
    const restored = restoreConversations(rows, { withTranscripts: true, now: 42 });
    expect(restored[0]?.tab).toMatchObject({ pinned: true, runEndedAt: 42 });
    const lone = restoreConversations([rows[0] ?? convo({ id: "x" })], { withTranscripts: true, now: 42 });
    expect(lone[0]?.tab?.pinned).toBe(false);
  });

  it("pickRestoredActive falls back to the first conversation", () => {
    const rows = [convo({ id: "a" }), convo({ id: "b" })];
    expect(pickRestoredActive(rows, "b")).toBe("b");
    expect(pickRestoredActive(rows, "zzz")).toBe("a");
    expect(pickRestoredActive([], "b")).toBeNull();
  });
});
