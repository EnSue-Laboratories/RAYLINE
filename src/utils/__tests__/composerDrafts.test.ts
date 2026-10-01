import { beforeEach, describe, expect, it } from "vitest";
import { clearDraft, readDraft, resetDraftCacheForTests, writeDraft, type DraftStorage } from "../composerDrafts";

function memoryStorage(): DraftStorage & { data: Map<string, string>; writes: string[] } {
  const data = new Map<string, string>();
  const writes: string[] = [];
  return {
    data,
    writes,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      writes.push(key);
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

describe("composerDrafts", () => {
  beforeEach(() => resetDraftCacheForTests());

  it("round-trips fields and attachments through storage", () => {
    const storage = memoryStorage();
    writeDraft("c1", { text: "hi", model: "opus", attachments: [{ name: "a.png" }] }, storage);
    resetDraftCacheForTests();
    expect(readDraft("c1", storage)).toEqual({ text: "hi", model: "opus", attachments: [{ name: "a.png" }] });
  });

  it("reads legacy plain-text drafts", () => {
    const storage = memoryStorage();
    storage.setItem("rayline.composerDraft:c2", "old text");
    expect(readDraft("c2", storage)).toEqual({ text: "old text" });
  });

  it("serializes attachments only when they change", () => {
    const storage = memoryStorage();
    const attachments = [{ name: "big.png" }];
    writeDraft("c3", { text: "a", attachments }, storage);
    writeDraft("c3", { text: "ab", attachments }, storage);
    writeDraft("c3", { text: "abc", attachments }, storage);
    expect(storage.writes.filter((k) => k.endsWith(":attachments"))).toHaveLength(1);
  });

  it("keeps drafts in memory when storage throws", () => {
    const failing: DraftStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => undefined,
    };
    writeDraft("c4", { text: "safe" }, failing);
    expect(readDraft("c4", failing)).toEqual({ text: "safe" });
  });

  it("clears both keys", () => {
    const storage = memoryStorage();
    writeDraft("c5", { text: "x", attachments: [1] }, storage);
    clearDraft("c5", storage);
    expect(storage.data.size).toBe(0);
  });
});
