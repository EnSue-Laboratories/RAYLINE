import type { ImageAttachment } from "@shared/chat/types";

function readImage(file: File): Promise<ImageAttachment | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === "string"
        ? { type: "image", dataUrl: reader.result, name: file.name || "image" }
        : null);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

/** Read image files as data-URL attachments; unreadable files are skipped. */
export async function readImageAttachments(files: readonly File[]): Promise<ImageAttachment[]> {
  const read = await Promise.all(files.map(readImage));
  return read.filter((item): item is ImageAttachment => item !== null);
}

/** Image files from a paste event's clipboard items. */
export function clipboardImageFiles(items: DataTransferItemList | null | undefined): File[] {
  if (!items) return [];
  return Array.from(items)
    .filter((item) => item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
}
