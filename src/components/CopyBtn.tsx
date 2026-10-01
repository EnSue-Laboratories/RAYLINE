import { memo, useEffect, useRef, useState } from "react";
import { Copy, Check } from "lucide-react";
import { useFontScale } from "../contexts/FontSizeContext";

export interface CopyBtnProps {
  text: string;
  title?: string;
}

function CopyBtn({ text, title = "Copy" }: CopyBtnProps) {
  const [ok, set] = useState(false);
  const s = useFontScale();
  const resetTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
  }, []);

  const handleCopy = () => {
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(text);
    }
    set(true);
    if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = window.setTimeout(() => set(false), 1400);
  };

  return (
    <button
      onClick={handleCopy}
      title={ok ? "Copied" : title}
      data-copy-image-ignore="true"
      style={{
        background: "none",
        border: "none",
        color: ok ? "var(--accent)" : "var(--text-muted)",
        cursor: "pointer",
        padding: "2px 4px",
        borderRadius: 3,
        transition: "color .2s",
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        fontSize: s(10),
        fontFamily: "var(--font-mono)",
      }}
      onMouseEnter={(e) => { if (!ok) e.currentTarget.style.color = "var(--text-secondary)"; }}
      onMouseLeave={(e) => { if (!ok) e.currentTarget.style.color = "var(--text-muted)"; }}
    >
      {ok ? <Check size={12} strokeWidth={1.5} /> : <Copy size={12} strokeWidth={1.5} />}
      {ok ? "copied" : ""}
    </button>
  );
}

export default memo(CopyBtn);
