import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ImageOff } from "lucide-react";
import type { AssistantImageSource } from "./images";

interface ImageLightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
}

/** Full-bleed portal overlay; backdrop click or Escape closes, the image swallows clicks. */
function ImageLightbox({ src, alt, onClose }: ImageLightboxProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={alt || "Image preview"}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.82)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
        animation: "msgIn .2s ease-out",
      }}
    >
      <img
        src={src}
        alt={alt}
        onClick={(event) => event.stopPropagation()}
        style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 8, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}
      />
    </div>,
    document.body,
  );
}

// Resolved file → data URL, so re-renders that remount AssistantImage with the
// same storagePath skip the IPC round trip and the skeleton flash.
const ASSISTANT_IMAGE_CACHE = new Map<string, string>();

/**
 * Inline assistant image: bubble-width, skeleton until painted, error
 * placeholder on failure, lightbox on click.
 */
export default function AssistantImage({ src, alt, storagePath, originalPath }: AssistantImageSource) {
  const cachedFromStorage = storagePath ? ASSISTANT_IMAGE_CACHE.get(storagePath) : "";
  const initialSrc = src || cachedFromStorage || "";
  const [resolvedSrc, setResolvedSrc] = useState(initialSrc);
  // With a source on first paint, treat as loaded so streaming re-renders never flash.
  const [loaded, setLoaded] = useState(Boolean(initialSrc));
  const [errored, setErrored] = useState(() => !initialSrc && !storagePath);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    if (resolvedSrc || !storagePath || typeof window.api?.readImage !== "function") return undefined;
    let cancelled = false;
    window.api
      .readImage(storagePath)
      .then((dataUrl) => {
        if (cancelled) return;
        if (dataUrl) {
          ASSISTANT_IMAGE_CACHE.set(storagePath, dataUrl);
          setResolvedSrc(dataUrl);
        } else {
          setErrored(true);
        }
      })
      .catch(() => {
        if (!cancelled) setErrored(true);
      });
    return () => {
      cancelled = true;
    };
  }, [resolvedSrc, storagePath]);

  const altText = alt || "";
  const handleOpen = useCallback(() => {
    if (!errored && resolvedSrc) setLightboxOpen(true);
  }, [errored, resolvedSrc]);
  const handleClose = useCallback(() => setLightboxOpen(false), []);

  if (errored) {
    return (
      <span
        title={originalPath || "Image failed to load"}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 10px",
          margin: "8px 0",
          borderRadius: 8,
          border: "1px dashed rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.03)",
          color: "rgba(255,255,255,0.45)",
          fontSize: 12,
          fontFamily: "'JetBrains Mono',monospace",
        }}
      >
        <ImageOff size={14} strokeWidth={1.5} />
        {altText || "Image unavailable"}
      </span>
    );
  }

  return (
    <span
      style={{
        display: "block",
        position: "relative",
        margin: "8px 0",
        maxWidth: "100%",
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(255,255,255,0.03)",
        lineHeight: 0,
      }}
    >
      {!loaded && (
        <span
          aria-hidden="true"
          style={{
            position: resolvedSrc ? "absolute" : "static",
            inset: 0,
            display: "block",
            width: "100%",
            minHeight: 160,
            background: "linear-gradient(110deg, rgba(255,255,255,0.04) 8%, rgba(255,255,255,0.08) 18%, rgba(255,255,255,0.04) 33%)",
            backgroundSize: "200% 100%",
            animation: "msgIn 1.2s ease-in-out infinite",
          }}
        />
      )}
      {resolvedSrc && (
        <img
          src={resolvedSrc}
          alt={altText}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          onClick={handleOpen}
          title={altText || originalPath || "Click to expand"}
          style={{
            display: "block",
            maxWidth: "100%",
            height: "auto",
            cursor: "zoom-in",
            opacity: loaded ? 1 : 0,
            transition: "opacity 0.18s ease-out",
          }}
        />
      )}
      {lightboxOpen && resolvedSrc && <ImageLightbox src={resolvedSrc} alt={altText} onClose={handleClose} />}
    </span>
  );
}
