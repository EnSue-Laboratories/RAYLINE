import { useCallback, useMemo, type Dispatch, type SetStateAction } from "react";
import { Plus } from "lucide-react";
import type { ModelDefinition } from "@shared/models";
import CustomRow from "./CustomRow";
import { issueOptions as buildIssueOptions, makeCustomRow, updateRow, type DispatchRow, type DispatchRowUpdate } from "./plan";
import { addBtnStyle, autoNoteStyle, noticeStyle } from "./styles";
import type { Translator } from "./translator";
import { useOpenIssues } from "./useOpenIssues";

export interface CustomTabProps {
  rows: readonly DispatchRow[];
  setRows: Dispatch<SetStateAction<DispatchRow[]>>;
  currentCwd: string | undefined;
  pickerModels: readonly ModelDefinition[];
  globalModel: string;
  errors: Readonly<Record<string, string>>;
  autoNote: string | null;
  t: Translator;
}

export default function CustomTab({ rows, setRows, currentCwd, pickerModels, globalModel, errors, autoNote, t }: CustomTabProps) {
  const { issues, loading, error } = useOpenIssues(currentCwd);
  const issueError = error === null ? null : error || t("dispatch.failedToLoadIssues");
  const issueOptions = useMemo(() => buildIssueOptions(issues, loading, issueError, t), [issues, loading, issueError, t]);

  const addRow = () => setRows((prev) => [...prev, makeCustomRow(prev.length)]);
  const removeRow = useCallback((key: string) => setRows((prev) => prev.filter((r) => r.key !== key)), [setRows]);
  const changeRow = useCallback((key: string, update: DispatchRowUpdate) => setRows((prev) => updateRow(prev, key, update)), [setRows]);

  return (
    <div style={{ padding: "24px 14px 14px" }}>
      {!currentCwd && <div style={noticeStyle}>{t("dispatch.selectFolderNotice")}</div>}
      {autoNote && <div style={autoNoteStyle}>{autoNote}</div>}
      {rows.map((r, i) => (
        <CustomRow
          key={r.key}
          row={r}
          index={i}
          pickerModels={pickerModels}
          globalModel={globalModel}
          issueOptions={issueOptions}
          issues={issues}
          error={errors[r.key]}
          onChange={changeRow}
          onRemove={removeRow}
          t={t}
        />
      ))}
      <button
        onClick={addRow}
        style={addBtnStyle}
        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; e.currentTarget.style.background = "var(--control-bg)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "transparent"; }}
      >
        <Plus size={13} strokeWidth={2} />
        <span>{t("dispatch.addSession")}</span>
      </button>
    </div>
  );
}
