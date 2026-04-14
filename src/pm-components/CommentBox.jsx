import React, { useState } from "react";

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
    } catch (e) {
      // silent fail for now
    }
    setSubmitting(false);
  };

  return (
    <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)", padding: "16px 20px" }}>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a comment..."
        rows={3}
        style={{
          width: "100%",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 8,
          padding: "10px 12px",
          color: "rgba(255,255,255,0.8)",
          fontSize: 13,
          fontFamily: "system-ui, sans-serif",
          resize: "vertical",
          minHeight: 60,
          boxSizing: "border-box",
        }}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
        <button
          onClick={handleSubmit}
          disabled={!body.trim() || submitting}
          style={{
            background: body.trim()
              ? "rgba(255,255,255,0.1)"
              : "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 6,
            padding: "6px 16px",
            cursor: body.trim() ? "pointer" : "default",
            color: body.trim()
              ? "rgba(255,255,255,0.8)"
              : "rgba(255,255,255,0.3)",
            fontSize: 12,
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: ".04em",
            transition: "all .15s",
          }}
        >
          {submitting ? "Posting..." : "Comment"}
        </button>
      </div>
    </div>
  );
}
