import { describe, expect, it } from "vitest";
import { buildAgentCliPrompt } from "../agent-prompt";
import { imageDataUrlOf, parseImageDataUrl } from "../images";
import { errorMessage, readNonEmptyString, safeJsonParse } from "../json";
import { LineSplitter } from "../line-splitter";
import { resolveCliModel, resolveRunEffort } from "../models";

describe("LineSplitter", () => {
  it("splits complete lines and buffers the tail", () => {
    const splitter = new LineSplitter();
    expect(splitter.push(Buffer.from('{"a":1}\n{"b"'))).toEqual(['{"a":1}']);
    expect(splitter.push(Buffer.from(':2}\n\n'))).toEqual(['{"b":2}', ""]);
    expect(splitter.flush()).toBe("");
  });

  it("decodes multi-byte characters split across chunks", () => {
    const bytes = Buffer.from('{"text":"👋 你好"}\n', "utf8");
    const splitter = new LineSplitter();
    const lines: string[] = [];
    for (let i = 0; i < bytes.length; i += 1) lines.push(...splitter.push(bytes.subarray(i, i + 1)));
    expect(lines).toEqual(['{"text":"👋 你好"}']);
  });

  it("reassembles a long line delivered in many chunks", () => {
    const payload = "x".repeat(200_000);
    const splitter = new LineSplitter();
    const lines: string[] = [];
    const text = `${payload}\nnext`;
    for (let i = 0; i < text.length; i += 4096) lines.push(...splitter.push(Buffer.from(text.slice(i, i + 4096))));
    expect(lines).toEqual([payload]);
    expect(splitter.flush()).toBe("next");
  });
});

describe("json helpers", () => {
  it("parses without throwing", () => {
    expect(safeJsonParse("{")).toBeUndefined();
    expect(safeJsonParse('{"a":1}')).toEqual({ a: 1 });
  });

  it("reads trimmed strings and error messages", () => {
    expect(readNonEmptyString({ m: "  x " }, "m")).toBe("x");
    expect(readNonEmptyString({ m: "  " }, "m")).toBeUndefined();
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage({ message: "obj" })).toBe("obj");
  });
});

describe("images", () => {
  it("parses base64 image data URLs and maps jpeg to jpg", () => {
    expect(parseImageDataUrl("data:image/jpeg;base64,AAAA")).toEqual({ ext: "jpg", base64: "AAAA" });
    expect(parseImageDataUrl("data:text/plain;base64,AAAA")).toBeNull();
    expect(imageDataUrlOf({ dataUrl: "data:image/png;base64,QQ==" })).toBe("data:image/png;base64,QQ==");
  });
});

describe("agent CLI prompt", () => {
  it("prefixes attached files and appends project context before the user prompt", () => {
    const prompt = buildAgentCliPrompt("do it", [{ type: "file", path: "/a.txt" }, { type: "file" }], "  use pnpm ");
    expect(prompt).toContain("Project context configured in RayLine for this workspace:\nuse pnpm");
    expect(prompt.endsWith("--- USER PROMPT ---\n[Attached files:\n/a.txt]\n\ndo it")).toBe(true);
  });
});

describe("registry model resolution", () => {
  it("passes current CLI flags through and normalizes legacy ids", () => {
    expect(resolveCliModel("claude", "opus[1m]")).toMatchObject({ cliFlag: "opus[1m]", legacyEffort: null });
    expect(resolveCliModel("claude", "claude-opus")).toMatchObject({ cliFlag: "opus" });
    expect(resolveCliModel("codex", "gpt55-high")).toMatchObject({ cliFlag: "gpt-5.5", legacyEffort: "high" });
    expect(resolveCliModel("codex", "gpt-5.4").cliFlag).toBe("gpt-6-astra");
    expect(resolveCliModel("codex", "my-proxy-model")).toEqual({ cliFlag: "my-proxy-model", definition: null, legacyEffort: null });
    expect(resolveCliModel("codex", "")).toEqual({ cliFlag: null, definition: null, legacyEffort: null });
  });

  it("only sends an effort the user chose and the model accepts", () => {
    const astra = resolveCliModel("codex", "gpt-6-astra").definition;
    const gpt55 = resolveCliModel("codex", "gpt-5.5").definition;
    expect(resolveRunEffort({ definition: astra, requested: undefined })).toBeNull();
    expect(resolveRunEffort({ definition: astra, requested: "ultra" })).toBe("ultra");
    expect(resolveRunEffort({ definition: gpt55, requested: "max" })).toBe("xhigh");
    expect(resolveRunEffort({ definition: astra, requested: "high", upstreamActive: true })).toBeNull();
    expect(resolveRunEffort({ definition: null, requested: "high" })).toBeNull();
    expect(resolveRunEffort({ definition: null, requested: "high", unknownModel: "passthrough" })).toBe("high");
    expect(resolveRunEffort({ definition: gpt55, requested: null, legacyEffort: "medium" })).toBe("medium");
  });
});
