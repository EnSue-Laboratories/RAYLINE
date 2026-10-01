import { describe, expect, it } from "vitest";
import { TerminalOutputBuffer } from "../outputBuffer";

function setup(mode: "live" | "buffering" | "holding" = "live", maxPending = 100) {
  const written: string[] = [];
  const buffer = new TerminalOutputBuffer((data) => written.push(data), mode, maxPending);
  return { buffer, written };
}

describe("TerminalOutputBuffer", () => {
  it("writes straight through while live", () => {
    const { buffer, written } = setup("live");
    buffer.write("a");
    buffer.write("b");
    expect(written).toEqual(["a", "b"]);
  });

  it("queues while buffering and flushes once as a single chunk when shown", () => {
    const { buffer, written } = setup("buffering");
    buffer.write("a");
    buffer.write("b");
    expect(written).toEqual([]);
    expect(buffer.pendingSize).toBe(2);
    buffer.setMode("live");
    expect(written).toEqual(["ab"]);
    expect(buffer.pendingSize).toBe(0);
  });

  it("flushes early when the buffering cap is reached", () => {
    const { buffer, written } = setup("buffering", 4);
    buffer.write("ab");
    buffer.write("cd");
    expect(written).toEqual(["abcd"]);
    buffer.write("e");
    expect(written).toEqual(["abcd"]);
  });

  it("does not cap while holding, and clear() drops queued output", () => {
    const { buffer, written } = setup("holding", 2);
    buffer.write("abcdef");
    expect(written).toEqual([]);
    buffer.clear();
    buffer.setMode("live");
    expect(written).toEqual([]);
  });

  it("ignores empty chunks", () => {
    const { buffer, written } = setup("buffering");
    buffer.write("");
    buffer.flush();
    expect(written).toEqual([]);
  });
});
