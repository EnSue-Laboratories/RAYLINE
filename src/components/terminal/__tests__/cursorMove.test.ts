import { describe, expect, it } from "vitest";
import {
  bufferLineBetween,
  buildMoveToCellSequence,
  getBufferService,
  getPromptSelectionEditContext,
  repeatSequence,
  type BufferServiceLike,
  type CursorTerminal,
} from "../cursorMove";

const LEFT = "\x1b[D";
const RIGHT = "\x1b[C";
const DELETE = "\x1b[3~";

/** Fake buffer: `rows` are full text rows of width `cols`; `wrapped` marks continuation rows. */
function fakeBufferService(rows: string[], cols: number, wrapped: number[] = []): BufferServiceLike {
  return {
    cols,
    buffer: {
      lines: {
        length: rows.length,
        get: (index) => (index >= 0 && index < rows.length ? { isWrapped: wrapped.includes(index) } : undefined),
      },
      translateBufferLineToString: (row, _trim, start = 0, end = cols) => (rows[row] ?? "").slice(start, end),
    },
  };
}

function fakeTerminal(overrides: Partial<{
  cursorX: number;
  cursorY: number;
  type: "normal" | "alternate";
  selection: string;
  range: { start: { x: number; y: number }; end: { x: number; y: number } } | undefined;
  applicationCursor: boolean;
}> = {}): CursorTerminal {
  return {
    cols: 10,
    rows: 5,
    buffer: {
      active: {
        cursorX: overrides.cursorX ?? 0,
        cursorY: overrides.cursorY ?? 0,
        baseY: 0,
        viewportY: 0,
        type: overrides.type ?? "normal",
      },
    },
    modes: { applicationCursorKeysMode: overrides.applicationCursor ?? false, mouseTrackingMode: "none" },
    getSelection: () => overrides.selection ?? "",
    getSelectionPosition: () => overrides.range,
  };
}

describe("repeatSequence", () => {
  it("repeats floor(count) times", () => {
    expect(repeatSequence(2.7, "x")).toBe("xx");
    expect(repeatSequence(0, "x")).toBe("");
  });
});

describe("bufferLineBetween", () => {
  it("reads forward across a wrapped row boundary", () => {
    const service = fakeBufferService(["0123456789", "abcdefghij"], 10, [1]);
    expect(bufferLineBetween(8, 0, 2, 1, true, service)).toBe("89ab");
  });
});

describe("buildMoveToCellSequence", () => {
  const service = fakeBufferService(["$ echo hi ", "          "], 10);

  it("moves right on the same row", () => {
    const term = fakeTerminal({ cursorX: 2 });
    expect(buildMoveToCellSequence(term, service, 5, 0)).toBe(RIGHT.repeat(3));
  });

  it("moves left on the same row", () => {
    const term = fakeTerminal({ cursorX: 7 });
    expect(buildMoveToCellSequence(term, service, 4, 0)).toBe(LEFT.repeat(3));
  });

  it("uses application cursor sequences when that mode is on", () => {
    const term = fakeTerminal({ cursorX: 0, applicationCursor: true });
    expect(buildMoveToCellSequence(term, service, 1, 0)).toBe("\x1bOC");
  });

  it("walks across rows in the normal buffer", () => {
    const term = fakeTerminal({ cursorX: 8, cursorY: 0 });
    // (10 - 8) to the row end + 0 full rows + 1 + (3 - 1) into the target row
    expect(buildMoveToCellSequence(term, service, 3, 1)).toBe(RIGHT.repeat(5));
  });
});

describe("getPromptSelectionEditContext", () => {
  it("builds move + delete sequences for a selection on the prompt row", () => {
    const service = fakeBufferService(["$ echo hi ", "          "], 10);
    const term = fakeTerminal({
      cursorX: 9,
      selection: "echo",
      range: { start: { x: 2, y: 0 }, end: { x: 6, y: 0 } },
    });
    const edit = getPromptSelectionEditContext(term, service);
    expect(edit).not.toBeNull();
    expect(edit?.deleteCount).toBe(4);
    expect(edit?.deleteSequence).toBe(DELETE.repeat(4));
    expect(edit?.moveSequence).toBe(LEFT.repeat(7));
  });

  it("returns null without a selection or outside the prompt row", () => {
    const service = fakeBufferService(["old output", "$ prompt  "], 10);
    expect(getPromptSelectionEditContext(fakeTerminal({ cursorY: 1 }), service)).toBeNull();
    const term = fakeTerminal({
      cursorY: 1,
      selection: "old",
      range: { start: { x: 0, y: 0 }, end: { x: 3, y: 0 } },
    });
    expect(getPromptSelectionEditContext(term, service)).toBeNull();
  });
});

describe("getBufferService", () => {
  it("returns null for anything that doesn't look like xterm internals", () => {
    expect(getBufferService(null)).toBeNull();
    expect(getBufferService({ _core: {} })).toBeNull();
    expect(getBufferService({ _core: { _bufferService: { cols: "x", buffer: {} } } })).toBeNull();
  });

  it("returns the internal buffer service when present", () => {
    const service = fakeBufferService(["x"], 10);
    expect(getBufferService({ _core: { _bufferService: service } })).toBe(service);
  });
});
