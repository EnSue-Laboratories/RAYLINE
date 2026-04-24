import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowLeft, GitBranch, Plus, Check, CheckCircle2, GitMerge, RotateCcw, Copy } from "lucide-react";
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
  background: "var(--control-bg-hover)",
  border: "1px solid var(--control-border)",
  borderRadius: 6,
  padding: "4px 10px",
  cursor: "pointer",
  color: "var(--text-tertiary)",
  fontSize: 11,
  fontFamily: "'JetBrains Mono', monospace",
  letterSpacing: ".04em",
  transition: "all .15s",
};

const markdownCodeComponents = {
  code: ({ node, children, ...props }) => {
    const isBlock = node?.position?.start?.line !== node?.position?.end?.line
      || String(children).includes("\n");

    if (!isBlock) {
      return (
        <code
          style={{
            background: "var(--control-bg-hover)",
            padding: "1px 5px",
            borderRadius: 4,
            fontSize: 12,
            fontFamily: "'JetBrains Mono', monospace",
          }}
          {...props}
        >
          {children}
        </code>
      );
    }

    return (
      <code
        style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre
      style={{
        background: "var(--control-bg)",
        border: "1px solid var(--control-border-soft)",
        borderRadius: 6,
        padding: 12,
        overflowX: "auto",
        margin: "8px 0",
      }}
    >
      {children}
    </pre>
  ),
};

export default function ItemDetail({ repo, number, type, onBack }) {
  const [item, setItem] = useState(null);
  const [comments, setComments] = useState([]);
  const [collaborators, setCollaborators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAssignMenu, setShowAssignMenu] = useState(false);
  const [copiedCheckout, setCopiedCheckout] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const assignRef = useRef(null);

  useEffect(() => {
    if (!showAssignMenu) return;
    const handleClick = (e) => {
      if (assignRef.current && !assignRef.current.contains(e.target)) {
        setShowAssignMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showAssignMenu]);

  const fetchAll = useCallback(() => {
    const fetchItem =
      type === "pr"
        ? window.ghApi.getPR(repo, number)
        : window.ghApi.getIssue(repo, number);
    Promise.resolve()
      .then(() => {
        setLoading(true);
        setError(null);
        return Promise.all([
          fetchItem,
          window.ghApi.listComments(repo, number),
          window.ghApi.listCollaborators(repo),
        ]);
      })
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
  }, [repo, number, type]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(async () => {
      try {
        const fetchItem = type === "pr"
          ? window.ghApi.getPR(repo, number)
          : window.ghApi.getIssue(repo, number);
        const [itemData, commentsData] = await Promise.all([
          fetchItem,
          window.ghApi.listComments(repo, number),
        ]);
        setItem(itemData);
        setComments(commentsData);
      } catch { /* ignore polling errors */ }
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchAll, repo, number, type]);

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
    } catch { /* ignore close errors */ }
    setActionLoading(false);
  };

  const handleReopen = async () => {
    setActionLoading(true);
    try {
      const updated = await window.ghApi.reopenIssue(repo, number);
      setItem(updated);
    } catch { /* ignore reopen errors */ }
    setActionLoading(false);
  };

  const handleMerge = async () => {
    setActionLoading(true);
    try {
      await window.ghApi.mergePR(repo, number);
      const updated = await window.ghApi.getPR(repo, number);
      setItem(updated);
    } catch { /* ignore merge errors */ }
    setActionLoading(false);
  };

  const refreshComments = async () => {
    try {
      const updated = await window.ghApi.listComments(repo, number);
      setComments(updated);
    } catch { /* ignore refresh errors */ }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)", fontSize: 13, fontFamily: "system-ui, sans-serif" }}>
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, fontFamily: "system-ui, sans-serif" }}>
        <div style={{ color: "var(--danger-soft-text)", fontSize: 13 }}>{error}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={fetchAll} style={smallBtnStyle}>Retry</button>
          <button onClick={onBack} style={{ ...smallBtnStyle, background: "none" }}>Back</button>
        </div>
      </div>
    );
  }

  const stateBadge = () => {
    if (type === "pr" && item.merged_at) {
      return { label: "MERGED", bg: "var(--badge-merged-bg)", color: "var(--badge-merged-text)" };
    }
    if (item.state === "closed") {
      return { label: "CLOSED", bg: "var(--badge-closed-bg)", color: "var(--badge-closed-text)" };
    }
    return { label: "OPEN", bg: "var(--badge-open-bg)", color: "var(--badge-open-text)" };
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
          color: "var(--text-tertiary)", fontSize: 13,
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
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: "var(--text-muted)" }}>
              #{number}
            </span>
            <a
              href={ghUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 18, fontWeight: 600, color: "var(--text-primary)",
                fontFamily: "system-ui, sans-serif", textDecoration: "none",
                transition: "color .15s", cursor: "pointer",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(140,180,255,0.95)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
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
          <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "system-ui, sans-serif", marginTop: 4 }}>
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
          fontSize: 12, color: "var(--text-muted)", fontFamily: "system-ui, sans-serif",
          position: "relative",
        }}>
          <span style={{ fontSize: 11, color: "var(--text-faint)" }}>Assignees:</span>
          {item.assignees && item.assignees.length > 0 ? (
            item.assignees.map((a) => (
              <div key={a.login} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <img src={a.avatar_url} alt={a.login} style={{ width: 20, height: 20, borderRadius: 10 }} />
                <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>{a.login}</span>
              </div>
            ))
          ) : (
            <span style={{ fontStyle: "italic", fontSize: 11 }}>None</span>
          )}
          <div ref={assignRef} style={{ position: "relative" }}>
          <button
            onClick={() => setShowAssignMenu((v) => !v)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 20, height: 20, borderRadius: 10,
              background: "none", border: "none",
              cursor: "pointer", color: "var(--text-muted)", padding: 0,
              transition: "all .15s",
            }}
          >
            <Plus size={11} strokeWidth={2} />
          </button>

          {showAssignMenu && (
            <div style={{
              position: "absolute", top: "100%", left: 0, marginTop: 4,
              background: "var(--pane-background)", border: "1px solid var(--pane-border)",
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
                      cursor: "pointer", color: "var(--text-secondary)", fontSize: 12,
                      fontFamily: "system-ui, sans-serif", textAlign: "left",
                    }}
                  >
                    <img src={c.avatar_url} alt={c.login} style={{ width: 18, height: 18, borderRadius: 9 }} />
                    <span style={{ flex: 1 }}>{c.login}</span>
                    {isAssigned && <Check size={12} strokeWidth={2} style={{ color: "var(--success-soft-text)" }} />}
                  </button>
                );
              })}
            </div>
          )}
          </div>
        </div>

        {/* Copy checkout command */}
        {type === "pr" && !isMerged && (
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button
              onClick={() => {
                const cmd = `gh pr checkout ${number} -R ${repo}`;
                navigator.clipboard.writeText(cmd);
                setCopiedCheckout(true);
                setTimeout(() => setCopiedCheckout(false), 1500);
              }}
              style={smallBtnStyle}
            >
              {copiedCheckout
                ? <><Check size={11} strokeWidth={1.5} /> Copied!</>
                : <><Copy size={11} strokeWidth={1.5} /> Checkout</>
              }
            </button>
          </div>
        )}

        {/* Body — suppress list-style bullets before titles */}
        <div
          style={{
            marginTop: 16, paddingTop: 16,
            borderTop: "1px solid var(--pane-border)",
            color: "var(--text-secondary)", fontSize: 13,
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
              h1: ({ children }) => <h1 style={{ fontSize: 20, fontWeight: 600, margin: "16px 0 8px", color: "var(--text-primary)" }}>{children}</h1>,
              h2: ({ children }) => <h2 style={{ fontSize: 17, fontWeight: 600, margin: "14px 0 6px", color: "var(--text-primary)" }}>{children}</h2>,
              h3: ({ children }) => <h3 style={{ fontSize: 15, fontWeight: 600, margin: "12px 0 4px", color: "var(--text-primary)" }}>{children}</h3>,
              ...markdownCodeComponents,
            }}
          >
            {item.body || ""}
          </ReactMarkdown>
        </div>

        {/* Comments */}
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: ".04em", marginBottom: 12 }}>
            {comments.length} COMMENT{comments.length !== 1 ? "S" : ""}
          </div>
          {comments.map((comment) => (
            <div key={comment.id} style={{ borderTop: "1px solid var(--row-separator)", paddingTop: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "system-ui, sans-serif", marginBottom: 6 }}>
                <span style={{ color: "var(--text-secondary)" }}>{comment.user?.login}</span> &middot; {timeAgo(comment.created_at)}
              </div>
              <div style={{ color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.6, fontFamily: "system-ui, sans-serif" }}>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    ul: ({ children }) => <ul style={{ listStyle: "disc", paddingLeft: 20, margin: "6px 0" }}>{children}</ul>,
                    ol: ({ children }) => <ol style={{ paddingLeft: 20, margin: "6px 0" }}>{children}</ol>,
                    a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "rgba(140,180,255,0.9)", textDecoration: "none" }}>{children}</a>,
                    p: ({ children }) => <p style={{ margin: "6px 0" }}>{children}</p>,
                    ...markdownCodeComponents,
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
              <button onClick={handleMerge} disabled={actionLoading} style={{ ...smallBtnStyle, color: "var(--text-tertiary)" }}>
                <GitMerge size={11} strokeWidth={1.5} />
                {actionLoading ? "Merging..." : "Merge"}
              </button>
            )}
            {/* Close (issues only) */}
            {type === "issue" && isOpen && (
              <button onClick={handleClose} disabled={actionLoading} style={{ ...smallBtnStyle, color: "var(--text-tertiary)" }}>
                <CheckCircle2 size={11} strokeWidth={1.5} />
                {actionLoading ? "Closing..." : "Close"}
              </button>
            )}
            {/* Reopen */}
            {!isOpen && !isMerged && (
              <button onClick={handleReopen} disabled={actionLoading} style={{ ...smallBtnStyle, color: "var(--text-tertiary)" }}>
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
