/**
 * Streaming line readers for JSONL session files. Session files can be tens
 * of MB, so nothing here reads a whole file into memory just to look at its
 * first lines, and every reader stops as soon as the caller has what it needs.
 */

import { closeSync, openSync, readSync } from "node:fs";
import { open } from "node:fs/promises";
import { createInterface } from "node:readline";
import { StringDecoder } from "node:string_decoder";

/** Return `false` from the visitor to stop reading. */
export type LineVisitor = (line: string, index: number) => boolean | void;

const STREAM_CHUNK_BYTES = 256 * 1024;
const SYNC_CHUNK_BYTES = 64 * 1024;

/**
 * Visit lines of a file in order. Rejects if the file can't be opened (so
 * ENOENT surfaces to the caller instead of being swallowed by readline).
 */
export async function forEachLine(filePath: string, visit: LineVisitor): Promise<void> {
  const handle = await open(filePath, "r");
  const stream = handle.createReadStream({ encoding: "utf8", highWaterMark: STREAM_CHUNK_BYTES });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  let index = 0;
  try {
    for await (const line of rl) {
      if (visit(line, index++) === false) break;
    }
  } finally {
    rl.close();
    stream.destroy();
  }
}

/** First `maxLines` lines of a file (fewer if the file is shorter). */
export async function readHeadLines(filePath: string, maxLines: number): Promise<string[]> {
  const lines: string[] = [];
  if (maxLines <= 0) return lines;
  await forEachLine(filePath, (line) => {
    lines.push(line);
    return lines.length < maxLines;
  });
  return lines;
}

/**
 * Synchronous variant for the few legacy call sites that must stay sync
 * (agent launch). Reads in 64 KB chunks and stops once the visitor is done.
 */
export function forEachHeadLineSync(filePath: string, maxLines: number, visit: LineVisitor): void {
  const fd = openSync(filePath, "r");
  try {
    const decoder = new StringDecoder("utf8");
    const chunk = Buffer.allocUnsafe(SYNC_CHUNK_BYTES);
    let pending = "";
    let index = 0;
    for (;;) {
      const bytesRead = readSync(fd, chunk, 0, SYNC_CHUNK_BYTES, null);
      const eof = bytesRead === 0;
      pending += eof ? decoder.end() : decoder.write(chunk.subarray(0, bytesRead));
      const parts = pending.split("\n");
      pending = eof ? "" : (parts.pop() ?? "");
      for (const part of parts) {
        if (index >= maxLines) return;
        if (visit(part, index++) === false) return;
      }
      if (eof || index >= maxLines) return;
    }
  } finally {
    closeSync(fd);
  }
}
