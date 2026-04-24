import { useState } from "react";

export default function CommentBox({ repo, number, onCommentAdded, actions }) {
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!body.trim() || submitting) return;
    setSubmitting(true);
    try {
      await window.ghApi.addComment(repo, number, body.trim());
      setBody("");
      onCommentAdded();
    } catch {}
    setSubmitting(false);
  };

  return (
    <div style={{ borderTop: "1px solid var(--row-separator)", padding: "12px 20px" }}>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a comment..."
        rows={3}
        style={{
          width: "100%",
          background: "var(--control-bg)",
          border: "1px solid var(--control-border)",
          borderRadius: 6,
          padding: "8px 10px",
          color: "var(--text-secondary)",
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
            background: body.trim() ? "var(--control-bg-hover)" : "var(--control-bg)",
            border: "1px solid var(--control-border)",
            borderRadius: 6,
            padding: "5px 12px",
            cursor: body.trim() ? "pointer" : "default",
            color: body.trim() ? "var(--text-secondary)" : "var(--text-faint)",
            fontSize: 11,
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: ".04em",
            transition: "all .15s",
          }}
        >
          {submitting ? "..." : "Comment"}
        </button>
      </div>
    </div>
  );
}
