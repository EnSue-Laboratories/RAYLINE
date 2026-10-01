import { memo } from "react";
import type { GhComment } from "@shared/github/types";
import type { Translate } from "../boundary";
import { timeAgo } from "../format";
import { MONO_FONT, SYSTEM_FONT } from "../styles";
import MarkdownBody from "./MarkdownBody";

interface CommentListProps {
  t: Translate;
  comments: GhComment[];
}

function CommentList({ t, comments }: CommentListProps) {
  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: MONO_FONT, letterSpacing: ".04em", marginBottom: 12 }}>
        {t("pm.commentsCount", { count: comments.length, suffix: comments.length !== 1 ? t("pm.commentPlural") : "" })}
      </div>
      {comments.map((comment) => (
        <div key={comment.id} style={{ borderTop: "1px solid var(--control-bg)", paddingTop: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: "var(--text-subtle)", fontFamily: SYSTEM_FONT, marginBottom: 6 }}>
            <span style={{ color: "var(--text-muted)" }}>{comment.user?.login}</span> &middot; {timeAgo(comment.created_at, t)}
          </div>
          <div style={{ color: "var(--text-tertiary)", fontSize: 13, lineHeight: 1.6, fontFamily: SYSTEM_FONT }}>
            <MarkdownBody text={comment.body} variant="comment" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default memo(CommentList);
