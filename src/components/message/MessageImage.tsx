import { useEffect, useState } from "react";
import type { MessageImage as MessageImageValue } from "@shared/chat/types";
import { getImmediateImageSrc, getStoredImagePath } from "./images";

/** Thumbnail of an image attached to a user message. */
export default function MessageImage({ image }: { image: MessageImageValue }) {
  const immediateSrc = getImmediateImageSrc(image);
  const storagePath = getStoredImagePath(image);
  const [storedSrc, setStoredSrc] = useState("");

  useEffect(() => {
    if (immediateSrc || !storagePath || typeof window.api?.readImage !== "function") return undefined;
    let cancelled = false;
    window.api
      .readImage(storagePath)
      .then((dataUrl) => {
        if (!cancelled && dataUrl) setStoredSrc(dataUrl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [immediateSrc, storagePath]);

  const loadedSrc = immediateSrc || storedSrc;
  if (!loadedSrc) {
    return (
      <div style={{ height: 40, width: 58, borderRadius: 6, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }} />
    );
  }
  return <img src={loadedSrc} alt="" style={{ height: 40, borderRadius: 6, opacity: 0.8 }} />;
}
