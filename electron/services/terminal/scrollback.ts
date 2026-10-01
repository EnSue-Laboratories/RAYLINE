/** Per-session scrollback buffer and input escape decoding (pure). */

export const SCROLLBACK_LIMIT = 5000;
/** Trim in batches so a busy PTY doesn't pay an O(n) shift per line. */
const TRIM_SLACK = 512;

/**
 * Line-oriented scrollback that keeps raw chunks (ANSI included) so xterm.js
 * can re-render them. The last entry is the current partial line.
 */
export class Scrollback {
  private lines: string[] = [];

  constructor(private readonly limit = SCROLLBACK_LIMIT) {}

  append(data: string): void {
    const incoming = data.split("\n");
    const [first = "", ...rest] = incoming;
    if (this.lines.length === 0) this.lines.push(first);
    else this.lines[this.lines.length - 1] += first;
    for (const line of rest) this.lines.push(line);
    if (this.lines.length > this.limit + TRIM_SLACK) {
      this.lines.splice(0, this.lines.length - this.limit);
    }
  }

  /** Last `count` lines, clamped to 1…limit. */
  tail(count: number): string[] {
    const n = Math.min(Math.max(1, count), this.limit);
    return this.lines.slice(-n);
  }

  get length(): number {
    return Math.min(this.lines.length, this.limit);
  }
}

/**
 * MCP / CLI clients send control characters as literal escapes
 * (`\\n`, `\\x03`, `\\u001b`); turn them into the real characters.
 */
export function decodeInputEscapes(text: string): string {
  return text
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\\/g, "\\");
}
