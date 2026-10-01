import { memo } from "react";
import { Check, Copy, GitBranch, GitMerge, GitPullRequest, GitPullRequestClosed } from "lucide-react";
import { useTranslator } from "../../contexts/LocaleContext";
import HoverIconButton from "../../components/HoverIconButton";
import { repoShortName, timeAgo } from "../format";
import type { PrRowItem } from "../types";
import { rowMetaStyle, rowNumberStyle, rowStyle, rowTitleStyle, setRowHover } from "./rowStyles";

export type PrCopyAction = "summary" | "checkout";

interface PrRowProps {
  item: PrRowItem;
  isOpen: boolean;
  /** Which action just copied, if any. */
  copied: PrCopyAction | null;
  onSelect: (item: PrRowItem) => void;
  onCopy: (item: PrRowItem, action: PrCopyAction) => void;
}

function PrIcon({ isOpen, merged }: { isOpen: boolean; merged: boolean }) {
  if (isOpen) return <GitPullRequest size={12} color="var(--success-text)" />;
  if (merged) return <GitMerge size={12} color="var(--accent-text)" />;
  return <GitPullRequestClosed size={12} color="var(--danger-text)" />;
}

function PrRow({ item, isOpen, copied, onSelect, onCopy }: PrRowProps) {
  const t = useTranslator();
  const copiedSummary = copied === "summary";
  const copiedCheckout = copied === "checkout";
  return (
    <div
      onClick={() => onSelect(item)}
      style={rowStyle}
      onMouseEnter={(e) => setRowHover(e, true, ".row-action-btn")}
      onMouseLeave={(e) => setRowHover(e, false, ".row-action-btn")}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <PrIcon isOpen={isOpen} merged={Boolean(item.merged_at)} />
        <span style={rowNumberStyle}>#{item.number}</span>
        <span style={rowTitleStyle}>{item.title}</span>
        {item.draft && (
          <span
            style={{
              color: "var(--text-muted)",
              fontFamily: "var(--font-ui)",
              fontSize: 10,
              padding: "2px 6px",
              borderRadius: 4,
              background: "var(--control-bg)",
              border: "1px solid var(--control-border)",
              flexShrink: 0,
            }}
          >
            {t("pm.draft")}
          </span>
        )}
        <HoverIconButton
          className="row-action-btn"
          tooltip={copiedSummary ? t("pm.copied") : t("pm.copyPrSummary")}
          onClick={(e) => {
            e.stopPropagation();
            onCopy(item, "summary");
          }}
          baseColor={copiedSummary ? "var(--success-text)" : "var(--text-muted)"}
          hoverColor={copiedSummary ? "var(--success-text-strong)" : "var(--text-primary)"}
          style={{ opacity: copiedSummary ? 1 : 0 }}
        >
          {copiedSummary ? <Check size={12} strokeWidth={2} /> : <Copy size={12} strokeWidth={1.5} />}
        </HoverIconButton>
        <HoverIconButton
          className="row-action-btn"
          tooltip={copiedCheckout ? t("pm.copied") : t("pm.copyCheckoutCommand")}
          onClick={(e) => {
            e.stopPropagation();
            onCopy(item, "checkout");
          }}
          baseColor={copiedCheckout ? "var(--success-text)" : "var(--text-muted)"}
          hoverColor={copiedCheckout ? "var(--success-text-strong)" : "var(--text-primary)"}
          style={{ opacity: copiedCheckout ? 1 : 0 }}
        >
          {copiedCheckout ? <Check size={12} strokeWidth={2} /> : <GitBranch size={12} strokeWidth={1.5} />}
        </HoverIconButton>
        <span style={{ color: "var(--text-disabled)", fontFamily: "var(--font-ui)", fontSize: 11, flexShrink: 0 }}>
          {repoShortName(item._repo)}
        </span>
      </div>
      <div style={rowMetaStyle}>
        {t("pm.byUpdated", { user: item.user?.login || t("pm.unknownUser"), time: timeAgo(item.updated_at, t) })}
      </div>
    </div>
  );
}

export default memo(PrRow);
