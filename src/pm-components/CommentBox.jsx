import { useState } from "react";
import { createTranslator } from "../i18n";

export default function CommentBox({ repo, number, onCommentAdded, actions, locale = "en-US" }) {
  const t = createTranslator(locale);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!body.trim() || submitting) return;
    setSubmitting(true);
    try {
      await window.ghApi.addComment(repo, number, body.trim());
      setBody("");
      onCommentAdded();
    } catch {
      /* Keep the current draft visible if comment submission fails. */
    }
    setSubmitting(false);
  };

  return (
    <div style={{ borderTop: "1px solid var(--control-border-soft)", padding: "12px 20px" }}>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t("pm.commentPlaceholder")}
        rows={3}
        style={{
          width: "100%",
          background: "var(--control-bg)",
          border: "1px solid var(--control-border)",
          borderRadius: 6,
          padding: "8px 10px",
          color: "var(--text-primary)",
          fontSize: 12,
          fontFamily: "system-ui, sans-serif",
          resize: "vertical",
          minHeight: 64,
          boxSizing: "border-box",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", marginTop: 8, gap: 6 }}>
        <div style={{ flex: 1 }} />
        {actions}
        <button
          onClick={handleSubmit}
          disabled={!body.trim() || submitting}
          style={{
            background: body.trim() ? "var(--button-primary-bg)" : "var(--button-primary-bg-disabled)",
            border: "1px solid var(--control-border)",
            borderRadius: 6,
            padding: "5px 12px",
            cursor: body.trim() ? "pointer" : "default",
            color: body.trim() ? "var(--button-primary-fg)" : "var(--button-primary-fg-disabled)",
            fontSize: 11,
            fontFamily: "'JetBrains Mono', monospace",
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
