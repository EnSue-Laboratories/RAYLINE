/** HTTP plumbing for the RayLine SSH channel (electron/remote-channel). */

import fs from "node:fs";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import path from "node:path";
import { Transform, type TransformCallback } from "node:stream";
import { pipeline } from "node:stream/promises";

/** Error carrying the HTTP status the channel should answer with. */
export class ChannelHttpError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "ChannelHttpError";
  }
}

export function safeChannelFilename(value: string | null | undefined, fallback = "rayline-file"): string {
  const raw = path.basename(typeof value === "string" && value.trim() ? value.trim() : fallback);
  const cleaned = raw
    .replace(/[^\w.+ -]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  if (!cleaned || cleaned === "." || cleaned === "..") return fallback;
  return cleaned;
}

export function safePathSegment(value: string, fallback: string): string {
  return safeChannelFilename(value, fallback).replace(/\s+/g, "-").replace(/[^A-Za-z0-9_.+-]/g, "_");
}

export function getHeader(req: IncomingMessage, name: string): string {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] || "";
  return typeof value === "string" ? value : "";
}

export function isAuthorized(req: IncomingMessage, url: URL, token: string): boolean {
  const headerToken = getHeader(req, "x-rayline-token");
  if (headerToken && headerToken === token) return true;
  const auth = getHeader(req, "authorization");
  if (auth.toLowerCase().startsWith("bearer ") && auth.slice(7).trim() === token) return true;
  return url.searchParams.get("token") === token;
}

export function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

export function sendError(res: ServerResponse, statusCode: number, message: string): void {
  sendJson(res, statusCode, { ok: false, error: message });
}

export function parseContentDispositionFilename(header: string): string {
  if (!header) return "";
  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      // fall through to the plain forms
    }
  }
  const quotedMatch = /filename="([^"]+)"/i.exec(header);
  if (quotedMatch?.[1]) return quotedMatch[1];
  const bareMatch = /filename=([^;]+)/i.exec(header);
  return bareMatch?.[1]?.trim() || "";
}

export function getUploadFilename(req: IncomingMessage, url: URL): string {
  return safeChannelFilename(
    url.searchParams.get("name") ||
      getHeader(req, "x-rayline-filename") ||
      parseContentDispositionFilename(getHeader(req, "content-disposition")),
    `rayline-file-${Date.now()}`,
  );
}

function uploadTooLarge(maxBytes: number): ChannelHttpError {
  return new ChannelHttpError(`Upload exceeds ${Math.round(maxBytes / (1024 * 1024))} MB.`, 413);
}

class ByteLimitStream extends Transform {
  bytes = 0;

  constructor(private readonly maxBytes: number) {
    super();
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    this.bytes += chunk.length;
    if (this.bytes > this.maxBytes) {
      callback(uploadTooLarge(this.maxBytes));
      return;
    }
    callback(null, chunk);
  }
}

/** Streams the request body to `filePath` (exclusive create); returns bytes written. */
export async function receiveUpload(req: IncomingMessage, filePath: string, maxBytes: number): Promise<number> {
  const declaredLength = Number(getHeader(req, "content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw uploadTooLarge(maxBytes);

  const limiter = new ByteLimitStream(maxBytes);
  try {
    await pipeline(req, limiter, fs.createWriteStream(filePath, { flags: "wx", mode: 0o600 }));
  } catch (err) {
    await fs.promises.unlink(filePath).catch(() => {});
    throw err;
  }
  return limiter.bytes;
}

export function contentTypeForName(name: string): string {
  const ext = path.extname(name).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".txt" || ext === ".md" || ext === ".log") return "text/plain; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".html" || ext === ".htm") return "text/html; charset=utf-8";
  return "application/octet-stream";
}

export function listen(server: Server, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
}

export function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}
