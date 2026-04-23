import React, { useState, useEffect } from "react";
import { Circle, CheckCircle2, Copy, Check, GitPullRequest } from "lucide-react";
import { applyPaneInteractionStyle, getPaneInteractionStyle } from "../utils/paneSurface";
import HoverIconButton from "../components/HoverIconButton";
import { createTranslator } from "../i18n";

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

export default function IssueList({ repos, stateFilter, repoFilter, onSelectItem, refreshSignal, freshItem, locale = "en-US" }) {
  const t = createTranslator(locale);
  const [issues, setIssues] = useState([]);
  const [initialLoad, setInitialLoad] = useState(true);
  const [error, setError] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [linkedPRs, setLinkedPRs] = useState({});

  async function fetchIssues({ silent = false } = {}) {
    if (!silent) setInitialLoad(true);
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
      setIssues((prev) => {
        // Preserve any optimistic items that the server hasn't returned yet
        const mergedKeys = new Set(merged.map((i) => `${i._repo}-${i.number}`));
        const stillPending = prev.filter(
          (i) => i.__optimistic && !mergedKeys.has(`${i._repo}-${i.number}`)
        );
        return [...stillPending, ...merged].sort(
          (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );
      });
    } catch (err) {
      setError(err.message || "Failed to load issues");
    } finally {
      setInitialLoad(false);
    }
  }

  useEffect(() => {
    if (repos.length === 0) {
      setIssues([]);
      setInitialLoad(false);
      return;
    }
    fetchIssues({ silent: !initialLoad });
    const interval = setInterval(() => {
      fetchIssues({ silent: true }).catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repos, stateFilter, repoFilter, refreshSignal]);

  useEffect(() => {
    if (!freshItem || freshItem.number == null) return;
    const itemState = freshItem.state || "open";
    if (itemState !== stateFilter) return;
    if (repoFilter && freshItem._repo !== repoFilter) return;
    if (!repos.includes(freshItem._repo)) return;
    setIssues((prev) => {
      const key = `${freshItem._repo}-${freshItem.number}`;
      if (prev.some((i) => `${i._repo}-${i.number}` === key)) return prev;
      return [{ ...freshItem, __optimistic: true }, ...prev];
    });
  }, [freshItem, stateFilter, repoFilter, repos]);

  useEffect(() => {
    if (issues.length === 0) return;
    let cancelled = false;
    async function fetchLinkedPRs() {
      const results = await Promise.allSettled(
        issues.map(async (item) => {
          const key = `${item._repo}/${item.number}`;
          const prs = await window.ghApi.getLinkedPRs(item._repo, item.number);
          return { key, prs };
        })
      );
      if (cancelled) return;
      const map = {};
      for (const r of results) {
        if (r.status === "fulfilled" && r.value.prs.length > 0) {
          map[r.value.key] = r.value.prs;
        }
      }
      setLinkedPRs(map);
    }
    fetchLinkedPRs();
    return () => { cancelled = true; };
  }, [issues]);

  if (initialLoad && issues.length === 0) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: 40, color: "var(--text-muted)", fontFamily: "system-ui", fontSize: 13 }}>
        {t("pm.loadingIssues")}
      </div>
    );
  }

  if (error && issues.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: 40, gap: 12 }}>
        <span style={{ color: "var(--danger-soft-text)", fontFamily: "system-ui", fontSize: 13 }}>{error}</span>
        <button
          onClick={() => fetchIssues()}
          style={{ background: "var(--control-bg)", border: "1px solid var(--control-border)", borderRadius: 6, color: "var(--text-secondary)", padding: "6px 16px", cursor: "pointer", fontFamily: "system-ui", fontSize: 12 }}
        >
          {t("pm.retry")}
        </button>
      </div>
    );
  }

  if (issues.length === 0) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: 40, color: "var(--text-muted)", fontFamily: "system-ui", fontSize: 13 }}>
        {t("pm.noIssuesFound")}
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
              borderBottom: "1px solid var(--control-border-soft)",
              transition: "background .15s, box-shadow .15s, backdrop-filter .15s",
              ...getPaneInteractionStyle("idle"),
            }}
            onMouseEnter={(e) => { applyPaneInteractionStyle(e.currentTarget, "hover"); const b = e.currentTarget.querySelector(".copy-btn"); if (b) b.style.opacity = "1"; }}
            onMouseLeave={(e) => { applyPaneInteractionStyle(e.currentTarget, "idle"); const b = e.currentTarget.querySelector(".copy-btn"); if (b) b.style.opacity = "0"; }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {isOpen ? (
                <Circle size={12} color="rgba(63,185,80,0.7)" />
              ) : (
                <CheckCircle2 size={12} color="rgba(130,80,223,0.7)" />
              )}
              <span style={{ color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
                #{item.number}
              </span>
              <span style={{ color: "var(--text-primary)", fontFamily: "system-ui", fontSize: 13, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.title}
              </span>
              <HoverIconButton
                className="copy-btn"
                tooltip={copiedId === `${item._repo}-${item.number}` ? t("pm.copied") : t("pm.copyIssueSummary")}
                onClick={(e) => {
                  e.stopPropagation();
                  const url = `https://github.com/${item._repo}/issues/${item.number}`;
                  navigator.clipboard.writeText(`#${item.number} ${item.title} ${url}`);
                  const id = `${item._repo}-${item.number}`;
                  setCopiedId(id);
                  setTimeout(() => setCopiedId((v) => v === id ? null : v), 1500);
                }}
                baseColor={copiedId === `${item._repo}-${item.number}` ? "var(--success-soft-text)" : "var(--text-muted)"}
                hoverColor={copiedId === `${item._repo}-${item.number}` ? "var(--success-soft-text)" : "var(--text-primary)"}
                style={{ opacity: copiedId === `${item._repo}-${item.number}` ? 1 : 0 }}
              >
                {copiedId === `${item._repo}-${item.number}` ? <Check size={12} strokeWidth={2} /> : <Copy size={12} strokeWidth={1.5} />}
              </HoverIconButton>
              <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                <span
                  style={{ width: 25, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}
                  title={linkedPRs[`${item._repo}/${item.number}`]
                    ? t("pm.linkedPrTitle", { count: linkedPRs[`${item._repo}/${item.number}`].length, suffix: linkedPRs[`${item._repo}/${item.number}`].length > 1 ? "s" : "" })
                    : undefined}
                >
                  {linkedPRs[`${item._repo}/${item.number}`] && (
                    <GitPullRequest size={12} strokeWidth={1.5} />
                  )}
                </span>
                <span style={{ color: "var(--text-faint)", fontFamily: "system-ui", fontSize: 11 }}>
                  {repoShort}
                </span>
              </div>
            </div>
            <div style={{ marginLeft: 26, color: "var(--text-muted)", fontFamily: "system-ui", fontSize: 12, marginTop: 2 }}>
              {t("pm.byUpdated", { user: item.user?.login || "unknown", time: timeAgo(item.updated_at) })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
