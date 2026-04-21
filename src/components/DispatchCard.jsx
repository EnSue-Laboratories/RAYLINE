import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { X, GitBranch, FileText, Check, ChevronRight, ChevronDown, Paperclip, Plus } from "lucide-react";
import ImagePreview from "./ImagePreview";

function TransparentCheckbox({ checked, onChange, ariaLabel }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", cursor: "pointer", flexShrink: 0 }}>
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={ariaLabel}
        style={{ opacity: 0, width: 0, height: 0, margin: 0, pointerEvents: "none" }}
      />
      <span
        aria-hidden
        style={{
          width: 16, height: 16, borderRadius: 4,
          border: "1px solid rgba(255,255,255,0.18)",
          background: checked ? "rgba(255,255,255,0.08)" : "transparent",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          transition: "border-color .15s, background .15s",
        }}
      >
        <Check
          size={11}
          strokeWidth={2.4}
          color="rgba(255,255,255,0.86)"
          style={{
            opacity: checked ? 1 : 0,
            transform: checked ? "scale(1)" : "scale(0.75)",
            transition: "opacity .12s ease, transform .12s ease",
          }}
        />
      </span>
    </label>
  );
}

const sectionLabelStyle = {
  fontSize: 9,
  color: "rgba(255,255,255,0.35)",
  fontFamily: "'JetBrains Mono', monospace",
  letterSpacing: ".12em",
  textTransform: "uppercase",
};

const onFieldHoverIn = (e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; };
const onFieldHoverOut = (e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.04)"; };
const fieldHoverProps = {
  onMouseEnter: onFieldHoverIn,
  onMouseLeave: onFieldHoverOut,
  onFocus: onFieldHoverIn,
  onBlur: onFieldHoverOut,
};

function slugifyBranch(text, fallbackIndex) {
  const slug = (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "")
    .slice(0, 32);
  return slug || `task-${fallbackIndex + 1}`;
}

function defaultCustomBranch(index) {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `dispatch-${yyyy}${mm}${dd}-${hh}${mi}-${index + 1}`;
}

function makeCustomRow(index) {
  return {
    key: "r" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
    prompt: "",
    branch: defaultCustomBranch(index),
    model: "",
    attachments: [],
  };
}

function buildIssuePrompt(issue) {
  const body = issue.body ? `\n\n${issue.body}` : "";
  return `Fix issue #${issue.number}: ${issue.title}${body}`;
}

function makeIssueRow(issue) {
  return {
    key: `issue-${issue.number}`,
    enabled: false,
    issue,
    prompt: buildIssuePrompt(issue),
    branch: `issue-${issue.number}-${slugifyBranch(issue.title, issue.number)}`,
    model: "",
    expanded: false,
  };
}

