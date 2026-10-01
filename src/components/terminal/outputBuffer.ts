/**
 * Gates PTY output into an xterm instance so hidden sessions do no parse /
 * render work: chunks are queued while the session is hidden and written in
 * one batch when it becomes visible again.
 *
 * Modes:
 *  - `live`      — write straight through.
 *  - `buffering` — queue; flush early once `maxPending` chars accumulate so a
 *                  chatty background process can't grow memory unbounded.
 *  - `holding`   — queue without the cap (used while the initial scrollback
 *                  is being fetched, where ordering matters more than memory).
 */
export type OutputMode = "live" | "buffering" | "holding";

export const DEFAULT_MAX_PENDING_CHARS = 1_000_000;

export class TerminalOutputBuffer {
  private pending: string[] = [];
  private pendingChars = 0;
  private mode: OutputMode;
  private readonly sink: (data: string) => void;
  private readonly maxPending: number;

  constructor(sink: (data: string) => void, mode: OutputMode = "live", maxPending = DEFAULT_MAX_PENDING_CHARS) {
    this.sink = sink;
    this.mode = mode;
    this.maxPending = maxPending;
  }

  get currentMode(): OutputMode {
    return this.mode;
  }

  get pendingSize(): number {
    return this.pendingChars;
  }

  write(data: string): void {
    if (!data) return;
    if (this.mode === "live") {
      this.sink(data);
      return;
    }
    this.pending.push(data);
    this.pendingChars += data.length;
    if (this.mode === "buffering" && this.pendingChars >= this.maxPending) this.flush();
  }

  /** Switches mode; entering `live` flushes everything queued first. */
  setMode(mode: OutputMode): void {
    this.mode = mode;
    if (mode === "live") this.flush();
  }

  /** Writes everything queued as a single chunk. */
  flush(): void {
    if (this.pending.length === 0) return;
    const data = this.pending.length === 1 ? (this.pending[0] ?? "") : this.pending.join("");
    this.clear();
    this.sink(data);
  }

  /** Drops everything queued (e.g. it is already covered by a scrollback read). */
  clear(): void {
    this.pending = [];
    this.pendingChars = 0;
  }
}
