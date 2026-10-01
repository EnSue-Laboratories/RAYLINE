import { useState, type ReactNode } from "react";
import { useTranslator } from "../contexts/LocaleContext";
import { MONO_FONT, SYSTEM_FONT } from "../pm/styles";

interface CommentBoxProps {
  repo: string;
  number: number;
  onCommentAdded: () => void;
  /** Extra buttons rendered left of "Comment" (merge / close / reopen). */
  actions?: ReactNode;
}

export default function CommentBox({ repo, number, onCommentAdded, actions }: CommentBoxProps) {
  const t = useTranslator();
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const hasText = Boolean(body.trim());

  const handleSubmit = async () => {
    if (!hasText || submitting) return;
    setSubmitting(true);
    try {
      await window.ghApi.addComment(repo, number, body.trim());
      setBody("");
      onCommentAdded();
    } catch { /* keep the draft so the user can retry */ }
    setSubmitting(false);
  };

  return (
    <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)", padding: "12px 20px" }}>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t("pm.commentPlaceholder")}
        rows={3}
        style={{
          width: "100%",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 6,
          padding: "8px 10px",
          color: "rgba(255,255,255,0.8)",
          fontSize: 12,
          fontFamily: SYSTEM_FONT,
          resize: "vertical",
          minHeight: 64,
          boxSizing: "border-box",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", marginTop: 8, gap: 6 }}>
        <div style={{ flex: 1 }} />
        {actions}
        <button
          onClick={() => void handleSubmit()}
          disabled={!hasText || submitting}
          style={{
            background: hasText ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 6,
            padding: "5px 12px",
            cursor: hasText ? "pointer" : "default",
            color: hasText ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.25)",
            fontSize: 11,
            fontFamily: MONO_FONT,
            letterSpacing: ".04em",
            transition: "all .15s",
          }}
        >
          {submitting ? "..." : t("pm.comment")}
        </button>
      </div>
    </div>
  );
}
