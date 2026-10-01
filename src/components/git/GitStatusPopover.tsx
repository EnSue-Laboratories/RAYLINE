import type { CSSProperties, Ref } from "react";
import { createPortal } from "react-dom";
import { Check, CloudUpload, GitPullRequestArrow, Loader2, X } from "lucide-react";
import GitFileSection from "./GitFileSection";
import { getPrButtonTitle, type GitPillState } from "./gitStatusModel";
import type { GitPillController } from "./useGitPillController";
import type { SizedMenuPosition } from "../sidebar/dropdownPosition";
import type { FontScale, Translator } from "../sidebar/types";

const DIM = "color-mix(in srgb, var(--text-primary) 33%, transparent)";
const BRIGHT = "color-mix(in srgb, var(--text-primary) 76%, transparent)";
const DIVIDER = "1px solid color-mix(in srgb, var(--control-border) 63%, transparent)";
const DISABLED_BG = "color-mix(in srgb, var(--control-bg) 75%, transparent)";
const DISABLED_BORDER = "1px solid color-mix(in srgb, var(--control-border) 63%, transparent)";

function secondaryButtonStyle(enabled: boolean): CSSProperties {
  return {
    background: enabled ? "var(--pane-border)" : DISABLED_BG,
    border: enabled ? "1px solid color-mix(in srgb, var(--text-primary) 11%, transparent)" : DISABLED_BORDER,
    color: enabled ? "color-mix(in srgb, var(--text-primary) 87%, transparent)" : DIM,
  };
}

/** Background / border / color of the PR button for its current state. */
function prButtonColors(state: GitPillState, prSuccess: string, isCreatingPr: boolean): CSSProperties {
  if (prSuccess) {
    return { background: "var(--badge-open-bg)", border: "1px solid var(--badge-open-border)", color: "var(--badge-open-text)" };
  }
  if (isCreatingPr) {
    return {
      background: "var(--control-bg-active)",
      border: "1px solid var(--control-border-hover)",
      color: "color-mix(in srgb, var(--text-primary) 88%, transparent)",
    };
  }
  if (state.canPr) {
    return state.openPr
      ? { background: "var(--badge-open-bg)", border: "1px solid var(--badge-open-border)", color: "var(--badge-open-text)" }
      : secondaryButtonStyle(true);
  }
  return secondaryButtonStyle(false);
}

export interface GitStatusPopoverProps {
  position: SizedMenuPosition;
  menuRef: Ref<HTMLDivElement>;
  state: GitPillState;
  controller: GitPillController;
  s: FontScale;
  t: Translator;
}

