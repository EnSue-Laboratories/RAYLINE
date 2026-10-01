import { describe, expect, it } from "vitest";
import { createTranslator, interpolate, isMessageKey, normalizeLocale, type MessageKey } from "..";
import { enUS } from "../locales/en-US";
import { zhCN } from "../locales/zh-CN";

describe("normalizeLocale", () => {
  it("maps any zh tag to zh-CN and everything else to en-US", () => {
    expect(normalizeLocale("zh")).toBe("zh-CN");
    expect(normalizeLocale("zh-TW")).toBe("zh-CN");
    expect(normalizeLocale("ZH-hans")).toBe("zh-CN");
    expect(normalizeLocale("en-GB")).toBe("en-US");
    expect(normalizeLocale("fr")).toBe("en-US");
    expect(normalizeLocale(undefined)).toBe("en-US");
    expect(normalizeLocale(42)).toBe("en-US");
  });
});

describe("locales", () => {
  it("zh-CN has exactly the en-US key set", () => {
    expect(Object.keys(zhCN).sort()).toEqual(Object.keys(enUS).sort());
  });

  it("zh-CN strings only use placeholders that en-US also defines", () => {
    // zh-CN may drop some (e.g. the English plural `{suffix}`) but never invent new ones.
    const placeholders = (s: string) => new Set(s.match(/\{[^{}]+\}/g) ?? []);
    for (const key of Object.keys(enUS) as MessageKey[]) {
      const allowed = placeholders(enUS[key]);
      const unknown = [...placeholders(zhCN[key])].filter((p) => !allowed.has(p));
      expect([key, unknown]).toEqual([key, []]);
    }
  });
});

describe("createTranslator", () => {
  it("returns a cached function per normalized locale", () => {
    expect(createTranslator("en-US")).toBe(createTranslator("en"));
    expect(createTranslator("zh-CN")).toBe(createTranslator("zh-TW"));
    expect(createTranslator("zh-CN")).not.toBe(createTranslator("en-US"));
  });

  it("translates and interpolates", () => {
    const en = createTranslator("en-US");
    const zh = createTranslator("zh-CN");
    expect(en("sidebar.chatsCount", { value: 3 })).toBe("3 CHATS");
    expect(zh("sidebar.chatsCount", { value: 3 })).toBe("3 个对话");
    expect(en("common.save")).toBe("SAVE");
  });

  it("falls back to the key for unknown keys", () => {
    const en = createTranslator("en-US");
    expect(en("does.not.exist" as MessageKey)).toBe("does.not.exist");
  });
});

describe("interpolate", () => {
  it("replaces every occurrence of known placeholders", () => {
    expect(interpolate("{a}+{a}={b}", { a: 1, b: 2 })).toBe("1+1=2");
  });

  it("leaves unknown placeholders and templates without params untouched", () => {
    expect(interpolate("{a} {missing}", { a: "x" })).toBe("x {missing}");
    expect(interpolate("{a}")).toBe("{a}");
  });

  it("stringifies null/undefined/boolean like String()", () => {
    expect(interpolate("{a}|{b}|{c}", { a: null, b: undefined, c: false })).toBe("null|undefined|false");
  });

  it("does not re-scan substituted text", () => {
    expect(interpolate("{a} {b}", { a: "{b}", b: "B" })).toBe("{b} B");
  });
});

describe("isMessageKey", () => {
  it("accepts only own en-US keys", () => {
    expect(isMessageKey("common.save")).toBe(true);
    expect(isMessageKey("toString")).toBe(false);
    expect(isMessageKey(1)).toBe(false);
  });
});
