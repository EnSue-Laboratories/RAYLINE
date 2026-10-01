/** Orphaned message-image sweep for the state store. */

import fs from "node:fs";
import path from "node:path";
import { mapLimit } from "./concurrency";
import { collectImageRefsFromText, collectImageRefsFromValue, sweepOrphanedImages } from "./message-images";
import { readTextFile } from "./state-disk";

export type SweepSource =
  | { indexFile: string; conversationsDir: string }
  | { state: unknown };

async function collectRefs(source: SweepSource): Promise<Set<string> | null> {
  const referenced = new Set<string>();
  if ("state" in source) {
    collectImageRefsFromValue(source.state, referenced);
    return referenced;
  }
  // v2: scan the raw JSON text (no parse) of the index and every transcript.
  const indexText = await readTextFile(source.indexFile);
  if (indexText === null) return null;
  collectImageRefsFromText(indexText, referenced);
  const names = await fs.promises.readdir(source.conversationsDir).catch((): string[] => []);
  await mapLimit(names, 8, async (name) => {
    const text = await readTextFile(path.join(source.conversationsDir, name));
    if (text) collectImageRefsFromText(text, referenced);
  });
  return referenced;
}

/** Deletes images no persisted state references; files touched at/after `notBefore` are kept. */
export async function sweepUnreferencedImages(imagesDir: string, notBefore: number, source: SweepSource): Promise<number> {
  try {
    const referenced = await collectRefs(source);
    if (!referenced) return 0;
    const removed = await sweepOrphanedImages(imagesDir, referenced, notBefore);
    if (removed > 0) console.log(`[state] swept ${removed} orphaned message image(s)`);
    return removed;
  } catch (error) {
    console.warn("Failed to sweep orphaned message images:", error);
    return 0;
  }
}