/** Status / commit / PR popover under the git pill. */
export default function GitStatusPopover({ position, menuRef, state, controller: c, s, t }: GitStatusPopoverProps) {
  const { branch, upstream, detached, ahead, behind, staged, unstaged, openPr } = state;
  const { busy, prSuccess, isCreatingPr, generating, message, error } = c;

  return createPortal(
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        top: position.top,
        left: position.left,
        width: position.width,
        background: "var(--pane-elevated)",
        border: "1px solid var(--control-border)",
        borderRadius: 10,
        boxShadow: "0 12px 36px rgba(0,0,0,0.5)",
        backdropFilter: "blur(56px) saturate(1.1)",
        WebkitBackdropFilter: "blur(56px) saturate(1.1)",
        color: "color-mix(in srgb, var(--text-primary) 92%, transparent)",
        fontFamily: "var(--font-ui)",
        fontSize: s(12),
        zIndex: 9999,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "10px 12px",
          borderBottom: DIVIDER,
          fontFamily: "var(--font-mono)",
          fontSize: s(11),
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <span style={{ color: BRIGHT }}>
          {branch || (detached ? t("git.status.detachedLabel") : "?")}
          {upstream && <span style={{ color: DIM }}> → {upstream}</span>}
        </span>
        <span style={{ display: "flex", gap: 10 }}>
          <span style={{ color: ahead > 0 ? BRIGHT : DIM }}>↑{ahead}</span>
          <span style={{ color: behind > 0 ? BRIGHT : DIM }}>↓{behind}</span>
        </span>
      </div>

      <div style={{ padding: "8px 12px", maxHeight: 260, overflowY: "auto" }}>
        {state.clean && (
          <div
            style={{
              color: "color-mix(in srgb, var(--text-primary) 43%, transparent)",
              fontSize: s(10),
              fontFamily: "var(--font-mono)",
              letterSpacing: ".08em",
            }}
          >
            {t("git.status.noChanges")}
          </div>
        )}
        {staged.length > 0 && (
          <GitFileSection
            title={t("git.status.stagedChanges", { count: staged.length })}
            files={staged}
            kind="staged"
            s={s}
            t={t}
            onAction={(path) => void c.unstage(path)}
            onRevert={c.requestRevert}
            onBulkAction={() => void c.unstageAll()}
            bulkActionTitle={t("git.status.unstageAll")}
          />
        )}
        {unstaged.length > 0 && (
          <GitFileSection
            title={t("git.status.changes", { count: unstaged.length })}
            files={unstaged}
            kind="unstaged"
            s={s}
            t={t}
            onAction={(path) => void c.stage(path)}
            onRevert={c.requestRevert}
            onIgnore={(path) => void c.ignore(path)}
            onBulkAction={() => void c.stageAll()}
            bulkActionTitle={t("git.status.stageAll")}
            style={{ marginTop: staged.length > 0 ? 10 : 0 }}
          />
        )}
      </div>

      {!detached && (
        <div style={{ padding: "8px 12px", borderTop: DIVIDER }}>
          <textarea
            placeholder={generating ? t("git.status.generating") : t("git.status.commitPlaceholder")}
            value={message}
            onChange={(e) => c.setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Tab" && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
                if (message.trim().length > 0) return; // don't clobber user text
                e.preventDefault();
                void c.generateMessage();
              }
            }}
            disabled={generating}
            rows={1}
            style={{
              width: "100%",
              boxSizing: "border-box",
              resize: "none",
              background: "var(--control-bg)",
              border: "1px solid var(--control-border)",
              borderRadius: 6,
              color: "var(--text-primary)",
              fontFamily: "var(--font-ui)",
              fontSize: s(12),
              lineHeight: 1.4,
              padding: "6px 8px",
              outline: "none",
              opacity: generating ? 0.6 : 1,
            }}
          />
        </div>
      )}

      {(state.isCheckingPr || openPr) && (
        <div
          style={{
            padding: "0 12px 8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            color: openPr
              ? "color-mix(in srgb, var(--text-primary) 78%, transparent)"
              : "color-mix(in srgb, var(--text-primary) 46%, transparent)",
            fontFamily: "var(--font-mono)",
            fontSize: s(11),
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <GitPullRequestArrow size={12} strokeWidth={1.6} />
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {state.isCheckingPr || !openPr
                ? t("git.status.checkingPrStatus")
                : t("git.status.upstreamPr", { number: openPr.number, base: openPr.baseRefName })}
            </span>
          </div>
          {openPr && (
            <button
              onClick={() => void c.mergePr()}
              disabled={busy}
              onMouseEnter={(e) => {
                if (busy) return;
                e.currentTarget.style.color = "var(--text-primary)";
                e.currentTarget.style.textDecorationColor = "var(--text-primary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "color-mix(in srgb, var(--text-primary) 85%, transparent)";
                e.currentTarget.style.textDecorationColor = "color-mix(in srgb, var(--text-primary) 57%, transparent)";
              }}
              style={{
                padding: 0,
                background: "none",
                border: "none",
                color: "color-mix(in srgb, var(--text-primary) 85%, transparent)",
                fontSize: s(10),
                fontFamily: "var(--font-ui)",
                cursor: busy ? "default" : "pointer",
                flexShrink: 0,
                textDecorationLine: "underline",
                textDecorationStyle: "dashed",
                textDecorationColor: "color-mix(in srgb, var(--text-primary) 57%, transparent)",
                textUnderlineOffset: "0.22em",
                textDecorationThickness: "1px",
                transition: "color .15s ease, text-decoration-color .15s ease",
              }}
            >
              {busy ? "…" : t("git.status.merge")}
            </button>
          )}
        </div>
      )}

      <div style={{ padding: "0 12px 8px", display: "flex", gap: 8 }}>
        <button
          onClick={() => void c.commitAndPush()}
          disabled={!state.canCommit}
          style={{
            flex: 1,
            height: 30,
            background: state.canCommit ? "var(--control-bg-strong)" : DISABLED_BG,
            border: state.canCommit ? "1px solid color-mix(in srgb, var(--text-primary) 13%, transparent)" : DISABLED_BORDER,
            borderRadius: 6,
            color: state.canCommit ? "var(--text-primary)" : DIM,
            fontSize: s(12),
            fontFamily: "var(--font-ui)",
            cursor: state.canCommit ? "pointer" : "default",
            transition: "background .15s, border-color .15s, color .15s",
          }}
        >
          {busy ? "…" : t("git.status.commitAndPush")}
        </button>
        {!upstream && !detached ? (
          <button
            onClick={() => void c.publish()}
            disabled={!state.canPublish}
            title={state.canPublish ? t("git.status.publishTooltip", { branch }) : t("git.status.cannotPublish")}
            style={{
              height: 30,
              padding: "0 10px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              ...secondaryButtonStyle(state.canPublish),
              borderRadius: 6,
              fontFamily: "var(--font-ui)",
              cursor: state.canPublish ? "pointer" : "default",
            }}
          >
            <CloudUpload size={14} strokeWidth={1.6} />
          </button>
        ) : (
          <button
            onClick={() => void c.createPr()}
            disabled={!state.canPr || isCreatingPr}
            title={getPrButtonTitle(state, { prSuccess, isCreatingPr }, t)}
            aria-busy={isCreatingPr}
            style={{
              height: 30,
              padding: "0 10px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              ...prButtonColors(state, prSuccess, isCreatingPr),
              borderRadius: 6,
              fontFamily: "var(--font-ui)",
              cursor: state.canPr && !prSuccess && !isCreatingPr ? "pointer" : "default",
            }}
          >
            {prSuccess ? (
              <Check size={14} strokeWidth={2} />
            ) : isCreatingPr ? (
              <Loader2 size={13} strokeWidth={1.8} style={{ animation: "spin 1s linear infinite" }} />
            ) : (
              <GitPullRequestArrow size={14} strokeWidth={1.6} />
            )}
          </button>
        )}
        <button
          onClick={() => void c.pull()}
          disabled={!state.canPull || busy}
          style={{
            height: 30,
            padding: "0 14px",
            ...secondaryButtonStyle(state.canPull),
            borderRadius: 6,
            fontSize: s(12),
            fontFamily: "var(--font-ui)",
            cursor: state.canPull && !busy ? "pointer" : "default",
          }}
        >
          {t("git.status.pull")}
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: "8px 12px",
            background: "var(--danger-soft-bg)",
            borderTop: "1px solid var(--danger-soft-border)",
            color: "var(--danger-soft-text)",
            fontFamily: "var(--font-mono)",
            fontSize: s(11),
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
          }}
        >
          <span style={{ flex: 1, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{error}</span>
          <button onClick={c.clearError} style={{ background: "none", border: "none", color: "var(--danger-soft-text)", cursor: "pointer", padding: 0 }}>
            <X size={12} />
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}
