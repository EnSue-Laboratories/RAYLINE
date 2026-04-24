import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { useFontScale } from "../contexts/FontSizeContext";

export default function CopyBtn({ text, title = "Copy" }) {
  const [ok, set] = useState(false);
  const s = useFontScale();

  const handleCopy = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
    set(true);
    setTimeout(() => set(false), 1400);
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
        fontFamily: "'JetBrains Mono',monospace",
      }}
      onMouseEnter={(e) => { if (!ok) e.currentTarget.style.color = "var(--text-secondary)"; }}
      onMouseLeave={(e) => { if (!ok) e.currentTarget.style.color = "var(--text-muted)"; }}
    >
      {ok ? <Check size={12} strokeWidth={1.5} /> : <Copy size={12} strokeWidth={1.5} />}
      {ok ? "copied" : ""}
    </button>
  );
}
