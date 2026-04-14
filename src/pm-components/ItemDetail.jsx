import { useState, useEffect } from "react";
import { ArrowLeft, GitBranch, Plus, Check, CheckCircle2, GitMerge, RotateCcw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import CommentBox from "./CommentBox";

function timeAgo(dateStr) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

const smallBtnStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 6,
  padding: "4px 10px",
  cursor: "pointer",
  color: "rgba(255,255,255,0.55)",
  fontSize: 11,
  fontFamily: "'JetBrains Mono', monospace",
  letterSpacing: ".04em",
  transition: "all .15s",
};

export default function ItemDetail({ repo, number, type, onBack }) {
  const [item, setItem] = useState(null);
  const [comments, setComments] = useState([]);
  const [collaborators, setCollaborators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAssignMenu, setShowAssignMenu] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchAll = () => {
    setLoading(true);
    setError(null);
    const fetchItem =
      type === "pr"
        ? window.ghApi.getPR(repo, number)
        : window.ghApi.getIssue(repo, number);
    Promise.all([
      fetchItem,
      window.ghApi.listComments(repo, number),
      window.ghApi.listCollaborators(repo),
    ])
      .then(([itemData, commentsData, collabs]) => {
        setItem(itemData);
        setComments(commentsData);
        setCollaborators(collabs);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchAll();
  }, [repo, number, type]);

  const handleToggleAssign = async (login) => {
    const isAssigned = item.assignees.some((a) => a.login === login);
    if (isAssigned) {
      await window.ghApi.unassignIssue(repo, number, [login]);
    } else {
      await window.ghApi.assignIssue(repo, number, [login]);
    }
    const updatedItem =
      type === "pr"
        ? await window.ghApi.getPR(repo, number)
        : await window.ghApi.getIssue(repo, number);
    setItem(updatedItem);
  };

  const handleClose = async () => {
    setActionLoading(true);
    try {
      const updated = await window.ghApi.closeIssue(repo, number);
      setItem(updated);
    } catch {}
    setActionLoading(false);
  };

  const handleReopen = async () => {
    setActionLoading(true);
    try {
      const updated = await window.ghApi.reopenIssue(repo, number);
      setItem(updated);
    } catch {}
    setActionLoading(false);
  };

  const handleMerge = async () => {
    setActionLoading(true);
    try {
      await window.ghApi.mergePR(repo, number);
      const updated = await window.ghApi.getPR(repo, number);
      setItem(updated);
    } catch {}
    setActionLoading(false);
  };

  const refreshComments = async () => {
    try {
      const updated = await window.ghApi.listComments(repo, number);
      setComments(updated);
    } catch {}
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "rgba(255,255,255,0.4)", fontSize: 13, fontFamily: "system-ui, sans-serif" }}>
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, fontFamily: "system-ui, sans-serif" }}>
        <div style={{ color: "rgba(255,100,100,0.8)", fontSize: 13 }}>{error}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={fetchAll} style={smallBtnStyle}>Retry</button>
          <button onClick={onBack} style={{ ...smallBtnStyle, background: "none" }}>Back</button>
        </div>
      </div>
    );
  }

  const stateBadge = () => {
    if (type === "pr" && item.merged_at) {
      return { label: "MERGED", bg: "rgba(160,100,255,0.2)", color: "rgba(190,140,255,0.9)" };
    }
    if (item.state === "closed") {
      return { label: "CLOSED", bg: "rgba(160,100,255,0.2)", color: "rgba(190,140,255,0.9)" };
    }
    return { label: "OPEN", bg: "rgba(80,200,120,0.15)", color: "rgba(120,230,150,0.9)" };
  };

  const badge = stateBadge();
  const ghUrl = `https://github.com/${repo}/${type === "pr" ? "pull" : "issues"}/${number}`;
  const isOpen = item.state === "open";
  const isMerged = type === "pr" && !!item.merged_at;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "auto" }}>
      {/* Back button */}
      <button
        onClick={onBack}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "none", border: "none", cursor: "pointer",
          color: "rgba(255,255,255,0.5)", fontSize: 13,
          fontFamily: "system-ui, sans-serif", padding: "16px 20px",
          transition: "color .15s",
        }}
      >
        <ArrowLeft size={14} strokeWidth={1.5} /> Back
      </button>

      <div style={{ padding: "0 20px 20px" }}>
        {/* Title — clickable link to GitHub */}
        <div style={{ marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: "rgba(255,255,255,0.35)" }}>
              #{number}
            </span>
            <a
              href={ghUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 18, fontWeight: 600, color: "rgba(255,255,255,0.95)",
                fontFamily: "system-ui, sans-serif", textDecoration: "none",
                transition: "color .15s", cursor: "pointer",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(140,180,255,0.95)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.95)"; }}
            >
              {item.title}
            </a>
            <span style={{
              fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: ".06em", padding: "2px 8px", borderRadius: 10,
              background: badge.bg, color: badge.color,
            }}>
              {badge.label}
            </span>
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", fontFamily: "system-ui, sans-serif", marginTop: 4 }}>
            {repo} &middot; by {item.user?.login} &middot; opened {timeAgo(item.created_at)}
          </div>
        </div>

        {/* Labels */}
        {item.labels && item.labels.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            {item.labels.map((label) => {
              const hex = `#${label.color}`;
              return (
                <span key={label.id || label.name} style={{
                  fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: ".03em", padding: "2px 8px", borderRadius: 10,
                  background: `${hex}33`, color: hex, border: `1px solid ${hex}44`,
                }}>
                  {label.name}
                </span>
              );
            })}
          </div>
        )}

        {/* Assignees — compact with + button */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8, marginTop: 12,
          fontSize: 12, color: "rgba(255,255,255,0.4)", fontFamily: "system-ui, sans-serif",
          position: "relative",
        }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Assignees:</span>
          {item.assignees && item.assignees.length > 0 ? (
            item.assignees.map((a) => (
              <div key={a.login} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <img src={a.avatar_url} alt={a.login} style={{ width: 20, height: 20, borderRadius: 10 }} />
                <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>{a.login}</span>
              </div>
            ))
          ) : (
            <span style={{ fontStyle: "italic", fontSize: 11 }}>None</span>
          )}
          <button
            onClick={() => setShowAssignMenu((v) => !v)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 20, height: 20, borderRadius: 10,
              background: "none", border: "none",
              cursor: "pointer", color: "rgba(255,255,255,0.35)", padding: 0,
              transition: "all .15s",
            }}
          >
            <Plus size={11} strokeWidth={2} />
          </button>

          {showAssignMenu && (
            <div style={{
              position: "absolute", top: "100%", left: 0, marginTop: 4,
              background: "rgba(15,15,15,0.95)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8, padding: "4px 0", minWidth: 180, zIndex: 100,
              maxHeight: 220, overflowY: "auto", backdropFilter: "blur(20px)",
            }}>
              {collaborators.map((c) => {
                const isAssigned = item.assignees?.some((a) => a.login === c.login);
                return (
                  <button
                    key={c.login} onClick={() => handleToggleAssign(c.login)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, width: "100%",
                      background: "none", border: "none", padding: "6px 12px",
                      cursor: "pointer", color: "rgba(255,255,255,0.7)", fontSize: 12,
                      fontFamily: "system-ui, sans-serif", textAlign: "left",
                    }}
                  >
                    <img src={c.avatar_url} alt={c.login} style={{ width: 18, height: 18, borderRadius: 9 }} />
                    <span style={{ flex: 1 }}>{c.login}</span>
                    {isAssigned && <Check size={12} strokeWidth={2} style={{ color: "rgba(120,230,150,0.8)" }} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Action buttons row — only checkout stays here */}
        {type === "pr" && !isMerged && (
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button
              onClick={async () => {
                setCheckingOut(true);
                try { await window.ghApi.checkoutPR(repo, number); } catch {}
                setCheckingOut(false);
              }}
              style={smallBtnStyle}
            >
              <GitBranch size={11} strokeWidth={1.5} />
              {checkingOut ? "Checking out..." : "Checkout"}
            </button>
          </div>
        )}

        {/* Body — suppress list-style bullets before titles */}
        <div
          style={{
            marginTop: 16, paddingTop: 16,
            borderTop: "1px solid rgba(255,255,255,0.06)",
            color: "rgba(255,255,255,0.75)", fontSize: 13,
            lineHeight: 1.7, fontFamily: "system-ui, sans-serif",
          }}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              ul: ({ children }) => <ul style={{ listStyle: "disc", paddingLeft: 20, margin: "8px 0" }}>{children}</ul>,
              ol: ({ children }) => <ol style={{ paddingLeft: 20, margin: "8px 0" }}>{children}</ol>,
              li: ({ children }) => <li style={{ marginBottom: 4 }}>{children}</li>,
              a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "rgba(140,180,255,0.9)", textDecoration: "none" }}>{children}</a>,
              p: ({ children }) => <p style={{ margin: "8px 0" }}>{children}</p>,
              h1: ({ children }) => <h1 style={{ fontSize: 20, fontWeight: 600, margin: "16px 0 8px", color: "rgba(255,255,255,0.9)" }}>{children}</h1>,
              h2: ({ children }) => <h2 style={{ fontSize: 17, fontWeight: 600, margin: "14px 0 6px", color: "rgba(255,255,255,0.85)" }}>{children}</h2>,
              h3: ({ children }) => <h3 style={{ fontSize: 15, fontWeight: 600, margin: "12px 0 4px", color: "rgba(255,255,255,0.85)" }}>{children}</h3>,
              code: ({ inline, children }) => inline
                ? <code style={{ background: "rgba(255,255,255,0.06)", padding: "1px 5px", borderRadius: 4, fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>{children}</code>
                : <pre style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 6, padding: 12, overflowX: "auto", margin: "8px 0" }}><code style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>{children}</code></pre>,
            }}
          >
            {item.body || ""}
          </ReactMarkdown>
        </div>

        {/* Comments */}
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: ".04em", marginBottom: 12 }}>
            {comments.length} COMMENT{comments.length !== 1 ? "S" : ""}
          </div>
          {comments.map((comment) => (
            <div key={comment.id} style={{ borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", fontFamily: "system-ui, sans-serif", marginBottom: 6 }}>
                <span style={{ color: "rgba(255,255,255,0.6)" }}>{comment.user?.login}</span> &middot; {timeAgo(comment.created_at)}
              </div>
              <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, lineHeight: 1.6, fontFamily: "system-ui, sans-serif" }}>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    ul: ({ children }) => <ul style={{ listStyle: "disc", paddingLeft: 20, margin: "6px 0" }}>{children}</ul>,
                    ol: ({ children }) => <ol style={{ paddingLeft: 20, margin: "6px 0" }}>{children}</ol>,
                    a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "rgba(140,180,255,0.9)", textDecoration: "none" }}>{children}</a>,
                    p: ({ children }) => <p style={{ margin: "6px 0" }}>{children}</p>,
                  }}
                >
                  {comment.body || ""}
                </ReactMarkdown>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Comment box with actions */}
      <CommentBox
        repo={repo}
        number={number}
        onCommentAdded={refreshComments}
        actions={
          <>
            {/* Merge (PR only, open) */}
            {type === "pr" && isOpen && (
              <button onClick={handleMerge} disabled={actionLoading} style={{ ...smallBtnStyle, color: "rgba(255,255,255,0.5)" }}>
                <GitMerge size={11} strokeWidth={1.5} color="rgba(160,120,255,0.8)" />
                {actionLoading ? "Merging..." : "Merge"}
              </button>
            )}
            {/* Close (issues only) */}
            {type === "issue" && isOpen && (
              <button onClick={handleClose} disabled={actionLoading} style={{ ...smallBtnStyle, color: "rgba(255,255,255,0.5)" }}>
                <CheckCircle2 size={11} strokeWidth={1.5} />
                {actionLoading ? "Closing..." : "Close"}
              </button>
            )}
            {/* Reopen */}
            {!isOpen && !isMerged && (
              <button onClick={handleReopen} disabled={actionLoading} style={{ ...smallBtnStyle, color: "rgba(255,255,255,0.5)" }}>
                <RotateCcw size={11} strokeWidth={1.5} />
                {actionLoading ? "Reopening..." : "Reopen"}
              </button>
            )}
          </>
        }
      />
    </div>
  );
}
