import { useState } from "react";
import { Copy, Check } from "lucide-react";

export default function CopyBtn({ text }) {
  const [ok, set] = useState(false);

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
      style={{
        background: "none",
        border: "none",
        color: ok ? "rgba(160,200,140,0.6)" : "rgba(255,255,255,0.3)",
        cursor: "pointer",
        padding: "2px 4px",
        borderRadius: 3,
        transition: "color .2s",
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        fontSize: 10,
        fontFamily: "'JetBrains Mono',monospace",
      }}
      onMouseEnter={(e) => { if (!ok) e.currentTarget.style.color = "rgba(255,255,255,0.5)"; }}
      onMouseLeave={(e) => { if (!ok) e.currentTarget.style.color = "rgba(255,255,255,0.3)"; }}
    >
      {ok ? <Check size={12} strokeWidth={1.5} /> : <Copy size={12} strokeWidth={1.5} />}
      {ok ? "copied" : ""}
    </button>
  );
}
