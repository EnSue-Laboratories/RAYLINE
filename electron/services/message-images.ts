/**
 * Message images are stored content-addressed under userData/message-images
 * (`<sha256>.<ext>`) so persisted state only carries a `rayline-stored-image`
 * reference instead of base64 data URLs.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  STORED_MESSAGE_IMAGE_TYPE,
  type ChatMessage,
  type MessageImage,
  type StoredMessageImage,
} from "@shared/chat/types";
import { errorCode } from "./errors";
import { IMAGE_MIME_TYPES } from "./wallpaper";

export const MESSAGE_IMAGE_FILENAME_RE = /^[0-9a-f]{64}\.[a-z0-9]+$/;
const MESSAGE_IMAGE_REF_RE = /[0-9a-f]{64}\.[a-z0-9]+/g;
const DATA_URL_RE = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/;

const MIME_IMAGE_EXTENSIONS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(IMAGE_MIME_TYPES).map(([ext, mime]) => [mime, ext]),
);

export interface StoredImageFile {
  storagePath: string;
  mime: string;
}

export interface ImageMeta {
  name?: unknown;
  path?: unknown;
}

/** Resolves a data URL to its stored file (null = could not store / not a data URL). */
export type DataUrlResolver = (dataUrl: string) => StoredImageFile | null;

interface ParsedDataUrl {
  mime: string;
  base64: string;
  hash: string;
  ext: string;
}

export function getImageExtFromMime(mime: string): string {
  return MIME_IMAGE_EXTENSIONS[mime.toLowerCase()] ?? "png";
}

function parseImageDataUrl(dataUrl: string): ParsedDataUrl | null {
  const match = DATA_URL_RE.exec(dataUrl);
  if (!match?.[1] || match[2] === undefined) return null;
  const mime = match[1].toLowerCase();
  const base64 = match[2].replace(/\s+/g, "");
  const hash = crypto.createHash("sha256").update(base64).digest("hex");
  return { mime, base64, hash, ext: getImageExtFromMime(mime) };
}


export function toStoredImage(file: StoredImageFile, meta: ImageMeta = {}): StoredMessageImage {
  return {
    type: STORED_MESSAGE_IMAGE_TYPE,
    storagePath: file.storagePath,
    mime: file.mime,
    ...(typeof meta.name === "string" && meta.name ? { name: meta.name } : {}),
    ...(typeof meta.path === "string" && meta.path ? { originalPath: meta.path } : {}),
  };
}

/** Writes the image unless an identical one is already stored (then refreshes its mtime). */
export async function storeImageDataUrl(dir: string, dataUrl: unknown): Promise<StoredImageFile | null> {
  if (typeof dataUrl !== "string") return null;
  const parsed = parseImageDataUrl(dataUrl);
  if (!parsed) return null;
  const storagePath = path.join(dir, `${parsed.hash}.${parsed.ext}`);
  await fs.promises.mkdir(dir, { recursive: true });
  try {
    await fs.promises.writeFile(storagePath, Buffer.from(parsed.base64, "base64"), { flag: "wx" });
  } catch (error) {
    if (errorCode(error) !== "EEXIST") throw error;
    const now = new Date();
    await fs.promises.utimes(storagePath, now, now).catch(() => undefined);
  }
  return { storagePath, mime: parsed.mime };
}

export function storeImageDataUrlSync(dir: string, dataUrl: unknown): StoredImageFile | null {
  if (typeof dataUrl !== "string") return null;
  const parsed = parseImageDataUrl(dataUrl);
  if (!parsed) return null;
  const storagePath = path.join(dir, `${parsed.hash}.${parsed.ext}`);
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(storagePath)) fs.writeFileSync(storagePath, Buffer.from(parsed.base64, "base64"));
  return { storagePath, mime: parsed.mime };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const STORED_IMAGE_KEYS = new Set(["type", "storagePath", "mime", "name", "originalPath"]);

/** Already a canonical stored reference (nothing to rewrite). */
function isCanonicalStoredImage(image: Record<string, unknown>): boolean {
  return (
    image.type === STORED_MESSAGE_IMAGE_TYPE &&
    typeof image.storagePath === "string" &&
    Object.keys(image).every((key) => STORED_IMAGE_KEYS.has(key))
  );
}

