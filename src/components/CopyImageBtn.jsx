import { useEffect, useRef, useState } from "react";
import { Check, Image, Loader2, X } from "lucide-react";
import { toBlob } from "html-to-image";
import { useFontScale } from "../contexts/FontSizeContext";

const CAPTURE_BG_SOLID = "#0D0D10";
const CAPTURE_BACKGROUND = "linear-gradient(180deg, #121622 0%, #0A0B10 100%)";
const CAPTURE_PADDING_X = 24;
const CAPTURE_PADDING_TOP = 20;
const CAPTURE_PADDING_BOTTOM = 18;

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read image data."));
    reader.readAsDataURL(blob);
  });
}

export default function CopyImageBtn({ targetRef, title = "Copy as image", wallpaper }) {
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

    if (resetTimerRef.current) {
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
    setStatus("loading");

    const ignoredEls = Array.from(
      target.querySelectorAll('[data-copy-image-ignore="true"]'),
    ).filter((el) => {
      let parent = el.parentElement;
      while (parent && parent !== target) {
        if (parent.dataset && parent.dataset.copyImageIgnore === "true") return false;
        parent = parent.parentElement;
      }
      return true;
    });
    const hiddenRestores = ignoredEls.map((el) => {
      const original = el.style.display;
      el.style.display = "none";
      return { el, original };
    });

    try {
      const contentWidth = target.scrollWidth;
      const contentHeight = target.scrollHeight;
      hiddenRestores.forEach(({ el, original }) => {
        el.style.display = original;
      });
      const totalWidth = contentWidth + CAPTURE_PADDING_X * 2;
      const totalHeight = contentHeight + CAPTURE_PADDING_TOP + CAPTURE_PADDING_BOTTOM;

      const hasWallpaper = Boolean(wallpaper?.dataUrl);
      const wallpaperOpacity = Number.isFinite(wallpaper?.imgOpacity)
        ? Math.min(1, Math.max(0, wallpaper.imgOpacity / 100))
        : 1;
      const overlayAlpha = 0.68 + (1 - wallpaperOpacity) * 0.25;
      const captureStyle = {
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "18px",
        boxShadow: "0 20px 44px rgba(0,0,0,0.28)",
        padding: `${CAPTURE_PADDING_TOP}px ${CAPTURE_PADDING_X}px ${CAPTURE_PADDING_BOTTOM}px`,
        boxSizing: "content-box",
        width: `${contentWidth}px`,
      };

      if (hasWallpaper) {
        captureStyle.backgroundColor = CAPTURE_BG_SOLID;
        captureStyle.backgroundImage = `linear-gradient(rgba(13,13,16,${overlayAlpha.toFixed(2)}), rgba(13,13,16,${(overlayAlpha + 0.1).toFixed(2)})), url(${wallpaper.dataUrl})`;
        captureStyle.backgroundSize = "cover, cover";
        captureStyle.backgroundPosition = "center, center";
        captureStyle.backgroundRepeat = "no-repeat, no-repeat";
      } else {
        captureStyle.background = CAPTURE_BACKGROUND;
      }

      const blob = await toBlob(target, {
        backgroundColor: CAPTURE_BG_SOLID,
        cacheBust: true,
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        width: totalWidth,
        height: totalHeight,
        filter: (node) => !(node instanceof HTMLElement && node.dataset.copyImageIgnore === "true"),
        style: captureStyle,
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
    } finally {
      hiddenRestores.forEach(({ el, original }) => {
        if (el.style.display === "none") el.style.display = original;
      });
    }

    queueReset();
  };

  const color = status === "error"
    ? "rgba(255,160,160,0.7)"
    : status === "success"
      ? "rgba(255,255,255,0.55)"
      : status === "loading"
        ? "rgba(255,255,255,0.55)"
        : "rgba(255,255,255,0.3)";

  const isBusy = status === "loading";

  return (
    <button
      onClick={handleCopy}
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
        color,
        cursor: isBusy ? "progress" : "pointer",
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
