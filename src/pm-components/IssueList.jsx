import React, { useState, useEffect } from "react";
import { Circle, CheckCircle2, Copy, Check } from "lucide-react";

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
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export default function IssueList({ repos, stateFilter, repoFilter, onSelectItem }) {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  async function fetchIssues() {
    setLoading(true);
    setError(null);
    try {
      const targetRepos = repoFilter ? [repoFilter] : repos;
      const results = await Promise.all(
        targetRepos.map(async (repo) => {
          const items = await window.ghApi.listIssues(repo, stateFilter);
          return items.map((item) => ({ ...item, _repo: repo }));
        })
      );
      const merged = results.flat().sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
      setIssues(merged);
    } catch (err) {
      setError(err.message || "Failed to load issues");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (repos.length > 0) fetchIssues();
    else {
      setIssues([]);
      setLoading(false);
    }
    // Auto-refresh every 30s (silent, no loading spinner)
    if (repos.length > 0) {
      const interval = setInterval(async () => {
        try {
          const targetRepos = repoFilter ? [repoFilter] : repos;
          const results = await Promise.all(
            targetRepos.map(async (repo) => {
              const items = await window.ghApi.listIssues(repo, stateFilter);
              return items.map((item) => ({ ...item, _repo: repo }));
            })
          );
          const merged = results.flat().sort(
            (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
          );
          setIssues(merged);
        } catch {}
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [repos, stateFilter, repoFilter]);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: 40, color: "rgba(255,255,255,0.4)", fontFamily: "system-ui", fontSize: 13 }}>
        Loading issues...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: 40, gap: 12 }}>
        <span style={{ color: "rgba(255,100,100,0.7)", fontFamily: "system-ui", fontSize: 13 }}>{error}</span>
        <button
          onClick={fetchIssues}
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "rgba(255,255,255,0.5)", padding: "6px 16px", cursor: "pointer", fontFamily: "system-ui", fontSize: 12 }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (issues.length === 0) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: 40, color: "rgba(255,255,255,0.3)", fontFamily: "system-ui", fontSize: 13 }}>
        No issues found
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {issues.map((item) => {
        const isOpen = item.state === "open";
        const repoShort = item._repo.split("/").pop();
        return (
          <div
            key={`${item._repo}-${item.number}`}
            onClick={() => onSelectItem({ repo: item._repo, number: item.number, type: "issue" })}
            style={{
              display: "flex",
              flexDirection: "column",
              padding: "10px 16px",
              cursor: "pointer",
              borderBottom: "1px solid rgba(255,255,255,0.03)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; const b = e.currentTarget.querySelector(".copy-btn"); if (b) b.style.opacity = "1"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; const b = e.currentTarget.querySelector(".copy-btn"); if (b) b.style.opacity = "0"; }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {isOpen ? (
                <Circle size={12} color="rgba(63,185,80,0.7)" />
              ) : (
                <CheckCircle2 size={12} color="rgba(130,80,223,0.7)" />
              )}
              <span style={{ color: "rgba(255,255,255,0.35)", fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
                #{item.number}
              </span>
              <span style={{ color: "rgba(255,255,255,0.8)", fontFamily: "system-ui", fontSize: 13, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.title}
              </span>
              <button
                className="copy-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  const url = `https://github.com/${item._repo}/issues/${item.number}`;
                  navigator.clipboard.writeText(`#${item.number} ${item.title} ${url}`);
                  const id = `${item._repo}-${item.number}`;
                  setCopiedId(id);
                  setTimeout(() => setCopiedId((v) => v === id ? null : v), 1500);
                }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "none", border: "none", cursor: "pointer",
                  color: copiedId === `${item._repo}-${item.number}` ? "rgba(120,230,150,0.8)" : "rgba(255,255,255,0.2)",
                  padding: 2, flexShrink: 0,
                  opacity: copiedId === `${item._repo}-${item.number}` ? 1 : 0,
                  transition: "opacity .15s, color .15s",
                }}
              >
                {copiedId === `${item._repo}-${item.number}` ? <Check size={12} strokeWidth={2} /> : <Copy size={12} strokeWidth={1.5} />}
              </button>
              <span style={{ color: "rgba(255,255,255,0.25)", fontFamily: "system-ui", fontSize: 11, flexShrink: 0 }}>
                {repoShort}
              </span>
            </div>
            <div style={{ marginLeft: 26, color: "rgba(255,255,255,0.3)", fontFamily: "system-ui", fontSize: 12, marginTop: 2 }}>
              by {item.user?.login || "unknown"} · updated {timeAgo(item.updated_at)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