function normalizeImage(image: unknown, resolve: DataUrlResolver): MessageImage | null {
  if (typeof image === "string") {
    const stored = resolve(image);
    return stored ? toStoredImage(stored) : image;
  }
  if (!isRecord(image)) return null;
  if (isCanonicalStoredImage(image)) return image as unknown as StoredMessageImage;

  const storagePath =
    typeof image.storagePath === "string" ? image.storagePath :
    typeof image.path === "string" && image.type === STORED_MESSAGE_IMAGE_TYPE ? image.path :
    "";
  if (storagePath) {
    return {
      type: STORED_MESSAGE_IMAGE_TYPE,
      storagePath,
      ...(typeof image.mime === "string" ? { mime: image.mime } : {}),
      ...(typeof image.name === "string" ? { name: image.name } : {}),
      ...(typeof image.originalPath === "string" ? { originalPath: image.originalPath } : {}),
    };
  }

  if (typeof image.dataUrl === "string") {
    const stored = resolve(image.dataUrl);
    if (stored) return toStoredImage(stored, image);
  }
  // Unknown shape: keep as-is (it came from the renderer's own state).
  return image as unknown as MessageImage;
}

/** Collects data URLs in user-message images that still need to be stored. */
export function collectInlineImageDataUrls(messages: readonly ChatMessage[]): string[] {
  const urls = new Set<string>();
  for (const message of messages) {
    if (!isRecord(message) || message.role !== "user" || !Array.isArray(message.images)) continue;
    for (const image of message.images as unknown[]) {
      if (typeof image === "string") urls.add(image);
      else if (isRecord(image) && typeof image.storagePath !== "string" && typeof image.dataUrl === "string") {
        urls.add(image.dataUrl);
      }
    }
  }
  return [...urls];
}

/**
 * Replaces inline image data with stored references (same rules as the
 * pre-v2 `normalizeStateImagesForPersist`). Messages whose images are
 * already canonical stored references keep their identity; returns the
 * input array when nothing changed.
 */
export function normalizeTranscriptImages(messages: readonly ChatMessage[], resolve: DataUrlResolver): ChatMessage[] {
  let next: ChatMessage[] | null = null;
  messages.forEach((message, i) => {
    if (!isRecord(message) || message.role !== "user" || !Array.isArray(message.images)) return;
    const original = message.images as unknown[];
    if (original.length === 0) return;
    const images = original
      .map((image) => normalizeImage(image, resolve))
      .filter((image): image is MessageImage => Boolean(image));
    const unchanged = images.length === original.length && images.every((image, j) => image === original[j]);
    if (unchanged) return;
    next ??= messages.slice();
    next[i] = { ...message, images: images.length > 0 ? images : undefined };
  });
  return next ?? (messages as ChatMessage[]);
}

/** Stores every inline image of `messages` (async) and returns the normalized transcript. */
export async function normalizeTranscriptImagesAsync(dir: string, messages: readonly ChatMessage[]): Promise<ChatMessage[]> {
  const urls = collectInlineImageDataUrls(messages);
  const stored = new Map<string, StoredImageFile>();
  for (const url of urls) {
    try {
      const file = await storeImageDataUrl(dir, url);
      if (file) stored.set(url, file);
    } catch (error) {
      console.warn("[message-images] failed to store image:", error);
    }
  }
  return normalizeTranscriptImages(messages, (url) => stored.get(url) ?? null);
}

export function normalizeTranscriptImagesSync(dir: string, messages: readonly ChatMessage[]): ChatMessage[] {
  return normalizeTranscriptImages(messages, (url) => {
    try {
      return storeImageDataUrlSync(dir, url);
    } catch (error) {
      console.warn("[message-images] failed to store image:", error);
      return null;
    }
  });
}

/** Adds every stored-image file name mentioned in `text` (raw JSON) to `into`. */
export function collectImageRefsFromText(text: string, into: Set<string>): void {
  for (const match of text.matchAll(MESSAGE_IMAGE_REF_RE)) into.add(match[0]);
}

/**
 * Deletes stored images that no persisted state references. Files touched
 * at or after `notBefore` (e.g. stored this session but not yet saved) are kept.
 */
export async function sweepOrphanedImages(dir: string, referenced: ReadonlySet<string>, notBefore: number): Promise<number> {
  let entries: string[];
  try {
    entries = await fs.promises.readdir(dir);
  } catch {
    return 0;
  }
  let removed = 0;
  for (const name of entries) {
    if (!MESSAGE_IMAGE_FILENAME_RE.test(name) || referenced.has(name)) continue;
    const filePath = path.join(dir, name);
    try {
      const stat = await fs.promises.stat(filePath);
      if (stat.mtimeMs >= notBefore) continue;
      await fs.promises.unlink(filePath);
      removed += 1;
    } catch (error) {
      console.warn(`Failed to unlink orphaned message image ${name}:`, error);
    }
  }
  return removed;
}

/** Adds the file names of every `storagePath` found anywhere inside `value`. */
export function collectImageRefsFromValue(value: unknown, into: Set<string>): void {
  const seen = new WeakSet<object>();
  const visit = (node: unknown): void => {
    if (!isRecord(node) || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node as unknown[]) visit(item);
      return;
    }
    if (typeof node.storagePath === "string" && node.storagePath) into.add(path.basename(node.storagePath));
    for (const child of Object.values(node)) visit(child);
  };
  visit(value);
}
