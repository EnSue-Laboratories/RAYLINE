/** Pure naming / quoting helpers for remote attachment staging. */

import path from "node:path";
import { imageDataUrlOf, type ImageInput } from "../common/images";

export const REMOTE_ATTACHMENT_DIR_PREFIX = "/tmp/rayline-attachments-";

export function quotePosix(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Basename reduced to `[\w.+-]`, ≤ 120 chars; `fallback` when nothing is left. */
export function safeRemoteFilename(value: string | null | undefined, fallback: string): string {
  const raw = path.basename(typeof value === "string" && value.trim() ? value.trim() : fallback);
  const cleaned = raw
    .replace(/[^\w.+-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
  if (!cleaned || cleaned === "." || cleaned === "..") return fallback;
  return cleaned;
}

export function extensionForMime(mime: string | null | undefined): string {
  const normalized = String(mime || "").toLowerCase();
  if (normalized === "image/jpeg") return "jpg";
  if (normalized === "image/png") return "png";
  if (normalized === "image/gif") return "gif";
  if (normalized === "image/webp") return "webp";
  if (normalized === "image/svg+xml") return "svg";
  const match = /^image\/([a-z0-9.+-]+)$/.exec(normalized);
  return match?.[1] ? match[1].replace(/[^a-z0-9.+-]/g, "") || "png" : "png";
}

export interface ParsedBase64DataUrl {
  mime: string;
  buffer: Buffer;
}

export function parseBase64DataUrl(image: ImageInput | null | undefined): ParsedBase64DataUrl | null {
  const dataUrl = imageDataUrlOf(image);
  if (!dataUrl) return null;
  const match = /^data:([^;,]+);base64,([\s\S]+)$/i.exec(dataUrl);
  if (!match?.[1] || !match[2]) return null;
  return { mime: match[1], buffer: Buffer.from(match[2].replace(/\s+/g, ""), "base64") };
}

/** `<dir>/<NN>-<filename>` with a 1-based, zero-padded index. */
export function remotePathInDir(remoteDir: string, index: number, filename: string): string {
  const prefix = String(index + 1).padStart(2, "0");
  return `${remoteDir}/${prefix}-${filename}`;
}
