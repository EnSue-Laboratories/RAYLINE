import { X, FileText } from "lucide-react";
import { useFontScale } from "../contexts/FontSizeContext";

export default function ImagePreview({ items, onRemove }) {
  const s = useFontScale();
  if (!items || items.length === 0) return null;

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
      {items.map((item, i) => (
        <div
          key={i}
          style={{
            position: "relative",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.03)",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
          }}
        >
          {item.type === "image" ? (
            <img
              src={item.dataUrl}
              alt=""
              style={{ height: 48, maxWidth: 80, objectFit: "cover", display: "block" }}
            />
          ) : (
            <div style={{
              padding: "8px 12px",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: s(11),
              fontFamily: "'JetBrains Mono',monospace",
              color: "rgba(255,255,255,0.5)",
            }}>
              <FileText size={13} strokeWidth={1.5} />
              {item.name}
            </div>
          )}

          <button
            onClick={() => onRemove(i)}
            style={{
              position: item.type === "image" ? "absolute" : "relative",
              top: item.type === "image" ? 2 : "auto",
              right: item.type === "image" ? 2 : "auto",
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: "rgba(0,0,0,0.6)",
              border: "none",
              color: "rgba(255,255,255,0.6)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              marginLeft: item.type === "file" ? 4 : 0,
              marginRight: item.type === "file" ? 4 : 0,
            }}
          >
            <X size={10} />
          </button>
        </div>
      ))}
    </div>
  );
}
