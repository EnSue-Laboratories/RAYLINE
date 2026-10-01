import { useState, type ClipboardEvent } from "react";

export interface PastedImage {
  name: string;
  dataUrl: string;
}

/**
 * Collects images pasted into a textarea as data URLs. `gh` can't upload
 * them, so the form offers "continue in GitHub" while any are attached.
 */
export function usePastedImages() {
  const [images, setImages] = useState<PastedImage[]>([]);

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    for (const item of event.clipboardData.items) {
      if (!item.type.startsWith("image/")) continue;
      event.preventDefault();
      const file = item.getAsFile();
      if (!file) continue;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== "string") return;
        const dataUrl = reader.result;
        setImages((prev) => [...prev, { name: file.name || `image-${Date.now()}.png`, dataUrl }]);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = (index: number) => setImages((prev) => prev.filter((_, i) => i !== index));
  const clearImages = () => setImages([]);

  return { images, handlePaste, removeImage, clearImages };
}
