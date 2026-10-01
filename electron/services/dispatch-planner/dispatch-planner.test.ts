import { describe, expect, it } from "vitest";
import { findJsonValueEnd, normalizeDispatchPlanPayload, parseDispatchPlanJson } from "./parse";
import { buildDispatchPlannerPrompt, compactDispatchModel, stripPlannerReasoningBlocks } from "./prompt";
import { collectOpenCodePlannerText, createOpenCodeTextState, extractOpenCodePlannerError, openCodeTextResult } from "./opencode-text";

const row = { title: "Fix", prompt: "Fix the bug", branch: "fix-bug", model: "gpt-5.4" };

describe("parseDispatchPlanJson", () => {
  it("parses plain JSON", () => {
    expect(parseDispatchPlanJson(JSON.stringify({ rows: [row] }))).toEqual({ rows: [row] });
  });

  it("finds JSON inside fences, prose and reasoning blocks", () => {
    const text = `<think>{"rows":[]}</think>\nHere you go:\n\`\`\`json\n${JSON.stringify({ rows: [row] })}\n\`\`\`\nDone.`;
    expect(parseDispatchPlanJson(text).rows).toEqual([row]);
  });

  it("accepts a bare array and skips empty candidates", () => {
    expect(parseDispatchPlanJson(`noise {"rows": []} then ${JSON.stringify([row])}`).rows).toEqual([row]);
  });

  it("rejects output without rows", () => {
    expect(() => parseDispatchPlanJson("")).toThrow("Planner returned no output.");
    expect(() => parseDispatchPlanJson("no json here")).toThrow("did not contain the required JSON rows");
    expect(() => parseDispatchPlanJson('{"rows": []}')).toThrow("did not return any dispatch rows");
  });

  it("caps rows and trims fields", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ title: ` t${i} `, prompt: "p" }));
    const plan = normalizeDispatchPlanPayload({ rows });
    expect(plan?.rows).toHaveLength(8);
    expect(plan?.rows[0]).toEqual({ title: "t0", prompt: "p", branch: "", model: "" });
  });
});

describe("findJsonValueEnd", () => {
  it("handles nested values and braces in strings", () => {
    const text = 'x{"a":"}{","b":[1,{"c":2}]}y';
    expect(text.slice(1, findJsonValueEnd(text, 1))).toBe('{"a":"}{","b":[1,{"c":2}]}');
    expect(findJsonValueEnd('{"a":[}', 0)).toBe(-1);
  });
});

describe("planner prompt", () => {
  it("compacts models with provider guides", () => {
    expect(compactDispatchModel({ id: "gpt-5.4", name: "GPT", provider: "codex" })?.guide).toMatch(/bug checking/);
    expect(compactDispatchModel({ id: "x", label: "Label" })).toMatchObject({ name: "Label", provider: "claude" });
    expect(compactDispatchModel({ name: "no id" })).toBeNull();
  });

  it("includes cwd, default model and brief", () => {
    const prompt = buildDispatchPlannerPrompt({ instructions: "  do it  ", cwd: "/repo", targetModels: [], defaultTargetModel: "m" });
    expect(prompt).toContain("Working directory: /repo");
    expect(prompt).toContain("Default target model id: m");
    expect(prompt.endsWith("do it")).toBe(true);
  });

  it("strips reasoning blocks", () => {
    expect(stripPlannerReasoningBlocks("<thinking>hmm</thinking>{}")).toBe("{}");
  });
});

describe("OpenCode planner text", () => {
  it("assembles text parts and deltas, skipping reasoning", () => {
    const state = createOpenCodeTextState();
    collectOpenCodePlannerText({ type: "message.part.updated", properties: { part: { id: "r", type: "reasoning", text: "thinking" } } }, state);
    collectOpenCodePlannerText({ type: "message.part.updated", properties: { part: { id: "t", type: "text", text: "{\"rows\":" } } }, state);
    collectOpenCodePlannerText({ type: "message.part.delta", properties: { partID: "t", delta: "[]}" } }, state);
    collectOpenCodePlannerText({ type: "message.part.delta", properties: { partID: "r", delta: "more thinking" } }, state);
    expect(openCodeTextResult(state)).toBe('{"rows":[]}');
  });

  it("extracts errors", () => {
    expect(extractOpenCodePlannerError({ type: "error", error: { message: "boom" } })).toBe("boom");
    expect(extractOpenCodePlannerError({ type: "session.error", properties: { error: "bad" } })).toBe("bad");
    expect(extractOpenCodePlannerError({ type: "text" })).toBe("");
  });
});
