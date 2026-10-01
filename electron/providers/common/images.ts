/**
 * Image attachment helpers shared by the Claude / Codex / OpenCode runners.
 * `parseImageDataUrl` and `imageDataUrlOf` are pure; `writeImagesToTemp`
 * does async I/O (the old code used `writeFileSync` on the main thread).
 */

import { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ImagePayload } from "@shared/chat/types";

export type ImageInput = string | ImagePayload;

/** `string` entries are data URLs; payload objects carry `dataUrl`. */
export function imageDataUrlOf(image: ImageInput | null | undefined): string | null {
  if (typeof image === "string") return image;
  if (image && typeof image.dataUrl === "string") return image.dataUrl;
  return null;
}

export interface ParsedImageDataUrl {
  /** File extension without dot (`jpeg` → `jpg`). */
  ext: string;
  base64: string;
}

const IMAGE_DATA_URL = /^data:image\/([\w+.-]+);base64,(.+)$/;

export function parseImageDataUrl(dataUrl: string): ParsedImageDataUrl | null {
  const match = IMAGE_DATA_URL.exec(dataUrl);
  if (!match?.[1] || !match[2]) return null;
  return { ext: match[1] === "jpeg" ? "jpg" : match[1], base64: match[2] };
}

/**
 * Decodes every base64 image data URL to `<tmpdir>/<prefix>-<ts>-<i>.<ext>`
 * and returns the written paths (non-image / non-data entries are skipped).
 */
export async function writeImagesToTemp(
  images: readonly ImageInput[] | null | undefined,
  prefix: string,
): Promise<string[]> {
  if (!images || images.length === 0) return [];
  const stamp = Date.now();
  const writes: Promise<string>[] = [];
  images.forEach((image, index) => {
    const dataUrl = imageDataUrlOf(image);
    const parsed = dataUrl ? parseImageDataUrl(dataUrl) : null;
    if (!parsed) return;
    const tmpPath = path.join(os.tmpdir(), `${prefix}-${stamp}-${index}.${parsed.ext}`);
    writes.push(fsp.writeFile(tmpPath, Buffer.from(parsed.base64, "base64")).then(() => tmpPath));
  });
  return Promise.all(writes);
}
