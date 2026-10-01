import { X } from "lucide-react";
import type { Attachment } from "@shared/chat/types";
import { useFontScale } from "../../contexts/FontSizeContext";

export interface ComposerChipsProps {
  issueContext: string | null;
  attachments: readonly Attachment[];
  onClearIssue: () => void;
  onRemoveAttachment: (index: number) => void;
}

const removeBtnStyle = {
  background: "none", border: "none", color: "var(--text-muted)",
  cursor: "pointer", padding: 0, display: "flex",
} as const;

/** Linked-issue chip plus one chip per attachment. */
export default function ComposerChips({ issueContext, attachments, onClearIssue, onRemoveAttachment }: ComposerChipsProps) {
  const s = useFontScale();
  if (!issueContext && attachments.length === 0) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {issueContext && (
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          padding: "3px 8px",
          background: "var(--accent-bg-strong)",
          border: "1px solid var(--accent-border)",
          borderRadius: 6, fontSize: s(10),
          fontFamily: "var(--font-mono)",
          color: "var(--accent-text)",
        }}>
          {issueContext.split("\n")[0]}
          <button onClick={onClearIssue} style={removeBtnStyle}>
            <X size={10} />
          </button>
        </span>
      )}
      {attachments.map((f, i) => (
        <span key={i} style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          padding: "3px 8px",
          background: f.type === "image" ? "var(--success-bg)" : "var(--control-bg)",
          border: `1px solid ${f.type === "image" ? "var(--success-border)" : "var(--control-bg-strong)"}`,
          borderRadius: 6, fontSize: s(10),
          fontFamily: "var(--font-mono)",
          color: "var(--text-secondary)",
        }}>
          {f.type === "image" && f.dataUrl && (
            <img src={f.dataUrl} alt="" style={{ width: 14, height: 14, borderRadius: 2, objectFit: "cover" }} />
          )}
          {f.name}
          <button onClick={() => onRemoveAttachment(i)} style={removeBtnStyle}>
            <X size={10} />
          </button>
        </span>
      ))}
    </div>
  );
}
