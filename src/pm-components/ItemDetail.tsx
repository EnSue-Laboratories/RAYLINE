import { useMemo, useState } from "react";
import { ArrowLeft, Check, Copy } from "lucide-react";
import CommentBox from "./CommentBox";
import { createTranslator, type Locale } from "../pm/boundary";
import AssigneePicker from "../pm/detail/AssigneePicker";
import CommentList from "../pm/detail/CommentList";
import DetailActions from "../pm/detail/DetailActions";
import { getStateBadge, isMergedPr } from "../pm/detail/detailState";
import ItemHeader from "../pm/detail/ItemHeader";
import MarkdownBody from "../pm/detail/MarkdownBody";
import { useItemDetail } from "../pm/detail/useItemDetail";
import { checkoutCommand, copyText, githubItemUrl, timeAgo } from "../pm/format";
import { SYSTEM_FONT, smallButtonStyle } from "../pm/styles";
import type { PmItemType } from "../pm/types";

interface ItemDetailProps {
  repo: string;
  number: number;
  type: PmItemType;
  onBack: () => void;
  locale?: Locale;
}

/** Issue / PR detail: header, assignees, body, comments and actions. */
export default function ItemDetail({ repo, number, type, onBack, locale }: ItemDetailProps) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const detail = useItemDetail(repo, number, type);
  const [copiedCheckout, setCopiedCheckout] = useState(false);
  const { item } = detail;

  if (detail.error !== null) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, fontFamily: SYSTEM_FONT }}>
        <div style={{ color: "var(--danger-text-strong)", fontSize: 13 }}>{detail.error}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={detail.retry} style={smallButtonStyle}>{t("pm.retry")}</button>
          <button onClick={onBack} style={{ ...smallButtonStyle, background: "none" }}>{t("pm.back")}</button>
        </div>
      </div>
    );
  }

  if (detail.loading || !item) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-subtle)", fontSize: 13, fontFamily: SYSTEM_FONT }}>
        {t("pm.loadingItem")}
      </div>
    );
  }

  const isOpen = item.state === "open";
  const isMerged = isMergedPr(type, item);

  const copyCheckout = () => {
    copyText(checkoutCommand(repo, number));
    setCopiedCheckout(true);
    window.setTimeout(() => setCopiedCheckout(false), 1500);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "auto" }}>
      <button
        onClick={onBack}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--text-muted)",
          fontSize: 13,
          fontFamily: SYSTEM_FONT,
          padding: "16px 20px",
          transition: "color .15s",
        }}
      >
        <ArrowLeft size={14} strokeWidth={1.5} /> {t("pm.back")}
      </button>

      <div style={{ padding: "0 20px 20px" }}>
        <ItemHeader
          number={number}
          title={item.title}
          url={githubItemUrl(repo, type, number)}
          badge={getStateBadge(type, item, t)}
          subtitle={t("pm.openedBy", { repo, user: item.user?.login || t("pm.unknownUser"), time: timeAgo(item.created_at, t) })}
          labels={item.labels}
        />

        <AssigneePicker
          t={t}
          assignees={item.assignees}
          collaborators={detail.collaborators}
          onToggle={(login) => void detail.toggleAssignee(login)}
        />

        {type === "pr" && !isMerged && (
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button onClick={copyCheckout} style={smallButtonStyle}>
              {copiedCheckout
                ? <><Check size={11} strokeWidth={1.5} /> {t("pm.copied")}</>
                : <><Copy size={11} strokeWidth={1.5} /> {t("pm.checkout")}</>}
            </button>
          </div>
        )}

        <div
          style={{
            marginTop: 16,
            paddingTop: 16,
            borderTop: "1px solid var(--pane-border)",
            color: "var(--text-tertiary)",
            fontSize: 13,
            lineHeight: 1.7,
            fontFamily: SYSTEM_FONT,
          }}
        >
          <MarkdownBody text={item.body} variant="body" />
        </div>

        <CommentList t={t} comments={detail.comments} />
      </div>

      <CommentBox
        repo={repo}
        number={number}
        onCommentAdded={() => void detail.refreshComments()}
        locale={locale}
        actions={
          <DetailActions
            t={t}
            type={type}
            isOpen={isOpen}
            isMerged={isMerged}
            busy={detail.actionLoading}
            onMerge={() => void detail.merge()}
            onClose={() => void detail.closeIssue()}
            onReopen={() => void detail.reopen()}
          />
        }
      />
    </div>
  );
}
