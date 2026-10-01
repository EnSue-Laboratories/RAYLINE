/**
 * Persistence of terminal session metadata across app restarts
 * (`userData/terminal-sessions.json`). Offered to electron-shell, which owns
 * the `before-quit` hook and the `terminal-saved-metadata` handler.
 */

import { writeFileSync } from "node:fs";
import { readFile, unlink } from "node:fs/promises";
import type { TerminalSessionMetadata } from "@shared/terminal/types";

export function isTerminalSessionMetadata(value: unknown): value is TerminalSessionMetadata {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.name === "string" && typeof v.cwd === "string" && typeof v.command === "string";
}

/** Synchronous on purpose: called from `before-quit`. No-op for an empty list. */
export function saveSessionMetadataSync(filePath: string, metadata: readonly TerminalSessionMetadata[]): void {
  if (metadata.length === 0) return;
  try {
    writeFileSync(filePath, JSON.stringify(metadata, null, 2));
  } catch {
    /* best effort */
  }
}

/** Read and delete the saved metadata (one-shot restore). [] when absent/invalid. */
export async function consumeSavedSessionMetadata(filePath: string): Promise<TerminalSessionMetadata[]> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    return [];
  }
  await unlink(filePath).catch(() => undefined);
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isTerminalSessionMetadata) : [];
  } catch {
    return [];
  }
}