export default function DispatchCard({
  onClose,
  onDispatch,
  currentCwd,
  projects,
  defaultModel = "sonnet",
  availableModels = [],
}) {
  const [tab, setTab] = useState("issues"); // "issues" | "custom"
  const [globalModel, setGlobalModel] = useState(defaultModel);
  const [customRows, setCustomRows] = useState([]);
  const [issueRows, setIssueRows] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({}); // rowKey -> message
  const [banner, setBanner] = useState(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    setBanner(null);
  }, [tab]);

  const activeRows = tab === "issues"
    ? issueRows.filter((r) => r.enabled)
    : customRows;
  const canDispatch = activeRows.length > 0 && !submitting
    && (tab === "issues" || !!currentCwd);

  const handleSubmit = useCallback(async () => {
    const rowsToRun = tab === "issues"
      ? issueRows.filter((r) => r.enabled)
      : customRows;

    const rowErrors = {};
    const seenBranches = new Set();
    for (const r of rowsToRun) {
      const trimmed = r.branch?.trim();
      if (!r.prompt?.trim()) rowErrors[r.key] = "Prompt is empty.";
      else if (!trimmed) rowErrors[r.key] = "Branch name is empty.";
      else if (seenBranches.has(trimmed)) rowErrors[r.key] = "Branch name is duplicated in this batch.";
      else seenBranches.add(trimmed);
    }

    if (Object.keys(rowErrors).length) {
      setErrors(rowErrors);
      return;
    }
    setErrors({});
    setBanner(null);
    setSubmitting(true);

    const payload = rowsToRun.map((r) => ({
      prompt: r.prompt.trim(),
      attachments: r.attachments,
      model: r.model || globalModel,
      cwd: r.cwd || currentCwd,
      branch: r.branch.trim(),
      issueContext: r.issue ? `Issue #${r.issue.number}: ${r.issue.title}` : undefined,
      tag: r.issue ? `#${r.issue.number}` : undefined,
    }));

    let results;
    try {
      ({ results } = await onDispatch(payload));
    } finally {
      setSubmitting(false);
    }
    const failed = results.filter((x) => !x.ok);
    if (failed.length === 0) {
      setBanner(null);
      onClose();
      return;
    }

    // results' `row` is the payload row without `key`; reconstruct by branch to key errors.
    const byBranch = {};
    rowsToRun.forEach((r) => { byBranch[r.branch.trim()] = r.key; });
    const keyedErrors = {};
    for (const f of failed) {
      const key = byBranch[f.row.branch];
      if (key) keyedErrors[key] = f.error?.message || "Dispatch failed.";
    }
    setErrors(keyedErrors);
    setBanner(`Dispatched ${results.length - failed.length}/${results.length} tasks. ${failed.length} failed — see rows.`);

    const successBranches = new Set(results.filter((x) => x.ok).map((x) => x.row.branch));
    if (tab === "issues") {
      setIssueRows((prev) => prev.map((r) =>
        successBranches.has(r.branch.trim()) ? { ...r, enabled: false } : r
      ));
    } else {
      setCustomRows((prev) => prev.filter((r) => !successBranches.has(r.branch.trim())));
    }
  }, [tab, issueRows, customRows, currentCwd, globalModel, onDispatch, onClose]);

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <header style={headerStyle}>
          <div style={titleStyle}>Dispatch</div>
          <button onClick={onClose} style={closeBtnStyle} aria-label="Close">
            <X size={16} />
          </button>
        </header>

        {banner && (
          <div role="status" aria-live="polite" style={{ background: "rgba(255,200,150,0.08)", color: "rgba(255,200,150,0.9)", padding: "8px 14px", fontSize: 12 }}>
            {banner}
          </div>
        )}

        <div style={tabsStyle} role="tablist">
          <TabBtn active={tab === "issues"} onClick={() => setTab("issues")}>
            <GitBranch size={13} /> From Issues
          </TabBtn>
          <TabBtn active={tab === "custom"} onClick={() => setTab("custom")}>
            <FileText size={13} /> Custom
          </TabBtn>
        </div>

        <div style={bodyStyle}>
          {tab === "issues" ? (
            <IssueTab
              rows={issueRows}
              setRows={setIssueRows}
              projects={projects}
              currentCwd={currentCwd}
              availableModels={availableModels}
              errors={errors}
            />
          ) : (
            <CustomTab
              rows={customRows}
              setRows={setCustomRows}
              currentCwd={currentCwd}
              availableModels={availableModels}
              errors={errors}
            />
          )}
        </div>

        <footer style={footerStyle}>
          <DispatchDropdown
            ariaLabel="Default model"
            value={globalModel}
            onChange={setGlobalModel}
            options={availableModels.map((m) => ({
              value: m.id,
              label: m.name || m.label || m.id,
              triggerLabel: m.tag || m.label || m.id,
              sublabel: m.tag,
              group: (m.provider || "MODEL").toUpperCase(),
            }))}
            grouped
          />
          <button
            onClick={handleSubmit}
            disabled={!canDispatch}
            style={primaryBtnStyle(canDispatch)}
          >
            Dispatch {activeRows.length || 0} agent{activeRows.length === 1 ? "" : "s"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={tabBtnStyle(active)}
    >
      {children}
    </button>
  );
}

