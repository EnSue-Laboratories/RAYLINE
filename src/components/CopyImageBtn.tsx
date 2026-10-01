import { memo, useEffect, useRef, useState, type RefObject } from "react";
import { Check, Image, Loader2, X } from "lucide-react";
import { useFontScale } from "../contexts/FontSizeContext";
import { CAPTURE_BG_SOLID, buildCaptureLayout, type CaptureWallpaper } from "./blocks/captureImage";

type CaptureStatus = "idle" | "loading" | "success" | "error";

export interface CopyImageBtnProps {
  targetRef: RefObject<HTMLElement | null> | null | undefined;
  title?: string;
  wallpaper?: CaptureWallpaper | null;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Failed to read image data."));
    reader.readAsDataURL(blob);
  });
}

/** Content size of `target` without the `data-copy-image-ignore` chrome. */
function measureCaptureContent(target: HTMLElement): { width: number; height: number } {
  const measureHost = target.parentElement || document.body;
  const measureClone = target.cloneNode(true) as HTMLElement;
  measureClone.querySelectorAll('[data-copy-image-ignore="true"]').forEach((el) => el.remove());
  measureClone.style.position = "absolute";
  measureClone.style.top = "-99999px";
  measureClone.style.left = "0";
  measureClone.style.visibility = "hidden";
  measureClone.style.pointerEvents = "none";
  measureClone.style.width = `${target.getBoundingClientRect().width}px`;
  measureHost.appendChild(measureClone);
  try {
    return { width: measureClone.scrollWidth, height: measureClone.scrollHeight };
  } finally {
    measureClone.remove();
  }
}

const STATUS_COLOR: Record<CaptureStatus, string> = {
  error: "var(--danger-text)",
  success: "var(--success-text)",
  loading: "var(--text-secondary)",
  idle: "var(--text-muted)",
};

function CopyImageBtn({ targetRef, title = "Copy as image", wallpaper }: CopyImageBtnProps) {
  const [status, setStatus] = useState<CaptureStatus>("idle");
  const resetTimerRef = useRef<number | null>(null);
  const s = useFontScale();

  useEffect(() => () => {
    if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
  }, []);

  const queueReset = () => {
    if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = window.setTimeout(() => setStatus("idle"), 1600);
  };

  const handleCopy = async () => {
    const target = targetRef?.current;
    if (!target) {
      setStatus("error");
      queueReset();
      return;
    }

    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
    setStatus("loading");

    try {
      // html-to-image is only needed here; keep it out of the startup bundle.
      const [{ toBlob }, content] = await Promise.all([
        import("html-to-image"),
        Promise.resolve().then(() => measureCaptureContent(target)),
      ]);
      const layout = buildCaptureLayout(content.width, content.height, wallpaper);

      const blob = await toBlob(target, {
        backgroundColor: CAPTURE_BG_SOLID,
        cacheBust: true,
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        width: layout.width,
        height: layout.height,
        filter: (node) => !(node instanceof HTMLElement && node.dataset.copyImageIgnore === "true"),
        style: layout.style,
      });
      if (!blob) throw new Error("Image capture returned no data.");

      const dataUrl = await blobToDataUrl(blob);
      const copied = await window.api?.writeClipboardImage?.(dataUrl);
      if (!copied) throw new Error("Clipboard write failed.");

      setStatus("success");
    } catch (error) {
      console.error("[CopyImageBtn] Failed to copy image", error);
      setStatus("error");
    }

    queueReset();
  };

  const isBusy = status === "loading";

  return (
    <button
      onClick={() => { void handleCopy(); }}
      disabled={isBusy}
      title={
        status === "success"
          ? "Copied image"
          : status === "error"
            ? "Copy failed"
            : status === "loading"
              ? "Capturing image…"
              : title
      }
      data-copy-image-ignore="true"
      style={{
        background: "none",
        border: "none",
        color: STATUS_COLOR[status],
        cursor: isBusy ? "progress" : "pointer",
        padding: "2px 4px",
        borderRadius: 3,
        transition: "color .2s",
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        fontSize: s(10),
        fontFamily: "var(--font-mono)",
      }}
      onMouseEnter={(e) => {
        if (status === "idle") {
          e.currentTarget.style.color = "var(--text-secondary)";
          e.currentTarget.style.background = "var(--control-bg-soft)";
        }
      }}
      onMouseLeave={(e) => {
        if (status === "idle") {
          e.currentTarget.style.color = "var(--text-muted)";
          e.currentTarget.style.background = "none";
        }
      }}
    >
      {status === "success"
        ? <Check size={12} strokeWidth={1.5} />
        : status === "error"
          ? <X size={12} strokeWidth={1.5} />
          : status === "loading"
            ? <Loader2 size={12} strokeWidth={1.5} style={{ animation: "spin 1s linear infinite" }} />
            : <Image size={12} strokeWidth={1.5} />}
      {status === "success"
        ? "copied"
        : status === "error"
          ? "failed"
          : status === "loading"
            ? "copying"
            : ""}
    </button>
  );
}

export default memo(CopyImageBtn);
