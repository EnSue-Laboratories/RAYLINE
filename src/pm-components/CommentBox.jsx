import { useState } from "react";

export default function CommentBox({ repo, number, onCommentAdded }) {
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
    <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)", padding: "12px 20px", display: "flex", gap: 8, alignItems: "flex-end" }}>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a comment..."
        rows={1}
        style={{
          flex: 1,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 6,
          padding: "7px 10px",
          color: "rgba(255,255,255,0.8)",
          fontSize: 12,
          fontFamily: "system-ui, sans-serif",
          resize: "vertical",
          minHeight: 32,
          maxHeight: 120,
          boxSizing: "border-box",
        }}
      />
      <button
        onClick={handleSubmit}
        disabled={!body.trim() || submitting}
        style={{
          background: body.trim() ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 6,
          padding: "6px 12px",
          cursor: body.trim() ? "pointer" : "default",
          color: body.trim() ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.25)",
          fontSize: 11,
          fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: ".04em",
          transition: "all .15s",
          flexShrink: 0,
        }}
      >
        {submitting ? "..." : "Comment"}
      </button>
    </div>
  );
}
