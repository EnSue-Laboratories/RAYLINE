import { useState, useEffect } from "react";
import { X } from "lucide-react";

const inputStyle = {
  width: "100%",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 6,
  padding: "8px 10px",
  color: "rgba(255,255,255,0.8)",
  fontSize: 13,
  fontFamily: "system-ui, sans-serif",
  boxSizing: "border-box",
};

const selectStyle = {
  ...inputStyle,
  marginTop: 4,
  cursor: "pointer",
  WebkitAppearance: "none",
  appearance: "none",
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.4)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 10px center",
  paddingRight: 30,
};

export default function CreateForm({ repos, type, onClose, onCreated }) {
  const [repo, setRepo] = useState(repos[0] || "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [head, setHead] = useState("");
  const [base, setBase] = useState("main");
  const [branches, setBranches] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (type === "pr" && repo) {
      window.ghApi.listBranches(repo).then((b) => {
        setBranches(b);
        if (b.length > 0 && !head) setHead(b[0].name);
      }).catch(() => {});
    }
  }, [repo, type]);

  const handleSubmit = async () => {
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      if (type === "issue") {
        await window.ghApi.createIssue(repo, title.trim(), body.trim());
      } else {
        await window.ghApi.createPR(repo, title.trim(), body.trim(), head, base);
      }
      onClose();
      // Small delay so GitHub API has time to index the new item
      setTimeout(() => onCreated(), 500);
    } catch (e) {
      setError(e.message);
    }
    setSubmitting(false);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 440, background: "rgba(20,20,20,0.95)",
          border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12,
          padding: "20px", fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 15, color: "rgba(255,255,255,0.85)", fontWeight: 600 }}>
            New {type === "pr" ? "Pull Request" : "Issue"}
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.4)", padding: 2 }}>
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        {/* Repo selector */}
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: ".04em" }}>REPO</label>
          <select
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            style={selectStyle}
          >
            {repos.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {/* Branch selectors for PR */}
        {type === "pr" && (
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: ".04em" }}>HEAD</label>
              <select
                value={head}
                onChange={(e) => setHead(e.target.value)}
                style={selectStyle}
              >
                {branches.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: ".04em" }}>BASE</label>
              <select
                value={base}
                onChange={(e) => setBase(e.target.value)}
                style={selectStyle}
              >
                {branches.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* Title */}
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: ".04em" }}>TITLE</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={type === "pr" ? "PR title..." : "Issue title..."}
            style={{ ...inputStyle, marginTop: 4 }}
            autoFocus
          />
        </div>

        {/* Body */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: ".04em" }}>DESCRIPTION</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Optional description..."
            rows={4}
            style={{ ...inputStyle, marginTop: 4, resize: "vertical", minHeight: 60 }}
          />
        </div>

        {error && (
          <div style={{ fontSize: 12, color: "rgba(248,81,73,0.8)", marginBottom: 10 }}>{error}</div>
        )}

        {/* Submit */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} style={{
            background: "none", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 6, padding: "6px 14px", cursor: "pointer",
            color: "rgba(255,255,255,0.4)", fontSize: 12,
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: ".04em",
          }}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim() || submitting}
            style={{
              background: title.trim() ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6,
              padding: "6px 14px", cursor: title.trim() ? "pointer" : "default",
              color: title.trim() ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.3)",
              fontSize: 12, fontFamily: "'JetBrains Mono', monospace", letterSpacing: ".04em",
              transition: "all .15s",
            }}
          >
            {submitting ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
