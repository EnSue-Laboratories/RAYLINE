/** Pure image-shape helpers for message rendering. */
import type { MessageImage } from "@shared/chat/types";

export interface AssistantImageSource {
  src: string;
  alt: string;
  mime?: string;
  storagePath?: string;
  originalPath?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** User-message image: a data URL available right away, if any. */
export function getImmediateImageSrc(image: MessageImage): string {
  if (typeof image === "string") return image;
  return "dataUrl" in image ? image.dataUrl || "" : "";
}

/** User-message image persisted under userData (loaded through `read-image`). */
export function getStoredImagePath(image: MessageImage): string {
  if (typeof image === "string") return "";
  return image.storagePath || "";
}

/**
 * Markdown `![alt](src)`: renderable URLs pass through; `file://` URLs and
 * bare local paths load through `read-image` via `storagePath`.
 */
export function resolveMarkdownImgSrc(src: string | undefined, alt: string): AssistantImageSource {
  if (!src) return { src: "", alt };
  if (/^(data:|https?:|blob:)/i.test(src)) return { src, alt };
  if (/^file:\/\//i.test(src)) {
    let path = src.replace(/^file:\/\//i, "");
    try {
      path = decodeURI(path);
    } catch {
      // Keep the raw path.
    }
    return { src: "", storagePath: path, originalPath: src, alt };
  }
  if (src.startsWith("/") || src.startsWith("~")) return { src: "", storagePath: src, originalPath: src, alt };
  return { src, alt };
}

/**
 * Normalize an assistant image part (already-normalized, Anthropic `source`,
 * OpenAI `image_url`, or a bare URL string) into AssistantImage props.
 */
export function normalizeAssistantImagePart(part: unknown): AssistantImageSource | null {
  if (!part) return null;
  if (typeof part === "string") return { src: part, alt: "" };
  if (!isRecord(part)) return null;
  const alt = str(part.alt) || str(part.title);

  const source = part.source;
  if (isRecord(source)) {
    if (source.type === "base64" && str(source.data)) {
      const mime = str(source.media_type) || str(source.mediaType) || "image/png";
      return { src: `data:${mime};base64,${str(source.data)}`, alt, mime };
    }
    if (source.type === "url" && str(source.url)) return { src: str(source.url), alt };
  }

  const imageUrl = part.image_url;
  if (imageUrl) {
    const url = typeof imageUrl === "string" ? imageUrl : isRecord(imageUrl) ? str(imageUrl.url) : "";
    if (url) return { src: url, alt: str(part.alt) };
  }

  if (part.src || part.storagePath || part.dataUrl) {
    const normalized: AssistantImageSource = { src: str(part.src) || str(part.dataUrl), alt: alt || str(part.name) };
    if (str(part.mime)) normalized.mime = str(part.mime);
    if (str(part.storagePath)) normalized.storagePath = str(part.storagePath);
    if (str(part.originalPath)) normalized.originalPath = str(part.originalPath);
    return normalized;
  }
  return null;
}

/** Body of a ```image fence: a bare URL / data URL, or `{ "src"|"url", "alt" }` JSON. */
export function parseImageFenceBody(body: string): AssistantImageSource | null {
  const trimmed = body.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (isRecord(parsed)) {
        const src = str(parsed.src) || str(parsed.url) || str(parsed.dataUrl);
        if (src) {
          const image: AssistantImageSource = { src, alt: str(parsed.alt) || str(parsed.title) };
          if (str(parsed.mime)) image.mime = str(parsed.mime);
          return image;
        }
      }
    } catch {
      // Fall through to URL handling.
    }
  }
  return { src: trimmed, alt: "" };
}
