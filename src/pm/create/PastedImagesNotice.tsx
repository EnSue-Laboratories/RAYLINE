import { useTranslator } from "../../contexts/LocaleContext";
import type { PastedImage } from "./usePastedImages";

interface PastedImagesNoticeProps {
  images: PastedImage[];
  onRemove: (index: number) => void;
  onClear: () => void;
}

/** Thumbnails of pasted images plus the "gh can't upload images" notice. */
export default function PastedImagesNotice({ images, onRemove, onClear }: PastedImagesNoticeProps) {
  const t = useTranslator();
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
        {images.map((img, i) => (
          <div key={i} style={{ position: "relative" }}>
            <img src={img.dataUrl} alt={img.name} style={{ height: 48, maxWidth: 80, borderRadius: 4, border: "1px solid var(--control-border)" }} />
            <button
              onClick={() => onRemove(i)}
              style={{
                position: "absolute",
                top: -4,
                right: -4,
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: "var(--control-bg-contrast)",
                border: "1px solid var(--control-border)",
                color: "var(--text-secondary)",
                fontSize: 10,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
              }}
            >
              x
            </button>
          </div>
        ))}
      </div>
      <div style={{ borderRadius: 8, border: "1px solid var(--pane-border)", background: "var(--pane-hover)", padding: "10px 12px" }}>
        <div style={{ fontSize: 12, color: "var(--text-primary)", fontWeight: 600, marginBottom: 4 }}>{t("pm.imageUploadTitle")}</div>
        <div style={{ fontSize: 11, color: "var(--text-subtle)", lineHeight: 1.45, marginBottom: 8 }}>{t("pm.imageUploadBody")}</div>
        <button
          onClick={onClear}
          style={{
            background: "var(--pane-active)",
            border: "1px solid var(--control-border)",
            borderRadius: 6,
            color: "var(--text-secondary)",
            fontSize: 11,
            fontFamily: "var(--font-mono)",
            letterSpacing: ".04em",
            padding: "6px 10px",
            cursor: "pointer",
          }}
        >
          {t("pm.createWithoutImages")}
        </button>
      </div>
    </div>
  );
}
