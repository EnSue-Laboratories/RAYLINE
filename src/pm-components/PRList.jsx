import React, { useState, useEffect } from "react";
import { GitPullRequest, GitMerge, GitPullRequestClosed } from "lucide-react";

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

export default function PRList({ repos, stateFilter, repoFilter, onSelectItem }) {
  const [prs, setPrs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function fetchPRs() {
    setLoading(true);
    setError(null);
    try {
      const targetRepos = repoFilter ? [repoFilter] : repos;
      const results = await Promise.all(
        targetRepos.map(async (repo) => {
          const items = await window.ghApi.listPRs(repo, stateFilter);
          return items.map((item) => ({ ...item, _repo: repo }));
        })
      );
      const merged = results.flat().sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
      setPrs(merged);
    } catch (err) {
      setError(err.message || "Failed to load pull requests");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (repos.length > 0) fetchPRs();
    else {
      setPrs([]);
      setLoading(false);
    }
  }, [repos, stateFilter, repoFilter]);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: 40, color: "rgba(255,255,255,0.4)", fontFamily: "system-ui", fontSize: 13 }}>
        Loading pull requests...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: 40, gap: 12 }}>
        <span style={{ color: "rgba(255,100,100,0.7)", fontFamily: "system-ui", fontSize: 13 }}>{error}</span>
        <button
          onClick={fetchPRs}
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "rgba(255,255,255,0.5)", padding: "6px 16px", cursor: "pointer", fontFamily: "system-ui", fontSize: 12 }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (prs.length === 0) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: 40, color: "rgba(255,255,255,0.3)", fontFamily: "system-ui", fontSize: 13 }}>
        No pull requests found
      </div>
    );
  }

  function getIcon(item) {
    if (item.state === "open") {
      return <GitPullRequest size={12} color="rgba(63,185,80,0.7)" />;
    }
    if (item.merged_at) {
      return <GitMerge size={12} color="rgba(130,80,223,0.7)" />;
    }
    return <GitPullRequestClosed size={12} color="rgba(248,81,73,0.7)" />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {prs.map((item) => {
        const repoShort = item._repo.split("/").pop();
        return (
          <div
            key={`${item._repo}-${item.number}`}
            onClick={() => onSelectItem({ repo: item._repo, number: item.number, type: "pr" })}
            style={{
              display: "flex",
              flexDirection: "column",
              padding: "10px 16px",
              cursor: "pointer",
              borderBottom: "1px solid rgba(255,255,255,0.03)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {getIcon(item)}
              <span style={{ color: "rgba(255,255,255,0.35)", fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
                #{item.number}
              </span>
              <span style={{ color: "rgba(255,255,255,0.8)", fontFamily: "system-ui", fontSize: 13, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.title}
              </span>
              {item.draft && (
                <span style={{
                  color: "rgba(255,255,255,0.35)",
                  fontFamily: "system-ui",
                  fontSize: 10,
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  flexShrink: 0,
                }}>
                  Draft
                </span>
              )}
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
