import React, { useState, useEffect } from "react";
import { GitPullRequest, GitMerge, GitPullRequestClosed, Copy, Check, GitBranch } from "lucide-react";
import { applyPaneInteractionStyle, getPaneInteractionStyle } from "../utils/paneSurface";
import HoverIconButton from "../components/HoverIconButton";
import { createTranslator } from "../i18n";

function timeAgo(dateStr, t) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return t("pm.timeMinutesAgo", { count: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t("pm.timeHoursAgo", { count: hrs });
  const days = Math.floor(hrs / 24);
  if (days < 30) return t("pm.timeDaysAgo", { count: days });
  const months = Math.floor(days / 30);
  return t("pm.timeMonthsAgo", { count: months });
}

export default function PRList({ repos, stateFilter, repoFilter, onSelectItem, refreshSignal, freshItem, locale = "en-US" }) {
  const t = createTranslator(locale);
  const [prs, setPrs] = useState([]);
  const [initialLoad, setInitialLoad] = useState(true);
  const [error, setError] = useState(null);
  const [copiedAction, setCopiedAction] = useState(null);

  async function fetchPRs({ silent = false } = {}) {
    if (!silent) setInitialLoad(true);
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
      setPrs((prev) => {
        const mergedKeys = new Set(merged.map((i) => `${i._repo}-${i.number}`));
        const stillPending = prev.filter(
          (i) => i.__optimistic && !mergedKeys.has(`${i._repo}-${i.number}`)
        );
        return [...stillPending, ...merged].sort(
          (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );
      });
    } catch (err) {
      setError(err.message || t("pm.failedToLoadPullRequests"));
    } finally {
      setInitialLoad(false);
    }
  }

  useEffect(() => {
    if (repos.length === 0) {
      setPrs([]);
      setInitialLoad(false);
      return;
    }
    fetchPRs({ silent: !initialLoad });
    const interval = setInterval(() => {
      fetchPRs({ silent: true }).catch(() => {});
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
    setPrs((prev) => {
      const key = `${freshItem._repo}-${freshItem.number}`;
      if (prev.some((i) => `${i._repo}-${i.number}` === key)) return prev;
      return [{ ...freshItem, __optimistic: true }, ...prev];
    });
  }, [freshItem, stateFilter, repoFilter, repos]);

  if (initialLoad && prs.length === 0) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: 40, color: "rgba(255,255,255,0.4)", fontFamily: "system-ui", fontSize: 13 }}>
        {t("pm.loadingPullRequests")}
      </div>
    );
  }

  if (error && prs.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: 40, gap: 12 }}>
        <span style={{ color: "rgba(255,100,100,0.7)", fontFamily: "system-ui", fontSize: 13 }}>{error}</span>
        <button
          onClick={() => fetchPRs()}
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "rgba(255,255,255,0.5)", padding: "6px 16px", cursor: "pointer", fontFamily: "system-ui", fontSize: 12 }}
        >
          {t("pm.retry")}
        </button>
      </div>
    );
  }

  if (prs.length === 0) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: 40, color: "rgba(255,255,255,0.3)", fontFamily: "system-ui", fontSize: 13 }}>
        {t("pm.noPullRequestsFound")}
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
        const rowId = `${item._repo}-${item.number}`;
        const copiedSummary = copiedAction === `${rowId}:summary`;
        const copiedCheckout = copiedAction === `${rowId}:checkout`;
        return (
          <div
            key={rowId}
            onClick={() => onSelectItem({ repo: item._repo, number: item.number, type: "pr" })}
            style={{
              display: "flex",
              flexDirection: "column",
              padding: "10px 16px",
              cursor: "pointer",
              borderBottom: "1px solid rgba(255,255,255,0.03)",
              transition: "background .15s, box-shadow .15s, backdrop-filter .15s",
              ...getPaneInteractionStyle("idle"),
            }}
            onMouseEnter={(e) => {
              applyPaneInteractionStyle(e.currentTarget, "hover");
              e.currentTarget.querySelectorAll(".row-action-btn").forEach((b) => {
                b.style.opacity = "1";
              });
            }}
            onMouseLeave={(e) => {
              applyPaneInteractionStyle(e.currentTarget, "idle");
              e.currentTarget.querySelectorAll(".row-action-btn").forEach((b) => {
                b.style.opacity = "0";
              });
            }}
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
                  {t("pm.draft")}
                </span>
              )}
              <HoverIconButton
                className="row-action-btn"
                tooltip={copiedSummary ? t("pm.copied") : t("pm.copyPrSummary")}
                onClick={(e) => {
                  e.stopPropagation();
                  const url = `https://github.com/${item._repo}/pull/${item.number}`;
                  navigator.clipboard.writeText(`#${item.number} ${item.title} ${url}`);
                  const actionId = `${rowId}:summary`;
                  setCopiedAction(actionId);
                  setTimeout(() => setCopiedAction((v) => v === actionId ? null : v), 1500);
                }}
                baseColor={copiedSummary ? "rgba(120,230,150,0.8)" : "rgba(255,255,255,0.35)"}
                hoverColor={copiedSummary ? "rgba(150,245,170,1)" : "rgba(255,255,255,0.9)"}
                style={{ opacity: copiedSummary ? 1 : 0 }}
              >
                {copiedSummary ? <Check size={12} strokeWidth={2} /> : <Copy size={12} strokeWidth={1.5} />}
              </HoverIconButton>
              <HoverIconButton
                className="row-action-btn"
                tooltip={copiedCheckout ? t("pm.copied") : t("pm.copyCheckoutCommand")}
                onClick={(e) => {
                  e.stopPropagation();
                  const cmd = `gh pr checkout ${item.number} -R ${item._repo}`;
                  navigator.clipboard.writeText(cmd);
                  const actionId = `${rowId}:checkout`;
                  setCopiedAction(actionId);
                  setTimeout(() => setCopiedAction((v) => v === actionId ? null : v), 1500);
                }}
                baseColor={copiedCheckout ? "rgba(120,230,150,0.8)" : "rgba(255,255,255,0.35)"}
                hoverColor={copiedCheckout ? "rgba(150,245,170,1)" : "rgba(255,255,255,0.9)"}
                style={{ opacity: copiedCheckout ? 1 : 0 }}
              >
                {copiedCheckout ? <Check size={12} strokeWidth={2} /> : <GitBranch size={12} strokeWidth={1.5} />}
              </HoverIconButton>
              <span style={{ color: "rgba(255,255,255,0.25)", fontFamily: "system-ui", fontSize: 11, flexShrink: 0 }}>
                {repoShort}
              </span>
            </div>
            <div style={{ marginLeft: 26, color: "rgba(255,255,255,0.3)", fontFamily: "system-ui", fontSize: 12, marginTop: 2 }}>
              {t("pm.byUpdated", { user: item.user?.login || t("pm.unknownUser"), time: timeAgo(item.updated_at, t) })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
