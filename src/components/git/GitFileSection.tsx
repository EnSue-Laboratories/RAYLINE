import { memo, useState, type CSSProperties, type ReactNode } from "react";
import { Minus, Plus, RefreshCwOff, Undo2 } from "lucide-react";
import type { GitStatusFile } from "@shared/git/types";
import { fileCodeFor, isUntracked, letterFor, STATUS_COLORS, type FileListKind } from "./gitStatusModel";
import type { FontScale, Translator } from "../sidebar/types";

const rowIconBtnStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 18,
  height: 18,
  padding: 0,
  background: "transparent",
  border: "none",
  borderRadius: 4,
  color: "var(--text-secondary)",
  cursor: "pointer",
  transition: "color .15s",
};

function RowIconBtn({ onClick, title, children }: { onClick: () => void; title: string; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={rowIconBtnStyle}
      onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = "color-mix(in srgb, var(--text-primary) 54%, transparent)"; }}
    >
      {children}
    </button>
  );
}

function StageIcon({ kind }: { kind: FileListKind }) {
  return kind === "unstaged" ? <Plus size={12} strokeWidth={1.8} /> : <Minus size={12} strokeWidth={1.8} />;
}

interface FileRowProps {
  file: GitStatusFile;
  kind: FileListKind;
  s: FontScale;
  t: Translator;
  onAction: (path: string) => void;
  onRevert: (path: string, untracked: boolean) => void;
  onIgnore?: (path: string) => void;
}

const FileRow = memo(function FileRow({ file, kind, s, t, onAction, onRevert, onIgnore }: FileRowProps) {
  const [hover, setHover] = useState(false);
  const letter = letterFor(fileCodeFor(file, kind));
  const untracked = isUntracked(file);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        gap: 6,
        alignItems: "center",
        fontFamily: "var(--font-mono)",
        fontSize: s(11),
        padding: "2px 0",
        color: "color-mix(in srgb, var(--text-primary) 76%, transparent)",
      }}
    >
      <span style={{ width: 14, color: STATUS_COLORS[letter] }}>{letter}</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{file.path}</span>
      <div style={{ display: "flex", gap: 2, visibility: hover ? "visible" : "hidden" }}>
        <RowIconBtn
          onClick={() => onRevert(file.path, untracked)}
          title={untracked ? t("git.status.deleteUntracked") : t("git.status.discardChangesTitle")}
        >
          <Undo2 size={12} strokeWidth={1.8} />
        </RowIconBtn>
        {onIgnore && untracked && (
          <RowIconBtn onClick={() => onIgnore(file.path)} title={t("git.status.addToGitignore")}>
            <RefreshCwOff size={12} strokeWidth={1.8} />
          </RowIconBtn>
        )}
        <RowIconBtn onClick={() => onAction(file.path)} title={kind === "unstaged" ? t("git.status.stage") : t("git.status.unstage")}>
          <StageIcon kind={kind} />
        </RowIconBtn>
      </div>
    </div>
  );
});

export interface GitFileSectionProps {
  title: string;
  files: readonly GitStatusFile[];
  /** staged → actions unstage; unstaged → actions stage (and offer .gitignore). */
  kind: FileListKind;
  s: FontScale;
  t: Translator;
  onAction: (path: string) => void;
  onRevert: (path: string, untracked: boolean) => void;
  onIgnore?: (path: string) => void;
  onBulkAction: () => void;
  bulkActionTitle: string;
  style?: CSSProperties;
}

/** "Staged changes" / "Changes" list with per-file and bulk actions. */
export default function GitFileSection({
  title,
  files,
  kind,
  s,
  t,
  onAction,
  onRevert,
  onIgnore,
  onBulkAction,
  bulkActionTitle,
  style,
}: GitFileSectionProps) {
  return (
    <div style={style}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          color: "color-mix(in srgb, var(--text-primary) 43%, transparent)",
          fontSize: s(10),
          fontFamily: "var(--font-mono)",
          letterSpacing: ".08em",
          marginBottom: 6,
        }}
      >
        <span style={{ flex: 1 }}>{title}</span>
        <RowIconBtn onClick={onBulkAction} title={bulkActionTitle}>
          <StageIcon kind={kind} />
        </RowIconBtn>
      </div>
      {files.map((f) => (
        <FileRow key={`${f.path}:${kind}`} file={f} kind={kind} s={s} t={t} onAction={onAction} onRevert={onRevert} onIgnore={onIgnore} />
      ))}
    </div>
  );
}
