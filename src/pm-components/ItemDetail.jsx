import React, { useState, useEffect } from "react";
import { ArrowLeft, GitBranch, UserPlus, Check } from "lucide-react";
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

export default function ItemDetail({ repo, number, type, onBack }) {
  const [item, setItem] = useState(null);
  const [comments, setComments] = useState([]);
  const [collaborators, setCollaborators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAssignMenu, setShowAssignMenu] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

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

  const refreshComments = async () => {
    try {
      const updated = await window.ghApi.listComments(repo, number);
      setComments(updated);
    } catch (e) {
      // silent
    }
  };

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "rgba(255,255,255,0.4)",
          fontSize: 13,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: 12,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ color: "rgba(255,100,100,0.8)", fontSize: 13 }}>
          {error}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={fetchAll}
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 6,
              padding: "6px 14px",
              cursor: "pointer",
              color: "rgba(255,255,255,0.7)",
              fontSize: 12,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            Retry
          </button>
          <button
            onClick={onBack}
            style={{
              background: "none",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 6,
              padding: "6px 14px",
              cursor: "pointer",
              color: "rgba(255,255,255,0.5)",
              fontSize: 12,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  const stateBadge = () => {
    if (type === "pr" && item.merged_at) {
      return { label: "Merged", bg: "rgba(160,100,255,0.2)", color: "rgba(190,140,255,0.9)" };
    }
    if (item.state === "closed") {
      return { label: "Closed", bg: "rgba(160,100,255,0.2)", color: "rgba(190,140,255,0.9)" };
    }
    return { label: "Open", bg: "rgba(80,200,120,0.15)", color: "rgba(120,230,150,0.9)" };
  };

  const badge = stateBadge();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "auto" }}>
      {/* Back button */}
      <button
        onClick={onBack}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "rgba(255,255,255,0.5)",
          fontSize: 13,
          fontFamily: "system-ui, sans-serif",
          padding: "16px 20px",
          transition: "color .15s",
        }}
      >
        <ArrowLeft size={16} strokeWidth={1.5} /> Back
      </button>

      <div style={{ padding: "0 20px 20px" }}>
        {/* Title section */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 6 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 14,
                  color: "rgba(255,255,255,0.35)",
                }}
              >
                #{number}
              </span>
              <span
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.95)",
                  fontFamily: "system-ui, sans-serif",
                }}
              >
                {item.title}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: ".04em",
                  padding: "2px 8px",
                  borderRadius: 10,
                  background: badge.bg,
                  color: badge.color,
                }}
              >
                {badge.label}
              </span>
            </div>
            <div
              style={{
                fontSize: 12,
                color: "rgba(255,255,255,0.35)",
                fontFamily: "system-ui, sans-serif",
                marginTop: 4,
              }}
            >
              {repo} &middot; by {item.user?.login} &middot; opened {timeAgo(item.created_at)}
            </div>
          </div>
        </div>

        {/* Labels */}
        {item.labels && item.labels.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
            {item.labels.map((label) => {
              const hex = `#${label.color}`;
              return (
                <span
                  key={label.id || label.name}
                  style={{
                    fontSize: 11,
                    fontFamily: "'JetBrains Mono', monospace",
                    letterSpacing: ".03em",
                    padding: "2px 8px",
                    borderRadius: 10,
                    background: `${hex}33`,
                    color: hex,
                    border: `1px solid ${hex}44`,
                  }}
                >
                  {label.name}
                </span>
              );
            })}
          </div>
        )}

        {/* Assignees */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 14,
            fontSize: 12,
            color: "rgba(255,255,255,0.4)",
            fontFamily: "system-ui, sans-serif",
            position: "relative",
          }}
        >
          <span>Assignees:</span>
          {item.assignees && item.assignees.length > 0 ? (
            item.assignees.map((a) => (
              <div
                key={a.login}
                style={{ display: "flex", alignItems: "center", gap: 4 }}
              >
                <img
                  src={a.avatar_url}
                  alt={a.login}
                  style={{ width: 24, height: 24, borderRadius: 12 }}
                />
                <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
                  {a.login}
                </span>
              </div>
            ))
          ) : (
            <span style={{ fontStyle: "italic" }}>None</span>
          )}
          <button
            onClick={() => setShowAssignMenu((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 6,
              padding: "3px 10px",
              cursor: "pointer",
              color: "rgba(255,255,255,0.5)",
              fontSize: 11,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            <UserPlus size={12} strokeWidth={1.5} /> Assign
          </button>

          {/* Assign dropdown */}
          {showAssignMenu && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 60,
                marginTop: 4,
                background: "#111",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                padding: "4px 0",
                minWidth: 180,
                zIndex: 100,
                maxHeight: 220,
                overflowY: "auto",
              }}
            >
              {collaborators.map((c) => {
                const isAssigned = item.assignees?.some(
                  (a) => a.login === c.login
                );
                return (
                  <button
                    key={c.login}
                    onClick={() => handleToggleAssign(c.login)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      width: "100%",
                      background: "none",
                      border: "none",
                      padding: "6px 12px",
                      cursor: "pointer",
                      color: "rgba(255,255,255,0.7)",
                      fontSize: 12,
                      fontFamily: "system-ui, sans-serif",
                      textAlign: "left",
                    }}
                  >
                    <img
                      src={c.avatar_url}
                      alt={c.login}
                      style={{ width: 20, height: 20, borderRadius: 10 }}
                    />
                    <span style={{ flex: 1 }}>{c.login}</span>
                    {isAssigned && (
                      <Check
                        size={14}
                        strokeWidth={2}
                        style={{ color: "rgba(120,230,150,0.8)" }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Checkout button (PR only) */}
        {type === "pr" && (
          <button
            onClick={async () => {
              setCheckingOut(true);
              try {
                await window.ghApi.checkoutPR(repo, number);
              } catch (e) {
                // silent
              }
              setCheckingOut(false);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 6,
              padding: "6px 14px",
              cursor: "pointer",
              color: "rgba(255,255,255,0.7)",
              fontSize: 12,
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: ".04em",
              transition: "all .15s",
              margin: "12px 0",
            }}
          >
            <GitBranch size={14} strokeWidth={1.5} />
            {checkingOut ? "Checking out..." : "Checkout"}
          </button>
        )}

        {/* Body */}
        <div
          style={{
            marginTop: 16,
            paddingTop: 16,
            borderTop: "1px solid rgba(255,255,255,0.06)",
            color: "rgba(255,255,255,0.75)",
            fontSize: 13,
            lineHeight: 1.7,
            fontFamily: "system-ui, sans-serif",
          }}
          className="item-detail-markdown"
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {item.body || ""}
          </ReactMarkdown>
        </div>

        {/* Comments */}
        <div style={{ marginTop: 24 }}>
          <div
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.35)",
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: ".04em",
              marginBottom: 12,
            }}
          >
            {comments.length} comment{comments.length !== 1 ? "s" : ""}
          </div>
          {comments.map((comment) => (
            <div
              key={comment.id}
              style={{
                borderTop: "1px solid rgba(255,255,255,0.04)",
                paddingTop: 12,
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,0.4)",
                  fontFamily: "system-ui, sans-serif",
                  marginBottom: 6,
                }}
              >
                <span style={{ color: "rgba(255,255,255,0.6)" }}>
                  {comment.user?.login}
                </span>{" "}
                &middot; {timeAgo(comment.created_at)}
              </div>
              <div
                style={{
                  color: "rgba(255,255,255,0.7)",
                  fontSize: 13,
                  lineHeight: 1.6,
                  fontFamily: "system-ui, sans-serif",
                }}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {comment.body || ""}
                </ReactMarkdown>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Comment box */}
      <CommentBox repo={repo} number={number} onCommentAdded={refreshComments} />
    </div>
  );
}