function IssueTab({ rows, setRows, projects, currentCwd, availableModels, errors }) {
  const [selectedPath, setSelectedPath] = useState(currentCwd || "");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const projectPaths = useMemo(
    () => Object.keys(projects || {}).filter((p) => !projects[p]?.hidden),
    [projects]
  );

  useEffect(() => {
    if (!selectedPath) { setRows([]); return; }
    let cancelled = false;
    setLoading(true); setLoadError(null);
    (async () => {
      try {
        const s = await window.api.gitRemoteSlug(selectedPath);
        if (cancelled) return;
        if (!s) {
          setRows([]); setLoadError("No GitHub remote on this folder.");
          return;
        }
        const issues = await window.api.ghListIssues(s, "open");
        if (cancelled) return;
        setRows((issues || []).map((iss) => ({ ...makeIssueRow(iss), cwd: selectedPath })));
      } catch (e) {
        if (!cancelled) setLoadError(e?.message || "Failed to load issues.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedPath, setRows]);

  const toggleAll = (checked) => setRows((prev) => prev.map((r) => ({ ...r, enabled: checked })));
  const updateRow = (key, patch) => setRows((prev) =>
    prev.map((r) => (r.key === key ? { ...r, ...patch } : r))
  );

  const allChecked = rows.length > 0 && rows.every((r) => r.enabled);

  return (
    <div style={{ padding: "24px 14px 14px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        <label style={sectionLabelStyle}>Working directory</label>
        <DispatchDropdown
          fullWidth
          ariaLabel="Working directory"
          value={selectedPath}
          onChange={setSelectedPath}
          placeholder="(select)"
          options={[
            { value: "", label: "(select)" },
            ...projectPaths.map((p) => ({ value: p, label: p })),
          ]}
        />
      </div>

      {selectedPath && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={sectionLabelStyle}>Issues</span>
          {rows.length > 0 && (
            <span style={{ ...sectionLabelStyle, color: "rgba(255,255,255,0.25)" }}>
              {rows.filter((r) => r.enabled).length}/{rows.length}
            </span>
          )}
        </div>
      )}

      {loading && <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>Loading issues…</div>}
      {loadError && <div style={errorStyle}>{loadError}</div>}
      {!loading && !loadError && rows.length === 0 && selectedPath && (
        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>No open issues.</div>
      )}

      {rows.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 4px", borderBottom: "1px solid var(--pane-border)" }}>
          <TransparentCheckbox
            checked={allChecked}
            onChange={toggleAll}
            ariaLabel="Select all issues"
          />
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
            Select all
          </span>
        </div>
      )}

      {rows.map((r) => (
        <IssueRow
          key={r.key}
          row={r}
          availableModels={availableModels}
          error={errors[r.key]}
          onChange={(patch) => updateRow(r.key, patch)}
        />
      ))}
    </div>
  );
}

function IssueRow({ row, availableModels, error, onChange }) {
  const { issue } = row;
  return (
    <div style={{ ...rowStyle(!!error), flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <TransparentCheckbox
          checked={row.enabled}
          onChange={(v) => onChange({ enabled: v })}
          ariaLabel={`Select issue #${issue.number}`}
        />
        <button
          onClick={() => onChange({ expanded: !row.expanded })}
          style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}
          aria-label="Toggle details"
        >
          {row.expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, fontFamily: "monospace" }}>
          #{issue.number}
        </span>
        <span style={{ fontSize: 12, color: "white", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {issue.title}
        </span>
        <input
          type="text"
          value={row.branch}
          onChange={(e) => onChange({ branch: e.target.value })}
          style={{ ...inputStyle, width: 180, flex: "none" }}
          {...fieldHoverProps}
        />
        <DispatchDropdown
          ariaLabel={`Model for issue #${issue.number}`}
          value={row.model}
          onChange={(v) => onChange({ model: v })}
          options={modelOptionsWithDefault(availableModels)}
          grouped
        />
      </div>
      {row.expanded && (
        <textarea
          value={row.prompt}
          onChange={(e) => onChange({ prompt: e.target.value })}
          rows={6}
          style={textareaStyle}
          {...fieldHoverProps}
        />
      )}
      {error && <div style={errorStyle}>{error}</div>}
    </div>
  );
}

function CustomTab({ rows, setRows, currentCwd, availableModels, errors }) {
  const addRow = () => setRows((prev) => [...prev, makeCustomRow(prev.length)]);
  const removeRow = (key) => setRows((prev) => prev.filter((r) => r.key !== key));
  const updateRow = (key, patch) => setRows((prev) =>
    prev.map((r) => (r.key === key ? { ...r, ...patch } : r))
  );

  return (
    <div style={{ padding: "24px 14px 14px" }}>
      {!currentCwd && (
        <div style={noticeStyle}>
          Select a folder in the sidebar before dispatching custom tasks.
        </div>
      )}
      {rows.map((r, i) => (
        <CustomRow
          key={r.key}
          row={r}
          index={i}
          availableModels={availableModels}
          error={errors[r.key]}
          onChange={(patch) => updateRow(r.key, patch)}
          onRemove={() => removeRow(r.key)}
        />
      ))}
      <button
        onClick={addRow}
        style={addBtnStyle}
        onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.8)"; e.currentTarget.style.background = "rgba(255,255,255,0.025)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.4)"; e.currentTarget.style.background = "transparent"; }}
      >
        <Plus size={13} strokeWidth={2} />
        <span>Add task</span>
      </button>
    </div>
  );
}

function CustomRow({ row, index, availableModels, error, onChange, onRemove }) {
  const attachments = row.attachments || [];

  const addAttachments = (items) => {
    if (!items.length) return;
    onChange({ attachments: [...attachments, ...items] });
  };

  const removeAttachment = (i) => {
    onChange({ attachments: attachments.filter((_, idx) => idx !== i) });
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageItems = Array.from(items).filter((it) => it.type.startsWith("image/"));
    if (imageItems.length === 0) return;
    e.preventDefault();
    Promise.all(imageItems.map((it) => new Promise((resolve) => {
      const file = it.getAsFile();
      if (!file) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = (ev) => resolve({ type: "image", dataUrl: ev.target.result, name: file.name || "image" });
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    }))).then((added) => addAttachments(added.filter(Boolean)));
  };

  return (
    <div style={customRowStyle(!!error)}>
      <textarea
        placeholder={`Task ${index + 1} prompt…`}
        value={row.prompt}
        onChange={(e) => onChange({ prompt: e.target.value })}
        onPaste={handlePaste}
        rows={3}
        style={customTextareaStyle}
      />
      {attachments.length > 0 && (
        <div style={{ padding: "0 12px 8px" }}>
          <ImagePreview items={attachments} onRemove={removeAttachment} />
        </div>
      )}
      <div style={customControlsStyle}>
        <input
          type="text"
          value={row.branch}
          placeholder="branch name"
          onChange={(e) => onChange({ branch: e.target.value })}
          style={customBranchStyle}
        />
        <span style={customDividerStyle} aria-hidden />
        <DispatchDropdown
          compact
          ariaLabel={`Model for task ${index + 1}`}
          value={row.model}
          onChange={(v) => onChange({ model: v })}
          options={modelOptionsWithDefault(availableModels)}
          grouped
        />
        <span style={customDividerStyle} aria-hidden />
        <AttachmentPicker
          attachments={row.attachments}
          onChange={(a) => onChange({ attachments: a })}
        />
        <button onClick={onRemove} style={removeBtnStyle} aria-label="Remove row">
          <X size={14} />
        </button>
      </div>
      {error && <div style={customErrorStyle}>{error}</div>}
    </div>
  );
}

function AttachmentPicker({ attachments, onChange }) {
  return (
    <label style={{ cursor: "pointer", color: "rgba(255,255,255,0.5)", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
      <Paperclip size={13} />
      {attachments.length > 0 ? attachments.length : ""}
      <input
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = "";
          Promise.all(files.map((file) => new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (ev) => resolve({ type: "image", dataUrl: ev.target.result, name: file.name || "image" });
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(file);
          }))).then((added) => {
            onChange([...attachments, ...added.filter(Boolean)]);
          });
        }}
      />
    </label>
  );
}
function DispatchDropdown({
  value,
  onChange,
  options,
  placeholder,
  fullWidth,
  compact,
  grouped,
  ariaLabel,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const menuRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState(null);

  const selected = options.find((o) => o.value === value);
  const triggerText = selected ? (selected.triggerLabel || selected.label) : (placeholder || "");

  const updateMenuPosition = useCallback(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const menuWidth = fullWidth ? rect.width : Math.max(200, rect.width);
    const left = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8));
    const gap = 6;
    const spaceBelow = window.innerHeight - rect.bottom - gap - 8;
    const spaceAbove = rect.top - gap - 8;
    const flipUp = spaceBelow < 180 && spaceAbove > spaceBelow;
    const maxHeight = Math.min(320, Math.max(120, flipUp ? spaceAbove : spaceBelow));
    setMenuStyle({
      top: flipUp ? undefined : rect.bottom + gap,
      bottom: flipUp ? window.innerHeight - rect.top + gap : undefined,
      left,
      width: menuWidth,
      maxHeight,
    });
  }, [fullWidth]);

  useEffect(() => {
    const h = (e) => {
      if (ref.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setOpen(false);
      setMenuStyle(null);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => {
    if (!open) return;
    const h = () => updateMenuPosition();
    window.addEventListener("resize", h);
    window.addEventListener("scroll", h, true);
    return () => {
      window.removeEventListener("resize", h);
      window.removeEventListener("scroll", h, true);
    };
  }, [open, updateMenuPosition]);

  const toggle = () => {
    if (open) { setOpen(false); setMenuStyle(null); return; }
    updateMenuPosition();
    setOpen(true);
  };

  const triggerStyle = compact
    ? {
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "4px 0",
        background: "transparent",
        border: "none",
        color: selected ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.45)",
        fontSize: 10,
        fontFamily: "'JetBrains Mono',monospace",
        letterSpacing: ".06em",
        cursor: "pointer",
        outline: "none",
      }
    : {
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 6,
        padding: fullWidth ? "12px 12px" : "6px 10px",
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.04)",
        borderRadius: 7,
        color: selected ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.45)",
        fontSize: fullWidth ? 11 : 10,
        fontFamily: "'JetBrains Mono',monospace",
        letterSpacing: ".06em",
        cursor: "pointer",
        width: fullWidth ? "100%" : "auto",
        transition: "border-color .2s",
        outline: "none",
      };

  const groups = grouped
    ? options.reduce((acc, opt) => {
        const g = opt.group || "";
        if (!acc[g]) acc[g] = [];
        acc[g].push(opt);
        return acc;
      }, {})
    : { "": options };

  return (
    <div ref={ref} style={{ position: "relative", width: fullWidth ? "100%" : "auto", flexShrink: 0 }}>
      <button
        type="button"
        onClick={toggle}
        aria-label={ariaLabel}
        style={triggerStyle}
        onMouseEnter={compact ? undefined : (e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
        onMouseLeave={compact ? undefined : (e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.04)"; }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: fullWidth ? 1 : undefined, textAlign: "left" }}>
          {triggerText}
        </span>
        <ChevronDown size={11} strokeWidth={2} style={{ opacity: 0.45, flexShrink: 0 }} />
      </button>
      {open && menuStyle && createPortal(
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            top: menuStyle.top,
            bottom: menuStyle.bottom,
            left: menuStyle.left,
            width: menuStyle.width,
            zIndex: 1200,
            background: "rgba(16,16,18,0.82)",
            backdropFilter: "blur(48px) saturate(1.2)",
            WebkitBackdropFilter: "blur(48px) saturate(1.2)",
            border: "1px solid var(--pane-border)",
            borderRadius: 10,
            padding: 3,
            maxHeight: menuStyle.maxHeight || 320,
            overflowY: "auto",
            boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
          }}
        >
          {Object.entries(groups).map(([groupLabel, opts], gi) => (
            <div key={groupLabel || `g${gi}`}>
              {gi > 0 && <div style={{ height: 1, background: "rgba(255,255,255,0.04)", margin: "4px 8px" }} />}
              {groupLabel && (
                <div style={{ padding: gi === 0 ? "6px 10px 2px" : "4px 10px 2px", fontSize: 8, color: "rgba(255,255,255,0.2)", letterSpacing: ".12em", fontFamily: "'JetBrains Mono',monospace", textTransform: "uppercase" }}>
                  {groupLabel}
                </div>
              )}
              {opts.map((opt) => (
                <button
                  key={String(opt.value)}
                  type="button"
                  onClick={() => { onChange(opt.value); setOpen(false); setMenuStyle(null); }}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    width: "100%", padding: "8px 12px",
                    background: opt.value === value ? "rgba(255,255,255,0.04)" : "transparent",
                    border: "none", borderRadius: 7,
                    color: opt.value === value ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.5)",
                    fontSize: 11,
                    fontFamily: "'JetBrains Mono',monospace",
                    cursor: "pointer", textAlign: "left",
                    transition: "background .12s, color .12s",
                  }}
                  onMouseEnter={(e) => { if (opt.value !== value) e.currentTarget.style.background = "rgba(255,255,255,0.025)"; }}
                  onMouseLeave={(e) => { if (opt.value !== value) e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {opt.label}
                  </span>
                  {opt.sublabel && (
                    <span style={{ fontSize: 9, opacity: 0.4, letterSpacing: ".1em", marginLeft: 8, flexShrink: 0 }}>
                      {opt.sublabel}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

function modelOptionsWithDefault(availableModels) {
  return [
    { value: "", label: "(default)", group: "INHERIT" },
    ...availableModels.map((m) => ({
      value: m.id,
      label: m.name || m.label || m.id,
      triggerLabel: m.tag || m.label || m.id,
      sublabel: m.tag,
      group: (m.provider || "MODEL").toUpperCase(),
    })),
  ];
}

// Styles — mirror NewChatCard.jsx conventions
const backdropStyle = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 1000, backdropFilter: "blur(6px)",
};
const cardStyle = {
  width: 820, maxWidth: "90vw", maxHeight: "85vh",
  background: "var(--pane-elevated)",
  backdropFilter: "blur(48px) saturate(1.2)",
  WebkitBackdropFilter: "blur(48px) saturate(1.2)",
  border: "1px solid var(--pane-border)",
  borderRadius: 12, display: "flex", flexDirection: "column",
  color: "white", fontFamily: "system-ui, sans-serif", fontSize: 13,
  boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
};
const headerStyle = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "14px 18px", borderBottom: "1px solid var(--pane-border)",
};
const titleStyle = { fontSize: 14, fontWeight: 500 };
const closeBtnStyle = {
  background: "none", border: "none", color: "rgba(255,255,255,0.55)",
  cursor: "pointer", padding: 4,
};
const tabsStyle = {
  display: "flex", gap: 4, padding: "10px 14px 0",
  borderBottom: "1px solid var(--pane-border)",
};
const tabBtnStyle = (active) => ({
  display: "flex", gap: 6, alignItems: "center",
  padding: "8px 12px", borderRadius: "6px 6px 0 0",
  background: active ? "var(--pane-hover)" : "transparent",
  color: active ? "white" : "rgba(255,255,255,0.55)",
  border: "none", borderBottom: active ? "1px solid white" : "1px solid transparent",
  cursor: "pointer", fontSize: 12,
});
const bodyStyle = { flex: 1, overflow: "auto", padding: 0 };
const footerStyle = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "12px 18px", borderTop: "1px solid var(--pane-border)",
};
const primaryBtnStyle = (enabled) => ({
  padding: "8px 14px", borderRadius: 6, border: "none",
  background: enabled ? "white" : "rgba(255,255,255,0.1)",
  color: enabled ? "black" : "rgba(255,255,255,0.4)",
  cursor: enabled ? "pointer" : "not-allowed",
  fontSize: 12, fontWeight: 500,
});

const noticeStyle = {
  background: "rgba(255,200,150,0.06)", border: "1px solid rgba(255,200,150,0.18)",
  color: "rgba(255,200,150,0.9)", borderRadius: 6, padding: "8px 10px",
  fontSize: 12, marginBottom: 10,
};
const rowStyle = (hasError) => ({
  border: "1px solid " + (hasError ? "rgba(255,180,180,0.35)" : "var(--pane-border)"),
  borderRadius: 8, padding: 10, marginBottom: 10,
  display: "flex", flexDirection: "column", gap: 8,
  background: "rgba(255,255,255,0.015)",
});
const textareaStyle = {
  width: "100%", minHeight: 48, resize: "vertical",
  background: "rgba(255,255,255,0.02)", color: "rgba(255,255,255,0.8)",
  border: "1px solid rgba(255,255,255,0.04)", borderRadius: 7,
  padding: "8px 10px", fontSize: 12, fontFamily: "inherit",
  outline: "none",
  transition: "border-color .2s",
};
const inputStyle = {
  flex: 1,
  background: "rgba(255,255,255,0.02)",
  color: "rgba(255,255,255,0.6)",
  border: "1px solid rgba(255,255,255,0.04)",
  borderRadius: 7,
  padding: "8px 12px",
  fontSize: 10,
  fontFamily: "'JetBrains Mono', monospace",
  letterSpacing: ".06em",
  outline: "none",
  transition: "border-color .2s",
};
const removeBtnStyle = {
  background: "none", border: "none", color: "rgba(255,255,255,0.4)",
  cursor: "pointer", fontSize: 13, padding: "4px 6px",
};
const addBtnStyle = {
  display: "inline-flex", alignItems: "center", gap: 6,
  background: "transparent",
  border: "none",
  color: "rgba(255,255,255,0.4)",
  padding: "6px 8px",
  borderRadius: 6,
  marginTop: 2,
  cursor: "pointer", fontSize: 11,
  fontFamily: "'JetBrains Mono', monospace",
  letterSpacing: ".06em",
  transition: "color .15s, background .15s",
};

const customRowStyle = (hasError) => ({
  border: "1px solid " + (hasError ? "rgba(255,180,180,0.35)" : "var(--pane-border)"),
  borderRadius: 8,
  marginBottom: 10,
  background: "rgba(255,255,255,0.015)",
  overflow: "hidden",
  transition: "border-color .2s",
});
const customTextareaStyle = {
  width: "100%",
  minHeight: 72,
  resize: "vertical",
  background: "transparent",
  color: "rgba(255,255,255,0.85)",
  border: "none",
  padding: "12px 12px 8px",
  fontSize: 12,
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
};
const customControlsStyle = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  padding: "6px 10px 6px 12px",
  borderTop: "1px solid rgba(255,255,255,0.04)",
  background: "rgba(255,255,255,0.01)",
};
const customBranchStyle = {
  flex: 1,
  minWidth: 0,
  background: "transparent",
  color: "rgba(255,255,255,0.65)",
  border: "none",
  padding: "4px 0",
  fontSize: 10,
  fontFamily: "'JetBrains Mono', monospace",
  letterSpacing: ".06em",
  outline: "none",
};
const customDividerStyle = {
  width: 1, height: 12,
  background: "rgba(255,255,255,0.06)",
  flexShrink: 0,
};
const customErrorStyle = {
  color: "rgba(255,180,180,0.9)", fontSize: 11,
  padding: "0 12px 8px",
};
const errorStyle = {
  color: "rgba(255,180,180,0.9)", fontSize: 11, marginTop: 2,
};
