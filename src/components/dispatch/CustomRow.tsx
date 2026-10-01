import { memo, useState, type ClipboardEvent } from "react";
import { Paperclip, X } from "lucide-react";
import type { Attachment } from "@shared/chat/types";
import type { EffortLevel, ModelDefinition } from "@shared/models";
import ImagePreview from "../ImagePreview";
import ModelPicker from "../ModelPicker";
import IssueDropdown from "./IssueDropdown";
import type { DispatchDropdownOption, DispatchIssue, DispatchRow, DispatchRowPatch, DispatchRowUpdate } from "./plan";
import { clipboardImageFiles, readImageAttachments } from "./readImages";
import {
  customBranchStyle,
  customControlsStyle,
  customDividerStyle,
  customErrorStyle,
  customRowStyle,
  customTextareaStyle,
} from "./styles";
import type { Translator } from "./translator";

export interface CustomRowProps {
  row: DispatchRow;
  index: number;
  pickerModels: readonly ModelDefinition[];
  globalModel: string;
  issueOptions: readonly DispatchDropdownOption[];
  issues: readonly DispatchIssue[];
  error: string | undefined;
  onChange: (key: string, patch: DispatchRowUpdate) => void;
  onRemove: (key: string) => void;
  t: Translator;
}

function CustomRow({ row, index, pickerModels, globalModel, issueOptions, issues, error, onChange, onRemove, t }: CustomRowProps) {
  const { attachments } = row;
  const patch = (next: DispatchRowPatch) => onChange(row.key, next);

  // Functional update: reads finish after later edits may have landed.
  const addAttachments = (items: readonly Attachment[]) => {
    if (!items.length) return;
    onChange(row.key, (current) => ({ attachments: [...current.attachments, ...items] }));
  };

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = clipboardImageFiles(e.clipboardData?.items);
    if (files.length === 0) return;
    e.preventDefault();
    void readImageAttachments(files).then(addAttachments);
  };

  const handleIssueChange = (value: string) => {
    patch({ issue: issues.find((iss) => String(iss.number) === value) });
  };

  return (
    <div style={customRowStyle(Boolean(error))}>
      <textarea
        placeholder={t("dispatch.sessionPromptPlaceholder", { number: index + 1 })}
        value={row.prompt}
        onChange={(e) => patch({ prompt: e.target.value })}
        onPaste={handlePaste}
        rows={3}
        style={customTextareaStyle}
      />
      {attachments.length > 0 && (
        <div style={{ padding: "0 12px 8px" }}>
          <ImagePreview items={attachments} onRemove={(i) => patch({ attachments: attachments.filter((_, idx) => idx !== i) })} />
        </div>
      )}
      <div style={customControlsStyle}>
        <input
          type="text"
          value={row.branch}
          placeholder={t("dispatch.branchNamePlaceholder")}
          onChange={(e) => patch({ branch: e.target.value })}
          style={customBranchStyle}
        />
        <span style={customDividerStyle} aria-hidden />
        <IssueDropdown
          compact
          ariaLabel={t("dispatch.attachIssue")}
          value={row.issue?.number ? String(row.issue.number) : ""}
          onChange={handleIssueChange}
          options={issueOptions}
          grouped
        />
        <span style={customDividerStyle} aria-hidden />
        <ModelPicker
          compact
          extraModels={pickerModels}
          ariaLabel={t("dispatch.modelForSession", { number: index + 1 })}
          value={row.model}
          onChange={(model) => patch({ model })}
          effort={row.model ? row.effort : null}
          onEffortChange={(effort: EffortLevel | null) => patch({ effort })}
          inheritModelId={globalModel}
          menuZIndex={1200}
        />
        <span style={customDividerStyle} aria-hidden />
        <AttachmentPicker attachments={attachments} onAdd={addAttachments} />
        <RemoveRowButton onClick={() => onRemove(row.key)} label={t("dispatch.removeRow")} />
      </div>
      {error && <div style={customErrorStyle}>{error}</div>}
    </div>
  );
}

export default memo(CustomRow);

function RemoveRowButton({ onClick, label }: { onClick: () => void; label: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={label}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        color: hovered ? "var(--text-primary)" : "var(--text-secondary)",
        padding: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "color .2s",
      }}
    >
      <X size={13} />
    </button>
  );
}

interface AttachmentPickerProps {
  attachments: readonly Attachment[];
  onAdd: (items: readonly Attachment[]) => void;
}

function AttachmentPicker({ attachments, onAdd }: AttachmentPickerProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <label
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        cursor: "pointer",
        color: hovered ? "var(--text-primary)" : "var(--text-secondary)",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        fontFamily: "var(--font-mono)",
        transition: "color .2s",
      }}
    >
      <Paperclip size={13} />
      {attachments.length > 0 ? attachments.length : ""}
      <input
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void readImageAttachments(files).then(onAdd);
        }}
      />
    </label>
  );
}
