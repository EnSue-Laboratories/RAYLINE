import { useState, useCallback, useEffect, useMemo } from "react";
import { X, GitBranch, FileText } from "lucide-react";

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

  const activeRows = tab === "issues"
    ? issueRows.filter((r) => r.enabled)
    : customRows;
  const canDispatch = activeRows.length > 0 && !submitting;

  const handleSubmit = useCallback(async () => {
    const rowsToRun = tab === "issues"
      ? issueRows.filter((r) => r.enabled)
      : customRows;

    // Build per-row errors map
    const rowErrors = {};
    const seenBranches = new Set();
    for (const r of rowsToRun) {
      if (!r.prompt?.trim()) rowErrors[r.key] = "Prompt is empty.";
      else if (!r.branch?.trim()) rowErrors[r.key] = "Branch name is empty.";
      else if (seenBranches.has(r.branch)) rowErrors[r.key] = "Branch name is duplicated in this batch.";
      else seenBranches.add(r.branch);
    }

    // eslint-disable-next-line no-unused-vars
    const parentCwd = tab === "issues"
      ? (issueRows[0]?.issue ? // derive from selected repo via IssueTab — pass through below instead
          null : null)
      : currentCwd;

    // For the Issues tab the parent cwd is the folder selected inside IssueTab.
    // We capture it by lifting state: easier to just require IssueTab to store it on each row.
    // Simpler: require IssueTab to stamp a `cwd` on each row before they get here.
    // (Make sure Task 6 set row.cwd = selectedPath when constructing rows — if not, adjust.)

    if (tab === "custom" && !currentCwd) {
      rowErrors.__global = "Select a folder in the sidebar first.";
    }

    if (Object.keys(rowErrors).length) {
      setErrors(rowErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);

    const payload = rowsToRun.map((r) => ({
      prompt: r.prompt,
      attachments: r.attachments,
      model: r.model || globalModel,
      cwd: r.cwd || currentCwd,
      branch: r.branch.trim(),
      issueContext: r.issue ? `Issue #${r.issue.number}: ${r.issue.title}` : undefined,
      tag: r.issue ? `#${r.issue.number}` : undefined,
    }));

    const { results } = await onDispatch(payload);
    const failed = results.filter((x) => !x.ok);
    if (failed.length === 0) {
      onClose();
      return;
    }

    // Keep failed rows in modal; mark errors per row.
    const failedMsgs = {};
    for (const f of failed) {
      failedMsgs[f.row.__rowKey || f.row.branch] = f.error?.message || "Dispatch failed.";
    }
    // Note: results' `row` is the payload row, which lacks `key`; reconstruct by branch.
    const byBranch = {};
    rowsToRun.forEach((r) => { byBranch[r.branch.trim()] = r.key; });
    const keyedErrors = {};
    for (const f of failed) {
      const key = byBranch[f.row.branch];
      if (key) keyedErrors[key] = f.error?.message || "Dispatch failed.";
    }
    setErrors(keyedErrors);

    if (tab === "issues") {
      // Turn off the `enabled` flag on successful rows so only failures remain armed.
      const successBranches = new Set(results.filter((x) => x.ok).map((x) => x.row.branch));
      setIssueRows((prev) => prev.map((r) => successBranches.has(r.branch) ? { ...r, enabled: false } : r));
    } else {
      // Remove successful custom rows entirely.
      const successBranches = new Set(results.filter((x) => x.ok).map((x) => x.row.branch));
      setCustomRows((prev) => prev.filter((r) => !successBranches.has(r.branch.trim())));
    }

    setSubmitting(false);
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
          <ModelDropdown
            value={globalModel}
            onChange={setGlobalModel}
            models={availableModels}
            label="Default model"
          />
          <button
            onClick={handleSubmit}
            disabled={!canDispatch}
            style={primaryBtnStyle(canDispatch)}
          >
            Dispatch {activeRows.length || 0} task{activeRows.length === 1 ? "" : "s"}
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
  const [slug, setSlug] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const projectPaths = useMemo(
    () => Object.keys(projects || {}).filter((p) => !projects[p]?.hidden),
    [projects]
  );

  useEffect(() => {
    if (!selectedPath) { setSlug(null); setRows([]); return; }
    let cancelled = false;
    setLoading(true); setLoadError(null);
    (async () => {
      try {
        const s = await window.api.gitRemoteSlug(selectedPath);
        if (cancelled) return;
        if (!s) {
          setSlug(null); setRows([]); setLoadError("No GitHub remote on this folder.");
          return;
        }
        setSlug(s);
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
    <div style={{ padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <label style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>Repo folder</label>
        <select
          value={selectedPath}
          onChange={(e) => setSelectedPath(e.target.value)}
          style={{ ...selectStyle, flex: 1, fontSize: 12 }}
        >
          <option value="">(select)</option>
          {projectPaths.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        {slug && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>{slug}</span>}
      </div>

      {loading && <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>Loading issues…</div>}
      {loadError && <div style={errorStyle}>{loadError}</div>}
      {!loading && !loadError && rows.length === 0 && selectedPath && (
        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>No open issues.</div>
      )}

      {rows.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 4px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <input type="checkbox" checked={allChecked} onChange={(e) => toggleAll(e.target.checked)} />
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
            Select all ({rows.filter((r) => r.enabled).length}/{rows.length})
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
        <input
          type="checkbox"
          checked={row.enabled}
          onChange={(e) => onChange({ enabled: e.target.checked })}
        />
        <button
          onClick={() => onChange({ expanded: !row.expanded })}
          style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", padding: 0 }}
          aria-label="Toggle details"
        >
          {row.expanded ? "▾" : "▸"}
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
        />
        <select
          value={row.model}
          onChange={(e) => onChange({ model: e.target.value })}
          style={selectStyle}
        >
          <option value="">(default)</option>
          {availableModels.map((m) => (
            <option key={m.id} value={m.id}>{m.label || m.id}</option>
          ))}
        </select>
      </div>
      {row.expanded && (
        <textarea
          value={row.prompt}
          onChange={(e) => onChange({ prompt: e.target.value })}
          rows={6}
          style={textareaStyle}
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
    <div style={{ padding: 14 }}>
      {!currentCwd && (
        <div style={noticeStyle}>
          Select a folder in the sidebar before dispatching custom tasks.
        </div>
      )}
      {rows.length === 0 && (
        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, padding: "8px 0" }}>
          No tasks yet.
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
      <button onClick={addRow} style={addBtnStyle}>+ Add task</button>
    </div>
  );
}

function CustomRow({ row, index, availableModels, error, onChange, onRemove }) {
  return (
    <div style={rowStyle(!!error)}>
      <textarea
        placeholder={`Task ${index + 1} prompt…`}
        value={row.prompt}
        onChange={(e) => onChange({ prompt: e.target.value })}
        rows={3}
        style={textareaStyle}
      />
      <div style={rowControlsStyle}>
        <input
          type="text"
          value={row.branch}
          placeholder="branch name"
          onChange={(e) => onChange({ branch: e.target.value })}
          style={inputStyle}
        />
        <select
          value={row.model}
          onChange={(e) => onChange({ model: e.target.value })}
          style={selectStyle}
        >
          <option value="">(default)</option>
          {availableModels.map((m) => (
            <option key={m.id} value={m.id}>{m.label || m.id}</option>
          ))}
        </select>
        <AttachmentPicker
          attachments={row.attachments}
          onChange={(a) => onChange({ attachments: a })}
        />
        <button onClick={onRemove} style={removeBtnStyle} aria-label="Remove row">✕</button>
      </div>
      {error && <div style={errorStyle}>{error}</div>}
    </div>
  );
}

function AttachmentPicker({ attachments, onChange }) {
  // Minimal paperclip that appends image file paths. Integrate with
  // whatever image-attachment pattern NewChatCard.jsx already uses.
  return (
    <label style={{ cursor: "pointer", color: "rgba(255,255,255,0.55)", fontSize: 16 }}>
      📎{attachments.length > 0 ? ` ${attachments.length}` : ""}
      <input
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          onChange([...attachments, ...files]);
          e.target.value = "";
        }}
      />
    </label>
  );
}
function ModelDropdown({ value, onChange, models, label }) {
  return (
    <label style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}>
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ background: "rgba(255,255,255,0.05)", color: "white", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, padding: "4px 6px" }}
      >
        {models.map((m) => (
          <option key={m.id} value={m.id}>{m.label || m.id}</option>
        ))}
      </select>
    </label>
  );
}

// Styles — mirror NewChatCard.jsx conventions
const backdropStyle = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 1000, backdropFilter: "blur(6px)",
};
const cardStyle = {
  width: 820, maxWidth: "90vw", maxHeight: "85vh",
  background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 10, display: "flex", flexDirection: "column",
  color: "white", fontFamily: "system-ui, sans-serif", fontSize: 13,
};
const headerStyle = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)",
};
const titleStyle = { fontSize: 14, fontWeight: 500 };
const closeBtnStyle = {
  background: "none", border: "none", color: "rgba(255,255,255,0.55)",
  cursor: "pointer", padding: 4,
};
const tabsStyle = {
  display: "flex", gap: 4, padding: "10px 14px 0",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
};
const tabBtnStyle = (active) => ({
  display: "flex", gap: 6, alignItems: "center",
  padding: "8px 12px", borderRadius: "6px 6px 0 0",
  background: active ? "rgba(255,255,255,0.06)" : "transparent",
  color: active ? "white" : "rgba(255,255,255,0.55)",
  border: "none", borderBottom: active ? "1px solid white" : "1px solid transparent",
  cursor: "pointer", fontSize: 12,
});
const bodyStyle = { flex: 1, overflow: "auto", padding: 0 };
const footerStyle = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "12px 18px", borderTop: "1px solid rgba(255,255,255,0.06)",
};
const primaryBtnStyle = (enabled) => ({
  padding: "8px 14px", borderRadius: 6, border: "none",
  background: enabled ? "white" : "rgba(255,255,255,0.15)",
  color: enabled ? "black" : "rgba(255,255,255,0.4)",
  cursor: enabled ? "pointer" : "not-allowed",
  fontSize: 12, fontWeight: 500,
});

const noticeStyle = {
  background: "rgba(255,200,150,0.08)", border: "1px solid rgba(255,200,150,0.25)",
  color: "rgba(255,200,150,0.9)", borderRadius: 6, padding: "8px 10px",
  fontSize: 12, marginBottom: 10,
};
const rowStyle = (hasError) => ({
  border: "1px solid " + (hasError ? "rgba(255,180,180,0.4)" : "rgba(255,255,255,0.08)"),
  borderRadius: 8, padding: 10, marginBottom: 10,
  display: "flex", flexDirection: "column", gap: 8,
  background: "rgba(255,255,255,0.02)",
});
const textareaStyle = {
  width: "100%", minHeight: 48, resize: "vertical",
  background: "rgba(255,255,255,0.04)", color: "white",
  border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6,
  padding: "6px 8px", fontSize: 12, fontFamily: "inherit",
};
const rowControlsStyle = { display: "flex", gap: 8, alignItems: "center" };
const inputStyle = {
  flex: 1, background: "rgba(255,255,255,0.04)", color: "white",
  border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6,
  padding: "5px 8px", fontSize: 11, fontFamily: "monospace",
};
const selectStyle = {
  background: "rgba(255,255,255,0.04)", color: "white",
  border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6,
  padding: "5px 6px", fontSize: 11,
};
const removeBtnStyle = {
  background: "none", border: "none", color: "rgba(255,255,255,0.4)",
  cursor: "pointer", fontSize: 13, padding: "4px 6px",
};
const addBtnStyle = {
  background: "none", border: "1px dashed rgba(255,255,255,0.15)",
  color: "rgba(255,255,255,0.6)", borderRadius: 6, padding: "6px 10px",
  cursor: "pointer", fontSize: 12, width: "100%",
};
const errorStyle = {
  color: "rgba(255,180,180,0.9)", fontSize: 11, marginTop: 2,
};
