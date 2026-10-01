import { StringDecoder } from "node:string_decoder";

/**
 * Incremental newline splitter for CLI stdout.
 *
 * Two fixes over the previous `buffer += chunk.toString(); buffer.split("\n")`:
 *  - Multi-byte UTF-8 characters split across chunk boundaries are decoded
 *    correctly (StringDecoder) instead of turning into U+FFFD.
 *  - Only the newly arrived text is scanned for newlines, so a single
 *    multi-megabyte line (e.g. a large tool result) arriving in many 64 KB
 *    chunks costs O(n) instead of O(n²).
 */
export class LineSplitter {
  private readonly decoder = new StringDecoder("utf8");
  private pending: string[] = [];

  /** Feeds a chunk; returns every complete line (without the trailing "\n"). */
  push(chunk: Buffer | string): string[] {
    const text = typeof chunk === "string" ? chunk : this.decoder.write(chunk);
    if (!text) return [];
    const lines: string[] = [];
    let start = 0;
    let newline = text.indexOf("\n", start);
    while (newline !== -1) {
      const piece = text.slice(start, newline);
      if (this.pending.length > 0) {
        this.pending.push(piece);
        lines.push(this.pending.join(""));
        this.pending = [];
      } else {
        lines.push(piece);
      }
      start = newline + 1;
      newline = text.indexOf("\n", start);
    }
    if (start < text.length) this.pending.push(text.slice(start));
    return lines;
  }

  /** Returns (and clears) whatever is buffered after the last newline. */
  flush(): string {
    const tail = this.decoder.end();
    if (tail) this.pending.push(tail);
    const rest = this.pending.join("");
    this.pending = [];
    return rest;
  }
}
