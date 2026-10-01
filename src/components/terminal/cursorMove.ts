/**
 * Arrow-key sequences that move a shell prompt's cursor to a clicked cell, and
 * the "replace the selected prompt text" edit. Ported from VS Code's
 * terminal `moveToCellSequence`. Pure: works on a structural view of xterm's
 * buffer so it can be unit-tested with fakes.
 */

const ESC = "\x1b";
const DELETE_SEQUENCE = `${ESC}[3~`;

const Direction = {
  UP: "A",
  DOWN: "B",
  RIGHT: "C",
  LEFT: "D",
} as const;
type Direction = (typeof Direction)[keyof typeof Direction];

export interface BufferLineLike {
  readonly isWrapped: boolean;
}

/** xterm's internal `_core._bufferService` (not public API). */
export interface BufferServiceLike {
  readonly cols: number;
  readonly buffer: {
    readonly lines: {
      readonly length: number;
      get(index: number): BufferLineLike | undefined;
    };
    translateBufferLineToString(row: number, trimRight: boolean, startCol?: number, endCol?: number): string;
  };
}

interface CellPosition {
  x: number;
  y: number;
}

/** The parts of an xterm `Terminal` the cursor logic reads. */
export interface CursorTerminal {
  readonly cols: number;
  readonly rows: number;
  readonly buffer: {
    readonly active: {
      readonly cursorX: number;
      readonly cursorY: number;
      readonly baseY: number;
      readonly viewportY: number;
      readonly type: "normal" | "alternate";
    };
  };
  readonly modes: {
    readonly applicationCursorKeysMode: boolean;
    readonly mouseTrackingMode: string;
  };
  getSelection(): string;
  getSelectionPosition(): { start: CellPosition; end: CellPosition } | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Reaches into xterm internals; returns null if the shape ever changes. */
export function getBufferService(term: unknown): BufferServiceLike | null {
  if (!isRecord(term) || !isRecord(term._core)) return null;
  const service = term._core._bufferService;
  if (!isRecord(service) || typeof service.cols !== "number" || !isRecord(service.buffer)) return null;
  // Private xterm API: only the fields checked above are verified at runtime.
  return service as unknown as BufferServiceLike;
}

export function repeatSequence(count: number, str: string): string {
  let result = "";
  for (let i = 0; i < Math.floor(count); i += 1) result += str;
  return result;
}

function directionSequence(direction: Direction, applicationCursor: boolean): string {
  return `${ESC}${applicationCursor ? "O" : "["}${direction}`;
}

function getWrappedRowsForAbsoluteRow(bufferService: BufferServiceLike, absoluteRow: number): number {
  let rowCount = 0;
  let currentRow = absoluteRow;
  let lineWraps = bufferService.buffer.lines.get(currentRow)?.isWrapped;

  while (lineWraps && currentRow >= 0) {
    rowCount += 1;
    currentRow -= 1;
    lineWraps = bufferService.buffer.lines.get(currentRow)?.isWrapped;
  }

  return rowCount;
}

function getWrappedRowsCount(startAbsoluteRow: number, targetAbsoluteRow: number, bufferService: BufferServiceLike): number {
  let wrappedRows = 0;
  const startRow = startAbsoluteRow - getWrappedRowsForAbsoluteRow(bufferService, startAbsoluteRow);
  const endRow = targetAbsoluteRow - getWrappedRowsForAbsoluteRow(bufferService, targetAbsoluteRow);
  const direction = startAbsoluteRow > targetAbsoluteRow ? -1 : 1;

  for (let i = 0; i < Math.abs(startRow - endRow); i += 1) {
    if (bufferService.buffer.lines.get(startRow + direction * i)?.isWrapped) wrappedRows += 1;
  }

  return wrappedRows;
}

export function bufferLineBetween(
  startCol: number,
  startAbsoluteRow: number,
  endCol: number,
  endAbsoluteRow: number,
  forward: boolean,
  bufferService: BufferServiceLike,
): string {
  const { buffer } = bufferService;
  let currentCol = startCol;
  let currentRow = startAbsoluteRow;
  let bufferStr = "";
  let localStartCol = startCol;

  while ((currentCol !== endCol || currentRow !== endAbsoluteRow)
    && currentRow >= 0
    && currentRow < buffer.lines.length) {
    currentCol += forward ? 1 : -1;

    if (forward && currentCol > bufferService.cols - 1) {
      bufferStr += buffer.translateBufferLineToString(currentRow, false, localStartCol, currentCol);
      currentCol = 0;
      localStartCol = 0;
      currentRow += 1;
    } else if (!forward && currentCol < 0) {
      bufferStr += buffer.translateBufferLineToString(currentRow, false, 0, localStartCol + 1);
      currentCol = bufferService.cols - 1;
      localStartCol = currentCol;
      currentRow -= 1;
    }
  }

  return bufferStr + buffer.translateBufferLineToString(currentRow, false, localStartCol, currentCol);
}

function moveToRequestedRow(
  startAbsoluteRow: number,
  targetAbsoluteRow: number,
  bufferService: BufferServiceLike,
  applicationCursor: boolean,
): string {
  const startRow = startAbsoluteRow - getWrappedRowsForAbsoluteRow(bufferService, startAbsoluteRow);
  const endRow = targetAbsoluteRow - getWrappedRowsForAbsoluteRow(bufferService, targetAbsoluteRow);
  const rowsToMove = Math.abs(startRow - endRow) - getWrappedRowsCount(startAbsoluteRow, targetAbsoluteRow, bufferService);
  const direction = startAbsoluteRow > targetAbsoluteRow ? Direction.UP : Direction.DOWN;
  return repeatSequence(rowsToMove, directionSequence(direction, applicationCursor));
}

function getHorizontalDirection(
  startX: number,
  startAbsoluteRow: number,
  targetX: number,
  targetAbsoluteRow: number,
  bufferService: BufferServiceLike,
  applicationCursor: boolean,
): Direction {
  const startRow = moveToRequestedRow(startAbsoluteRow, targetAbsoluteRow, bufferService, applicationCursor).length > 0
    ? targetAbsoluteRow - getWrappedRowsForAbsoluteRow(bufferService, targetAbsoluteRow)
    : startAbsoluteRow;

  if ((startX < targetX && startRow <= targetAbsoluteRow) || (startX >= targetX && startRow < targetAbsoluteRow)) {
    return Direction.RIGHT;
  }
  return Direction.LEFT;
}

function resetStartingRow(
  startX: number,
  startAbsoluteRow: number,
  targetAbsoluteRow: number,
  bufferService: BufferServiceLike,
  applicationCursor: boolean,
): string {
  if (moveToRequestedRow(startAbsoluteRow, targetAbsoluteRow, bufferService, applicationCursor).length === 0) {
    return "";
  }
  return repeatSequence(
    bufferLineBetween(
      startX,
      startAbsoluteRow,
      startX,
      startAbsoluteRow - getWrappedRowsForAbsoluteRow(bufferService, startAbsoluteRow),
      false,
      bufferService,
    ).length,
    directionSequence(Direction.LEFT, applicationCursor),
  );
}

function moveToRequestedCol(
  startX: number,
  startAbsoluteRow: number,
  targetX: number,
  targetAbsoluteRow: number,
  bufferService: BufferServiceLike,
  applicationCursor: boolean,
): string {
  const startRow = moveToRequestedRow(startAbsoluteRow, targetAbsoluteRow, bufferService, applicationCursor).length > 0
    ? targetAbsoluteRow - getWrappedRowsForAbsoluteRow(bufferService, targetAbsoluteRow)
    : startAbsoluteRow;
  const direction = getHorizontalDirection(startX, startAbsoluteRow, targetX, targetAbsoluteRow, bufferService, applicationCursor);

  return repeatSequence(
    bufferLineBetween(startX, startRow, targetX, targetAbsoluteRow, direction === Direction.RIGHT, bufferService).length,
    directionSequence(direction, applicationCursor),
  );
}

export function buildMoveToAbsoluteCellSequence(
  term: CursorTerminal,
  bufferService: BufferServiceLike,
  targetX: number,
  targetAbsoluteRow: number,
): string {
  const buffer = term.buffer.active;
  const startX = buffer.cursorX;
  const startAbsoluteRow = buffer.baseY + buffer.cursorY;
  const applicationCursor = Boolean(term.modes.applicationCursorKeysMode);

  if (buffer.type !== "alternate") {
    if (startAbsoluteRow === targetAbsoluteRow) {
      const direction = startX > targetX ? Direction.LEFT : Direction.RIGHT;
      return repeatSequence(Math.abs(startX - targetX), directionSequence(direction, applicationCursor));
    }

    const backwards = startAbsoluteRow > targetAbsoluteRow;
    const direction = backwards ? Direction.LEFT : Direction.RIGHT;
    const rowDifference = Math.abs(startAbsoluteRow - targetAbsoluteRow);
    const cellsToMove = (bufferService.cols - (backwards ? targetX : startX))
      + (rowDifference - 1) * bufferService.cols
      + 1
      + ((backwards ? startX : targetX) - 1);

    return repeatSequence(cellsToMove, directionSequence(direction, applicationCursor));
  }

  return resetStartingRow(startX, startAbsoluteRow, targetAbsoluteRow, bufferService, applicationCursor)
    + moveToRequestedRow(startAbsoluteRow, targetAbsoluteRow, bufferService, applicationCursor)
    + moveToRequestedCol(startX, startAbsoluteRow, targetX, targetAbsoluteRow, bufferService, applicationCursor);
}

/** Sequence moving the prompt cursor to viewport cell (x, y), 0-based. */
export function buildMoveToCellSequence(term: CursorTerminal, bufferService: BufferServiceLike, targetX: number, targetY: number): string {
  return buildMoveToAbsoluteCellSequence(term, bufferService, targetX, term.buffer.active.baseY + targetY);
}

export interface PromptSelectionEdit {
  startX: number;
  startAbsoluteRow: number;
  deleteCount: number;
  /** Moves the cursor to the selection start. */
  moveSequence: string;
  /** Deletes the selected characters (forward delete). */
  deleteSequence: string;
}

/**
 * When the selection lies entirely inside the current (possibly wrapped)
 * prompt line, returns the keystrokes that delete it so typing can replace
 * the selection like a text field. Null otherwise.
 */
export function getPromptSelectionEditContext(term: CursorTerminal, bufferService: BufferServiceLike): PromptSelectionEdit | null {
  const range = term.getSelectionPosition();
  const selectionText = term.getSelection();
  const buffer = term.buffer.active;

  if (!range || !selectionText) return null;
  if (term.modes.mouseTrackingMode !== "none") return null;
  if (buffer.type !== "normal") return null;
  if (buffer.baseY !== buffer.viewportY) return null;

  const currentAbsoluteRow = buffer.baseY + buffer.cursorY;
  const currentWrappedStart = currentAbsoluteRow - getWrappedRowsForAbsoluteRow(bufferService, currentAbsoluteRow);
  const { start, end } = range;

  if (start.y < currentWrappedStart || end.y > currentAbsoluteRow) return null;

  const deleteCount = bufferLineBetween(start.x, start.y, end.x, end.y, true, bufferService).length;
  if (!deleteCount) return null;

  return {
    startX: start.x,
    startAbsoluteRow: start.y,
    deleteCount,
    moveSequence: buildMoveToAbsoluteCellSequence(term, bufferService, start.x, start.y),
    deleteSequence: repeatSequence(deleteCount, DELETE_SEQUENCE),
  };
}

/** Client coordinates → 0-based viewport cell, or null before first render. */
export function getTerminalCellFromEvent(
  term: { readonly cols: number; readonly rows: number; readonly element: HTMLElement | undefined; readonly dimensions?: { css: { cell: { width: number; height: number } } } | undefined },
  event: { clientX: number; clientY: number },
): CellPosition | null {
  const element = term.element;
  const cellWidth = term.dimensions?.css.cell.width;
  const cellHeight = term.dimensions?.css.cell.height;
  if (!element || !cellWidth || !cellHeight) return null;

  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  const leftPadding = parseInt(style.getPropertyValue("padding-left"), 10) || 0;
  const topPadding = parseInt(style.getPropertyValue("padding-top"), 10) || 0;
  const relX = event.clientX - rect.left - leftPadding;
  const relY = event.clientY - rect.top - topPadding;

  const x = Math.min(Math.max(Math.ceil(relX / cellWidth), 1), term.cols);
  const y = Math.min(Math.max(Math.ceil(relY / cellHeight), 1), term.rows);
  return { x: x - 1, y: y - 1 };
}
