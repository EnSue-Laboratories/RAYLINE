import { useEffect, useRef, useState } from "react";
import { Check, Image, X } from "lucide-react";
import { toBlob } from "html-to-image";
import { useFontScale } from "../contexts/FontSizeContext";

const CAPTURE_BACKGROUND = "linear-gradient(180deg, rgba(18,20,26,0.98), rgba(9,10,14,0.98))";

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read image data."));
    reader.readAsDataURL(blob);
  });
}

export default function CopyImageBtn({ targetRef, title = "Copy as image" }) {
  const [status, setStatus] = useState("idle");
  const resetTimerRef = useRef(null);
  const s = useFontScale();

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) {
        window.clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  const queueReset = () => {
    if (resetTimerRef.current) {
      window.clearTimeout(resetTimerRef.current);
    }
    resetTimerRef.current = window.setTimeout(() => setStatus("idle"), 1600);
  };

  const handleCopy = async () => {
    const target = targetRef?.current;
    if (!target) {
      setStatus("error");
      queueReset();
      return;
    }

    try {
      const blob = await toBlob(target, {
        backgroundColor: "#0D0D10",
        cacheBust: true,
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        width: target.scrollWidth,
        height: target.scrollHeight,
        filter: (node) => !(node instanceof HTMLElement && node.dataset.copyImageIgnore === "true"),
        style: {
          background: CAPTURE_BACKGROUND,
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "18px",
          boxShadow: "0 20px 44px rgba(0,0,0,0.28)",
          padding: "16px 18px 14px",
        },
      });

      if (!blob) {
        throw new Error("Image capture returned no data.");
      }

      const dataUrl = await blobToDataUrl(blob);
      const copied = await window.api?.writeClipboardImage?.(dataUrl);
      if (!copied) {
        throw new Error("Clipboard write failed.");
      }

      setStatus("success");
    } catch (error) {
      console.error("[CopyImageBtn] Failed to copy image", error);
      setStatus("error");
    }

    queueReset();
  };

  const color = status === "success"
    ? "rgba(160,200,140,0.65)"
    : status === "error"
      ? "rgba(255,160,160,0.7)"
      : "rgba(255,255,255,0.3)";

  return (
    <button
      onClick={handleCopy}
      title={status === "success" ? "Copied image" : status === "error" ? "Copy failed" : title}
      data-copy-image-ignore="true"
      style={{
        background: "none",
        border: "none",
        color,
        cursor: "pointer",
        padding: "2px 4px",
        borderRadius: 3,
        transition: "color .2s",
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        fontSize: s(10),
        fontFamily: "'JetBrains Mono',monospace",
      }}
      onMouseEnter={(e) => {
        if (status === "idle") {
          e.currentTarget.style.color = "rgba(255,255,255,0.5)";
        }
      }}
      onMouseLeave={(e) => {
        if (status === "idle") {
          e.currentTarget.style.color = "rgba(255,255,255,0.3)";
        }
      }}
    >
      {status === "success"
        ? <Check size={12} strokeWidth={1.5} />
        : status === "error"
          ? <X size={12} strokeWidth={1.5} />
          : <Image size={12} strokeWidth={1.5} />}
      {status === "success" ? "copied" : status === "error" ? "failed" : ""}
    </button>
  );
}
