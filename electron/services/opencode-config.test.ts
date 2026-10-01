import { describe, expect, it } from "vitest";
import { parseJsonc, stripJsonComments } from "./json-comments";
import {
  applyOpenCodeConfigInput,
  buildOpenCodeStatusSnapshot,
  collectAuthProviders,
  extractProviderConfig,
  normalizeOpenCodeConfigInput,
  parseOpenCodeModelProviders,
} from "./opencode-config";

describe("stripJsonComments", () => {
  it("removes line and block comments outside strings", () => {
    const input = '{\n  // comment\n  "a": "http://x", /* block */ "b": \'//kept\'\n}';
    expect(stripJsonComments(input)).toBe('{\n  \n  "a": "http://x",  "b": \'//kept\'\n}');
    expect(parseJsonc('{"a": 1 // trailing\n}')).toEqual({ a: 1 });
  });

  it("keeps escaped quotes inside strings", () => {
    expect(parseJsonc('{"a": "q\\" // not a comment"}')).toEqual({ a: 'q" // not a comment' });
  });

  it("treats empty documents as {} and throws on invalid JSON", () => {
    expect(parseJsonc("  \n")).toEqual({});
    expect(() => parseJsonc("{")).toThrow();
  });
});

describe("OpenCode config", () => {
  it("collects auth providers from every known layout", () => {
    expect(collectAuthProviders({ provider: { a: {} } })).toEqual(["a"]);
    expect(collectAuthProviders({ providers: { b: {} } })).toEqual(["b"]);
    expect(collectAuthProviders({ c: { type: "api" }, d: "x" })).toEqual(["c"]);
    expect(collectAuthProviders(null)).toEqual([]);
  });

  it("derives status", () => {
    const status = buildOpenCodeStatusSnapshot({
      binPath: "/bin/opencode",
      configPath: "/c",
      authPath: "/a",
      config: { model: "x/y", provider: { x: { options: { apiKey: "k" } } } },
      auth: {},
      configExists: true,
      authExists: false,
    });
    expect(status).toMatchObject({ installed: true, configured: true, model: "x/y", providers: ["x"], smallModel: "" });
    expect(buildOpenCodeStatusSnapshot({ ...status, binPath: null, config: {}, auth: {}, configExists: false, authExists: false }))
      .toMatchObject({ installed: false, configured: false, binPath: "" });
  });

  it("validates save input", () => {
    expect(normalizeOpenCodeConfigInput({ providerId: " p ", modelId: "m" })).toEqual({
      providerId: "p",
      modelId: "m",
      apiKey: "",
      baseURL: "",
      setDefault: true,
    });
    expect(() => normalizeOpenCodeConfigInput({ providerId: "bad id", modelId: "m" })).toThrow(/Provider ID/);
    expect(() => normalizeOpenCodeConfigInput({ providerId: "p", modelId: "a\nb" })).toThrow(/Model ID/);
  });

  it("patches config without dropping existing settings", () => {
    const existing = { theme: "dark", provider: { p: { options: { apiKey: "k" }, models: { old: { name: "Old" } } } } };
    const next = applyOpenCodeConfigInput(existing, normalizeOpenCodeConfigInput({ providerId: "p", modelId: "new" }));
    expect(next).toEqual({
      $schema: "https://opencode.ai/config.json",
      theme: "dark",
      provider: { p: { options: { apiKey: "k" }, models: { old: { name: "Old" }, new: {} } } },
      model: "p/new",
    });
    expect(extractProviderConfig(next, "p")).toEqual({ apiKey: "k", baseURL: "" });
    expect(extractProviderConfig(next, "bad id")).toEqual({ apiKey: "", baseURL: "" });
  });

  it("parses providers from `opencode models`", () => {
    expect(parseOpenCodeModelProviders("openai/gpt\nanthropic/claude\nopenai/o3\nnoise\n/x")).toEqual(["anthropic", "openai"]);
  });
});
