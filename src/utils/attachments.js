function basename(filePath) {
  if (typeof filePath !== "string" || filePath.length === 0) return "";
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] || filePath;
}

function resolveFilePath(file) {
  return window.api?.getFilePath?.(file) || file?.path || null;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(typeof event.target?.result === "string" ? event.target.result : "");
    reader.onerror = () => reject(reader.error || new Error("Failed to read attachment."));
    reader.readAsDataURL(file);
  });
}

async function fileToAttachment(file) {
  if (!file) return null;

  const filePath = resolveFilePath(file);
  const fallbackFileName = file.name || basename(filePath) || "file";

  if (file.type?.startsWith("image/")) {
    const dataUrl = await readFileAsDataUrl(file);
    if (!dataUrl) return null;

    return {
      type: "image",
      dataUrl,
      name: file.name || basename(filePath) || `image-${Date.now()}.png`,
      ...(filePath ? { path: filePath } : {}),
    };
  }

  return {
    type: "file",
    name: fallbackFileName,
    path: filePath || fallbackFileName,
  };
}

export function dataTransferHasFiles(dataTransfer) {
  if (!dataTransfer) return false;
  const types = Array.from(dataTransfer.types || []);
  return types.includes("Files") || Array.from(dataTransfer.files || []).length > 0;
}

export async function fileListToAttachments(fileList) {
  const files = Array.from(fileList || []).filter(Boolean);
  if (files.length === 0) return [];

  const attachments = await Promise.all(
    files.map(async (file) => {
      try {
        return await fileToAttachment(file);
      } catch {
        return null;
      }
    })
  );

  return attachments.filter(Boolean);
}

export async function clipboardItemsToAttachments(items) {
  const files = Array.from(items || [])
    .filter((item) => item?.kind === "file")
    .map((item) => item.getAsFile?.())
    .filter(Boolean);

  return fileListToAttachments(files);
}
