import { describe, expect, it } from "vitest";
import { createStreamBuffer, type FrameScheduler } from "../streamBuffer";

function fakeScheduler(): FrameScheduler & { time: number; frames: Map<number, () => void>; runFrame(): void } {
  let nextHandle = 1;
  const frames = new Map<number, () => void>();
  return {
    time: 0,
    frames,
    now() {
      return this.time;
    },
    requestFrame(callback) {
      const handle = nextHandle++;
      frames.set(handle, callback);
      return handle;
    },
    cancelFrame(handle) {
      frames.delete(handle);
    },
    runFrame() {
      const pending = [...frames.entries()];
      frames.clear();
      for (const [, callback] of pending) callback();
    },
  };
}

describe("createStreamBuffer", () => {
  it("coalesces items into one apply per frame, in order, as a transition", () => {
    const scheduler = fakeScheduler();
    const applied: [number[], boolean][] = [];
    const buffer = createStreamBuffer<number>((items, urgent) => applied.push([items, urgent]), scheduler);
    buffer.push(1, false);
    buffer.push(2, false);
    buffer.push(3, false);
    expect(scheduler.frames.size).toBe(1);
    scheduler.time = 100;
    scheduler.runFrame();
    expect(applied).toEqual([[[1, 2, 3], false]]);
  });

  it("waits until 32 ms passed since the last flush", () => {
    const scheduler = fakeScheduler();
    const applied: number[][] = [];
    const buffer = createStreamBuffer<number>((items) => applied.push(items), scheduler);
    buffer.push(1, false);
    scheduler.time = 100;
    scheduler.runFrame();
    buffer.push(2, false);
    scheduler.time = 116;
    scheduler.runFrame();
    expect(applied).toEqual([[1]]);
    expect(scheduler.frames.size).toBe(1);
    scheduler.time = 132;
    scheduler.runFrame();
    expect(applied).toEqual([[1], [2]]);
  });

  it("immediate items flush synchronously with everything queued before them", () => {
    const scheduler = fakeScheduler();
    const applied: [number[], boolean][] = [];
    const buffer = createStreamBuffer<number>((items, urgent) => applied.push([items, urgent]), scheduler);
    buffer.push(1, false);
    buffer.push(2, true);
    expect(applied).toEqual([[[1, 2], true]]);
    expect(scheduler.frames.size).toBe(0);
  });

  it("flush applies urgently; dispose drops without applying", () => {
    const scheduler = fakeScheduler();
    const applied: [number[], boolean][] = [];
    const buffer = createStreamBuffer<number>((items, urgent) => applied.push([items, urgent]), scheduler);
    buffer.push(1, false);
    buffer.flush();
    buffer.flush();
    expect(applied).toEqual([[[1], true]]);
    buffer.push(2, false);
    buffer.dispose();
    expect(buffer.size).toBe(0);
    expect(scheduler.frames.size).toBe(0);
    expect(applied).toHaveLength(1);
  });
});
