/** Composer attachments from dropped / pasted files. */
import type { Attachment, FileAttachment, ImageAttachment } from "@shared/chat/types";

function basename(filePath: string | null | undefined): string {
  if (typeof filePath !== "string" || filePath.length === 0) return "";
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] || filePath;
}

function resolveFilePath(file: File): string | null {
  return window.api?.getFilePath?.(file) || null;
}

function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read attachment."));
    reader.readAsDataURL(file);
  });
}

async function fileToAttachment(file: File): Promise<Attachment | null> {
  const filePath = resolveFilePath(file);
  const fallbackFileName = file.name || basename(filePath) || "file";

  if (file.type?.startsWith("image/")) {
    const dataUrl = await readFileAsDataUrl(file);
    if (!dataUrl) return null;
    let stored: Awaited<ReturnType<typeof window.api.storeMessageImage>> = null;
    if (typeof window.api?.storeMessageImage === "function") {
      try {
        stored = await window.api.storeMessageImage({ dataUrl, name: file.name || basename(filePath) || "", path: filePath || "" });
      } catch {
        stored = null;
      }
    }
    const image: ImageAttachment = { type: "image", dataUrl, name: file.name || basename(filePath) || `image-${Date.now()}.png` };
    if (filePath) image.path = filePath;
    if (stored?.storagePath) image.storagePath = stored.storagePath;
    if (stored?.mime) image.mime = stored.mime;
    return image;
  }

  const attachment: FileAttachment = { type: "file", name: fallbackFileName, path: filePath || fallbackFileName };
  return attachment;
}

export function dataTransferHasFiles(dataTransfer: DataTransfer | null | undefined): boolean {
  if (!dataTransfer) return false;
  return Array.from(dataTransfer.types || []).includes("Files") || (dataTransfer.files?.length ?? 0) > 0;
}

export async function fileListToAttachments(fileList: FileList | readonly File[] | null | undefined): Promise<Attachment[]> {
  const files = Array.from(fileList ?? []).filter(Boolean);
  if (files.length === 0) return [];
  const attachments = await Promise.all(
    files.map(async (file) => {
      try {
        return await fileToAttachment(file);
      } catch {
        return null;
      }
    }),
  );
  return attachments.filter((attachment): attachment is Attachment => attachment !== null);
}

export async function clipboardItemsToAttachments(items: DataTransferItemList | readonly DataTransferItem[] | null | undefined): Promise<Attachment[]> {
  const files = Array.from(items ?? [])
    .filter((item) => item?.kind === "file")
    .map((item) => item.getAsFile?.())
    .filter((file): file is File => Boolean(file));
  return fileListToAttachments(files);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Guard for attachments read back from storage (composer drafts). */
export function isAttachment(value: unknown): value is Attachment {
  if (!isRecord(value)) return false;
  if (value.type === "image") return typeof value.dataUrl === "string";
  return value.type === "file";
}
