import { memo } from "react";
import { Check, CheckCircle2, Circle, Copy, GitPullRequest } from "lucide-react";
import { useTranslator } from "../../contexts/LocaleContext";
import { HoverIconButton } from "../boundary";
import { repoShortName, timeAgo } from "../format";
import type { IssueListItem } from "../types";
import { rowMetaStyle, rowNumberStyle, rowStyle, rowTitleStyle, setRowHover } from "./rowStyles";

interface IssueRowProps {
  item: IssueListItem;
  isOpen: boolean;
  copied: boolean;
  /** Number of linked PRs (0 hides the icon). */
  linkedPrCount: number;
  onSelect: (item: IssueListItem) => void;
  onCopy: (item: IssueListItem) => void;
}

function IssueRow({ item, isOpen, copied, linkedPrCount, onSelect, onCopy }: IssueRowProps) {
  const t = useTranslator();
  return (
    <div
      onClick={() => onSelect(item)}
      style={rowStyle}
      onMouseEnter={(e) => setRowHover(e, true, ".copy-btn")}
      onMouseLeave={(e) => setRowHover(e, false, ".copy-btn")}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {isOpen ? <Circle size={12} color="var(--success-text)" /> : <CheckCircle2 size={12} color="var(--accent-text)" />}
        <span style={rowNumberStyle}>#{item.number}</span>
        <span style={rowTitleStyle}>{item.title}</span>
        <HoverIconButton
          className="copy-btn"
          tooltip={copied ? t("pm.copied") : t("pm.copyIssueSummary")}
          onClick={(e) => {
            e.stopPropagation();
            onCopy(item);
          }}
          baseColor={copied ? "var(--success-text)" : "var(--text-muted)"}
          hoverColor={copied ? "var(--success-text-strong)" : "var(--text-primary)"}
          style={{ opacity: copied ? 1 : 0 }}
        >
          {copied ? <Check size={12} strokeWidth={2} /> : <Copy size={12} strokeWidth={1.5} />}
        </HoverIconButton>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <span
            style={{ width: 25, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}
            title={linkedPrCount > 0
              ? t(linkedPrCount > 1 ? "pm.linkedPrsTooltip" : "pm.linkedPrTooltip", { count: linkedPrCount })
              : undefined}
          >
            {linkedPrCount > 0 && <GitPullRequest size={12} strokeWidth={1.5} />}
          </span>
          <span style={{ color: "var(--text-disabled)", fontFamily: "var(--font-ui)", fontSize: 11 }}>{repoShortName(item._repo)}</span>
        </div>
      </div>
      <div style={rowMetaStyle}>
        {t("pm.byUpdated", { user: item.user?.login || t("pm.unknownUser"), time: timeAgo(item.updated_at, t) })}
      </div>
    </div>
  );
}

export default memo(IssueRow);
