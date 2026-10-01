/**
 * Uploads chat attachments to Multica (`POST /api/upload-file`) and builds
 * the prompt block that tells the remote agent how to fetch them. Name /
 * MIME helpers and the prompt builder are pure.
 */

import { promises as fsp } from "node:fs";
import path from "node:path";
import type { FileAttachment } from "@shared/chat/types";
import type { ImageInput } from "../common/images";
import { readNumber, readString } from "../common/json";
import { multicaRequest, type MulticaAuth, type MulticaUpload } from "./rest";

export type MulticaAttachmentKind = "image" | "file";

export interface UploadedMulticaAttachment {
  kind: MulticaAttachmentKind;
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
}

const IMAGE_TYPES_BY_EXT: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

const FILE_TYPES_BY_EXT: Readonly<Record<string, string>> = {
  ...IMAGE_TYPES_BY_EXT,
  ".pdf": "application/pdf",
  ".json": "application/json",
  ".txt": "text/plain",
  ".md": "text/plain",
};

export function contentTypeForPath(filePath: string, kind: MulticaAttachmentKind): string {
  const ext = path.extname(filePath).toLowerCase();
  const table = kind === "image" ? IMAGE_TYPES_BY_EXT : FILE_TYPES_BY_EXT;
  return table[ext] ?? "application/octet-stream";
}

export function guessExtension(contentType: string | null | undefined): string {
  const normalized = String(contentType || "").toLowerCase();
  switch (normalized) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    case "image/svg+xml":
      return "svg";
    case "application/pdf":
      return "pdf";
    case "text/plain":
      return "txt";
    case "application/json":
      return "json";
    default: {
      const subtype = /^[^/]+\/(.+)$/.exec(normalized)?.[1] ?? "bin";
      return subtype.replace(/[^a-z0-9.+-]+/gi, "").split("+")[0] || "bin";
    }
  }
}

/** Decodes a data URL (base64 or percent-encoded). Throws on non-data URLs. */
export function parseDataUrl(dataUrl: string): { contentType: string; data: Buffer } {
  if (!dataUrl.startsWith("data:")) throw new Error("expected a data URL");
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) throw new Error("invalid data URL");
  const meta = dataUrl.slice(5, commaIndex);
  const payload = dataUrl.slice(commaIndex + 1);
  const parts = meta.split(";");
  const contentType = parts[0] || "application/octet-stream";
  const data = parts.includes("base64") ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload), "utf8");
  return { contentType, data };
}

export function normalizeAttachmentFilename(filename: string | null | undefined, fallbackPrefix: string, contentType: string, index: number): string {
  const raw = typeof filename === "string" ? filename.trim() : "";
  return raw ? path.basename(raw) : `${fallbackPrefix}-${index + 1}.${guessExtension(contentType)}`;
}

async function loadImageUpload(entry: ImageInput, index: number): Promise<MulticaUpload> {
  if (typeof entry === "object" && entry.path) {
    const contentType = contentTypeForPath(entry.path, "image");
    return {
      filename: normalizeAttachmentFilename(entry.name || entry.path, "image", contentType, index),
      contentType,
      data: await fsp.readFile(entry.path),
    };
  }
  const dataUrl = typeof entry === "string" ? entry : entry.dataUrl;
  if (!dataUrl) throw new Error(`attached image ${index + 1} is missing data`);
  const parsed = parseDataUrl(dataUrl);
  return {
    filename: normalizeAttachmentFilename(typeof entry === "object" ? entry.name : undefined, "image", parsed.contentType, index),
    contentType: parsed.contentType,
    data: parsed.data,
  };
}

async function loadFileUpload(entry: FileAttachment, index: number): Promise<MulticaUpload> {
  const filePath = entry.path ?? "";
  if (!filePath) throw new Error(`attached file ${index + 1} is missing a readable path`);
  const contentType = contentTypeForPath(filePath, "file");
  return {
    filename: normalizeAttachmentFilename(entry.name || filePath, "file", contentType, index),
    contentType,
    data: await fsp.readFile(filePath),
  };
}

async function uploadOne(auth: MulticaAuth, kind: MulticaAttachmentKind, upload: MulticaUpload): Promise<UploadedMulticaAttachment> {
  const response = await multicaRequest({ ...auth, method: "POST", path: "/api/upload-file", file: upload });
  const id = readString(response, "id");
  if (!id) throw new Error(`Multica uploaded ${kind} '${upload.filename}' but did not return an attachment id`);
  return {
    kind,
    id,
    filename: readString(response, "filename") || upload.filename,
    contentType: readString(response, "content_type") || upload.contentType,
    sizeBytes: readNumber(response, "size_bytes") ?? upload.data.length,
  };
}

/** Uploads images then files, sequentially (server order = prompt order). */
export async function uploadMulticaAttachments(
  auth: MulticaAuth,
  images: readonly ImageInput[] | null | undefined,
  files: readonly FileAttachment[] | null | undefined,
): Promise<UploadedMulticaAttachment[]> {
  const uploaded: UploadedMulticaAttachment[] = [];
  for (const [i, image] of (images ?? []).entries()) uploaded.push(await uploadOne(auth, "image", await loadImageUpload(image, i)));
  for (const [i, file] of (files ?? []).entries()) uploaded.push(await uploadOne(auth, "file", await loadFileUpload(file, i)));
  return uploaded;
}

export function buildMulticaAttachmentPrompt(prompt: string | null | undefined, attachments: readonly UploadedMulticaAttachment[]): string {
  const usable = attachments.filter((item) => item.id);
  if (usable.length === 0) return prompt ?? "";
  const lines = [
    "<rayline-multica-attachments>",
    "RayLine uploaded attachments for this user message.",
    "These files are available as Multica workspace attachments.",
    "Use `multica attachment download <attachment-id>` to fetch one locally before answering if you need to inspect it.",
    "Do not claim you inspected an attachment unless you actually downloaded or opened it in the runtime.",
    "Attachments:",
    ...usable.map(
      (item) =>
        `- ${item.kind}: ${item.filename} (attachment_id: ${item.id}${item.contentType ? `, content_type: ${item.contentType}` : ""}${Number.isFinite(item.sizeBytes) ? `, size_bytes: ${item.sizeBytes}` : ""})`,
    ),
    "Do not quote this block back unless the user explicitly asks.",
    "</rayline-multica-attachments>",
  ];
  return `${lines.join("\n")}\n\n${prompt || ""}`.trim();
}
