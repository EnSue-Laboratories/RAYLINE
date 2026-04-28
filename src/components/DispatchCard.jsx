import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { X, ChevronDown, Paperclip, Plus } from "lucide-react";
import ImagePreview from "./ImagePreview";
import { createTranslator } from "../i18n";

const onFieldHoverIn = (e) => { e.currentTarget.style.borderColor = "var(--control-bg-active)"; };
const onFieldHoverOut = (e) => { e.currentTarget.style.borderColor = "var(--control-bg)"; };
const fieldHoverProps = {
  onMouseEnter: onFieldHoverIn,
  onMouseLeave: onFieldHoverOut,
  onFocus: onFieldHoverIn,
  onBlur: onFieldHoverOut,
};

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

function sanitizeBranchName(text, fallbackIndex) {
  const slug = (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "")
    .slice(0, 48);
  return slug || defaultCustomBranch(fallbackIndex);
}

function uniqueBranchName(base, used) {
  let next = base;
  let i = 2;
  while (used.has(next)) {
    const suffix = `-${i}`;
    next = `${base.slice(0, Math.max(1, 48 - suffix.length))}${suffix}`;
    i += 1;
  }
  used.add(next);
  return next;
}

function makeCustomRowFromPlan(plan, index, validModelIds, usedBranches) {
  const branchBase = sanitizeBranchName(plan.branch || plan.title || plan.prompt, index);
  return {
    key: "r" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
    prompt: String(plan.prompt || plan.title || "").trim(),
    branch: uniqueBranchName(branchBase, usedBranches),
    model: validModelIds.has(plan.model) ? plan.model : "",
    attachments: [],
  };
}

function getDefaultPlannerModelId(availableModels, defaultModel) {
  const plannerModels = (availableModels || []).filter((m) => (
    m.provider === "claude" || m.provider === "codex" || m.provider === "opencode"
  ));
  if (plannerModels.some((m) => m.id === defaultModel)) return defaultModel;
  return plannerModels.find((m) => m.id === "gpt55-med")?.id
    || plannerModels.find((m) => m.provider === "claude" && m.id === "sonnet")?.id
    || plannerModels[0]?.id
    || "";
}

function modelPayload(model, options = {}) {
  if (!model) return null;
  const includeRuntimeConfig = Boolean(options?.includeRuntimeConfig);
  const payload = {
    id: model.id,
    name: model.name || model.label || model.id,
    tag: model.tag,
    provider: model.provider,
    cliFlag: model.cliFlag,
    effort: model.effort,
    thinking: model.thinking,
  };
  if (includeRuntimeConfig && model.provider === "opencode") {
    payload.openCodeConfig = {
      providerId: typeof model.providerId === "string" ? model.providerId : "",
      modelId: typeof model.modelId === "string" ? model.modelId : "",
      apiKey: typeof model.apiKey === "string" ? model.apiKey : "",
      baseURL: typeof model.baseURL === "string" ? model.baseURL : "",
    };
  }
  return payload;
}

function cleanDispatchPlanError(error, fallback) {
  const raw = error?.message || String(error || "") || fallback;
  return raw.replace(/^Error invoking remote method 'dispatch-plan':\s*/i, "") || fallback;
}

export default function DispatchCard({
  onClose,
  onDispatch,
  currentCwd,
  defaultModel = "sonnet",
  availableModels = [],
  locale,
}) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const [tab, setTab] = useState("auto"); // "auto" | "custom"
  const [globalModel, setGlobalModel] = useState(defaultModel);
  const [customRows, setCustomRows] = useState([]);
  const [autoBrief, setAutoBrief] = useState("");
  const [autoPlannerModel, setAutoPlannerModel] = useState(() =>
    getDefaultPlannerModelId(availableModels, defaultModel)
  );
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoError, setAutoError] = useState(null);
  const [autoNote, setAutoNote] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({}); // rowKey -> message
  const [banner, setBanner] = useState(null);

  const plannerModels = useMemo(
    () => (availableModels || []).filter((m) => (
      m.provider === "claude" || m.provider === "codex" || m.provider === "opencode"
    )),
    [availableModels]
  );

  useEffect(() => {
    if (!plannerModels.length) return;
    if (plannerModels.some((m) => m.id === autoPlannerModel)) return;
    setAutoPlannerModel(getDefaultPlannerModelId(availableModels, defaultModel));
  }, [plannerModels, autoPlannerModel, availableModels, defaultModel]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    setBanner(null);
  }, [tab]);

  const activeRows = tab === "custom" ? customRows : [];
  const canDispatch = activeRows.length > 0 && !submitting
    && tab === "custom" && !!currentCwd;

  const handleAutoFill = useCallback(async () => {
    const brief = autoBrief.trim();
    if (!brief) {
      setAutoError(t("dispatch.autoErrorBriefEmpty"));
      return;
    }
    if (!window.api?.dispatchPlan) {
      setAutoError(t("dispatch.autoErrorUnavailable"));
      return;
    }

    const plannerModel = plannerModels.find((m) => m.id === autoPlannerModel) || plannerModels[0];
    if (!plannerModel) {
      setAutoError(t("dispatch.autoErrorNoPlanner"));
      return;
    }

    setAutoLoading(true);
    setAutoError(null);
    setAutoNote(null);
    try {
      const result = await window.api.dispatchPlan({
        instructions: brief,
        cwd: currentCwd,
        plannerModel: modelPayload(plannerModel, { includeRuntimeConfig: true }),
        targetModels: availableModels.map(modelPayload).filter(Boolean),
        defaultTargetModel: globalModel,
      });
      const validModelIds = new Set(availableModels.map((m) => m.id));
      const usedBranches = new Set();
      const rows = (result?.rows || [])
        .map((row, index) => makeCustomRowFromPlan(row, index, validModelIds, usedBranches))
        .filter((row) => row.prompt.trim());

      if (rows.length === 0) {
        setAutoError(t("dispatch.autoErrorNoRows"));
        return;
      }

      setCustomRows(rows);
      setErrors({});
      setAutoNote(t("dispatch.autoFilled", { count: rows.length }));
      setTab("custom");
    } catch (e) {
      setAutoError(cleanDispatchPlanError(e, t("dispatch.autoErrorFailed")));
    } finally {
      setAutoLoading(false);
    }
  }, [autoBrief, autoPlannerModel, plannerModels, currentCwd, availableModels, globalModel, t]);

  const handleSubmit = useCallback(async () => {
    if (tab === "auto") return;
    const rowsToRun = customRows;

    const rowErrors = {};
    const seenBranches = new Set();
    for (const r of rowsToRun) {
      const trimmed = r.branch?.trim();
      if (!r.prompt?.trim()) rowErrors[r.key] = t("dispatch.errorPromptEmpty");
      else if (!trimmed) rowErrors[r.key] = t("dispatch.errorBranchEmpty");
      else if (seenBranches.has(trimmed)) rowErrors[r.key] = t("dispatch.errorBranchDuplicate");
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
      if (key) keyedErrors[key] = f.error?.message || t("dispatch.errorDispatchFailed");
    }
    setErrors(keyedErrors);
    setBanner(t("dispatch.banner", {
      success: results.length - failed.length,
      total: results.length,
      failed: failed.length,
    }));

    const successBranches = new Set(results.filter((x) => x.ok).map((x) => x.row.branch));
    setCustomRows((prev) => prev.filter((r) => !successBranches.has(r.branch.trim())));
  }, [tab, customRows, currentCwd, globalModel, onDispatch, onClose, t]);

  return (
    <div style={backdropStyle}>
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <header style={headerStyle}>
          <div style={headerTextStyle}>
            <div style={titleStyle}>{t("dispatch.title")}</div>
            <div style={subtitleStyle}>
              {t("dispatch.subtitle")}
            </div>
          </div>
          <button onClick={onClose} style={closeBtnStyle} aria-label={t("dispatch.close")}>
            <X size={16} />
          </button>
        </header>

        {banner && (
          <div role="status" aria-live="polite" style={{ background: "var(--warning-bg-strong)", color: "var(--warning-text)", padding: "8px 14px", fontSize: 12 }}>
            {banner}
          </div>
        )}

        <div style={tabsStyle} role="tablist">
          <TabBtn active={tab === "auto"} onClick={() => setTab("auto")}>
            {t("dispatch.tabAuto")}
          </TabBtn>
          <TabBtn active={tab === "custom"} onClick={() => setTab("custom")}>
            {t("dispatch.tabMenu")}
          </TabBtn>
        </div>

        <div style={bodyStyle}>
          {tab === "auto" ? (
            <AutoTab
              autoBrief={autoBrief}
              setAutoBrief={setAutoBrief}
              autoPlannerModel={autoPlannerModel}
              setAutoPlannerModel={setAutoPlannerModel}
              plannerModels={plannerModels}
              autoLoading={autoLoading}
              autoError={autoError}
              onAutoFill={handleAutoFill}
              t={t}
            />
          ) : (
            <CustomTab
              rows={customRows}
              setRows={setCustomRows}
              currentCwd={currentCwd}
              availableModels={availableModels}
              errors={errors}
              autoNote={autoNote}
              t={t}
            />
          )}
        </div>

        {tab !== "auto" && (
          <footer style={footerStyle}>
            <DispatchDropdown
              ariaLabel={t("dispatch.defaultModel")}
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
              style={primaryBtnStyle(canDispatch, submitting)}
            >
              <span style={{ visibility: submitting ? "hidden" : "visible" }}>
                {t(activeRows.length === 1 ? "dispatch.dispatchOne" : "dispatch.dispatchMany", { count: activeRows.length || 0 })}
              </span>
              {submitting && (
                <span style={{ position: "absolute", inset: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                  <DispatchLoadingDots ariaLabel={t("dispatch.dispatching")} />
                </span>
              )}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}

function DispatchLoadingDots({ ariaLabel }) {
  const dot = (delay) => ({
    width: 5,
    height: 5,
    borderRadius: "50%",
    background: "var(--loading-dot-bg)",
    display: "inline-block",
    animation: `dotPulse 1.2s ease-in-out ${delay} infinite`,
  });
  return (
    <span
      aria-label={ariaLabel || "Dispatching"}
      style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "0 2px" }}
    >
      <span style={dot("0s")} />
      <span style={dot("0.16s")} />
      <span style={dot("0.32s")} />
    </span>
  );
}

function TabBtn({ active, onClick, children }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={tabBtnStyle(active, hovered)}
    >
      {children}
    </button>
  );
}

function AutoTab({
  autoBrief,
  setAutoBrief,
  autoPlannerModel,
  setAutoPlannerModel,
  plannerModels,
  autoLoading,
  autoError,
  onAutoFill,
  t,
}) {
  return (
    <div style={{ padding: "24px 14px 14px" }}>
      <AutoComposer
        brief={autoBrief}
        setBrief={setAutoBrief}
        plannerModel={autoPlannerModel}
        setPlannerModel={setAutoPlannerModel}
        plannerModels={plannerModels}
        loading={autoLoading}
        error={autoError}
        onAutoFill={onAutoFill}
        t={t}
      />
    </div>
  );
}

function CustomTab({
  rows,
  setRows,
  currentCwd,
  availableModels,
  errors,
  autoNote,
  t,
}) {
  const addRow = () => setRows((prev) => [...prev, makeCustomRow(prev.length)]);
  const removeRow = (key) => setRows((prev) => prev.filter((r) => r.key !== key));
  const updateRow = (key, patch) => setRows((prev) =>
    prev.map((r) => (r.key === key ? { ...r, ...patch } : r))
  );
  const [issues, setIssues] = useState([]);
  const [issuesLoading, setIssuesLoading] = useState(false);
  const [issuesError, setIssuesError] = useState(null);

  useEffect(() => {
    if (!currentCwd || !window.api?.gitRemoteSlug || !window.api?.ghListIssues) {
      setIssues([]);
      setIssuesError(null);
      setIssuesLoading(false);
      return;
    }

    let cancelled = false;
    setIssuesLoading(true);
    setIssuesError(null);
    (async () => {
      try {
        const slug = await window.api.gitRemoteSlug(currentCwd);
        if (cancelled) return;
        if (!slug) {
          setIssues([]);
          return;
        }
        const loaded = await window.api.ghListIssues(slug, "open");
        if (!cancelled) setIssues(Array.isArray(loaded) ? loaded : []);
      } catch (e) {
        if (!cancelled) {
          setIssues([]);
          setIssuesError(e?.message || t("dispatch.failedToLoadIssues"));
        }
      } finally {
        if (!cancelled) setIssuesLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [currentCwd, t]);

  const issueOptions = useMemo(
    () => issueOptionsWithDefault(issues, issuesLoading, issuesError, t),
    [issues, issuesLoading, issuesError, t]
  );

  return (
    <div style={{ padding: "24px 14px 14px" }}>
      {!currentCwd && (
        <div style={noticeStyle}>
          {t("dispatch.selectFolderNotice")}
        </div>
      )}
      {autoNote && (
        <div style={autoNoteStyle}>{autoNote}</div>
      )}
      {rows.map((r, i) => (
        <CustomRow
          key={r.key}
          row={r}
          index={i}
          availableModels={availableModels}
          issueOptions={issueOptions}
          issues={issues}
          error={errors[r.key]}
          onChange={(patch) => updateRow(r.key, patch)}
          onRemove={() => removeRow(r.key)}
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

function AutoComposer({
  brief,
  setBrief,
  plannerModel,
  setPlannerModel,
  plannerModels,
  loading,
  error,
  onAutoFill,
  t,
}) {
  const canFill = !!brief.trim() && plannerModels.length > 0 && !loading;
  return (
    <div style={autoPanelStyle}>
      <div style={autoPanelHeaderStyle}>
        <div style={autoTitleStyle}>
          <span>{t("dispatch.autoComposerTitle")}</span>
        </div>
        <DispatchDropdown
          ariaLabel={t("dispatch.autoPlannerModel")}
          value={plannerModel}
          onChange={setPlannerModel}
          options={plannerModels.map((m) => ({
            value: m.id,
            label: m.name || m.label || m.id,
            triggerLabel: m.tag || m.label || m.id,
            sublabel: m.tag,
            group: (m.provider || "MODEL").toUpperCase(),
          }))}
          grouped
        />
      </div>
      <textarea
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        placeholder={t("dispatch.autoBriefPlaceholder")}
        rows={7}
        style={autoTextareaStyle}
        {...fieldHoverProps}
      />
      {error && <div style={autoErrorStyle}>{error}</div>}
      <div style={autoActionsStyle}>
        <button
          type="button"
          onClick={onAutoFill}
          disabled={!canFill}
          style={autoFillBtnStyle(canFill, loading)}
        >
          <span style={{ visibility: loading ? "hidden" : "visible", display: "inline-flex", alignItems: "center", gap: 6 }}>
            {t("dispatch.autoFill")}
          </span>
          {loading && (
            <span style={{ position: "absolute", inset: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <DispatchLoadingDots ariaLabel={t("dispatch.autoFilling")} />
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

function CustomRow({ row, index, availableModels, issueOptions, issues, error, onChange, onRemove, t }) {
  const attachments = row.attachments || [];

  const addAttachments = (items) => {
    if (!items.length) return;
    onChange({ attachments: [...attachments, ...items] });
  };

  const removeAttachment = (i) => {
    onChange({ attachments: attachments.filter((_, idx) => idx !== i) });
  };

  const handleIssueChange = (value) => {
    const issue = issues.find((iss) => String(iss.number) === value);
    onChange({ issue: issue || undefined });
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
        placeholder={t("dispatch.sessionPromptPlaceholder", { number: index + 1 })}
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
          placeholder={t("dispatch.branchNamePlaceholder")}
          onChange={(e) => onChange({ branch: e.target.value })}
          style={customBranchStyle}
        />
        <span style={customDividerStyle} aria-hidden />
        <DispatchDropdown
          compact
          ariaLabel={t("dispatch.attachIssue")}
          value={row.issue?.number ? String(row.issue.number) : ""}
          onChange={handleIssueChange}
          options={issueOptions}
          grouped
        />
        <span style={customDividerStyle} aria-hidden />
        <DispatchDropdown
          compact
          ariaLabel={t("dispatch.modelForSession", { number: index + 1 })}
          value={row.model}
          onChange={(v) => onChange({ model: v })}
          options={modelOptionsWithDefault(availableModels, t)}
          grouped
        />
        <span style={customDividerStyle} aria-hidden />
        <AttachmentPicker
          attachments={row.attachments}
          onChange={(a) => onChange({ attachments: a })}
        />
        <RemoveRowButton onClick={onRemove} t={t} />
      </div>
      {error && <div style={customErrorStyle}>{error}</div>}
    </div>
  );
}

function RemoveRowButton({ onClick, t }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={t ? t("dispatch.removeRow") : "Remove row"}
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

function AttachmentPicker({ attachments, onChange }) {
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
  const [hovered, setHovered] = useState(false);
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
        padding: "3px 6px",
        background: "transparent",
        border: "1px solid " + (hovered ? "var(--control-bg-active)" : "var(--control-bg)"),
        borderRadius: 6,
        color: selected ? "var(--text-secondary)" : "var(--text-muted)",
        fontSize: 10,
        fontFamily: "var(--font-mono)",
        letterSpacing: ".06em",
        cursor: "pointer",
        outline: "none",
        transition: "border-color .2s",
      }
    : {
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 6,
        padding: fullWidth ? "12px 12px" : "6px 10px",
        background: "var(--control-bg-subtle)",
        border: "1px solid var(--control-bg)",
        borderRadius: 7,
        color: selected ? "var(--text-secondary)" : "var(--text-muted)",
        fontSize: fullWidth ? 11 : 10,
        fontFamily: "var(--font-mono)",
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
        onMouseEnter={compact
          ? () => setHovered(true)
          : (e) => { e.currentTarget.style.borderColor = "var(--control-bg-active)"; }}
        onMouseLeave={compact
          ? () => setHovered(false)
          : (e) => { e.currentTarget.style.borderColor = "var(--control-bg)"; }}
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
            background: "var(--pane-elevated)",
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
              {gi > 0 && <div style={{ height: 1, background: "var(--control-bg)", margin: "4px 8px" }} />}
              {groupLabel && (
                <div style={{ padding: gi === 0 ? "6px 10px 2px" : "4px 10px 2px", fontSize: 8, color: "var(--text-disabled)", letterSpacing: ".12em", fontFamily: "var(--font-mono)", textTransform: "uppercase" }}>
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
                    background: opt.value === value ? "var(--control-bg)" : "transparent",
                    border: "none", borderRadius: 7,
                    color: opt.value === value ? "var(--text-primary)" : "var(--text-secondary)",
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    cursor: "pointer", textAlign: "left",
                    transition: "background .12s, color .12s",
                  }}
                  onMouseEnter={(e) => { if (opt.value !== value) e.currentTarget.style.background = "var(--control-bg)"; }}
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

function modelOptionsWithDefault(availableModels, t) {
  const defaultLabel = t ? t("dispatch.modelDefault") : "(default)";
  const inheritGroup = t ? t("dispatch.inheritGroup") : "INHERIT";
  return [
    { value: "", label: defaultLabel, group: inheritGroup },
    ...availableModels.map((m) => ({
      value: m.id,
      label: m.name || m.label || m.id,
      triggerLabel: m.tag || m.label || m.id,
      sublabel: m.tag,
      group: (m.provider || "MODEL").toUpperCase(),
    })),
  ];
}

function issueOptionsWithDefault(issues, loading, error, t) {
  const issueGroup = t ? t("dispatch.issueGroup") : "ISSUE";
  const options = [
    {
      value: "",
      label: t ? t("dispatch.noIssue") : "No issue",
      triggerLabel: t ? t("dispatch.noIssueShort") : "Issue",
      group: issueGroup,
    },
  ];

  if (loading) {
    options.push({
      value: "__loading",
      label: t ? t("dispatch.loadingIssues") : "Loading issues...",
      triggerLabel: "...",
      group: issueGroup,
    });
    return options;
  }

  if (error) {
    options.push({
      value: "__error",
      label: error,
      triggerLabel: t ? t("dispatch.noIssueShort") : "Issue",
      group: issueGroup,
    });
    return options;
  }

  return [
    ...options,
    ...(issues || []).map((issue) => ({
      value: String(issue.number),
      label: `#${issue.number} ${issue.title}`,
      triggerLabel: `#${issue.number}`,
      sublabel: "ISSUE",
      group: issueGroup,
    })),
  ];
}

// Styles — mirror NewChatCard.jsx conventions
const backdropStyle = {
  position: "fixed", inset: 0, background: "var(--overlay-bg)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 1000, backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
};
const cardStyle = {
  width: 820, maxWidth: "90vw", maxHeight: "85vh",
  background: "var(--pane-elevated)",
  backdropFilter: "blur(48px) saturate(1.2)",
  WebkitBackdropFilter: "blur(48px) saturate(1.2)",
  border: "1px solid var(--pane-border)",
  borderRadius: 12, display: "flex", flexDirection: "column",
  color: "var(--text-primary)", fontFamily: "var(--font-ui)", fontSize: 13,
  boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
};
const headerStyle = {
  display: "flex", justifyContent: "space-between", alignItems: "flex-start",
  gap: 12,
  padding: "14px 18px", borderBottom: "1px solid var(--pane-border)",
};
const headerTextStyle = { display: "flex", flexDirection: "column", gap: 5, minWidth: 0 };
const titleStyle = { fontSize: 14, fontWeight: 500 };
const subtitleStyle = {
  fontSize: 11,
  color: "var(--text-muted)",
  lineHeight: 1.45,
};
const closeBtnStyle = {
  background: "none", border: "none", color: "var(--text-secondary)",
  cursor: "pointer", padding: 4,
};
const tabsStyle = {
  display: "flex", alignItems: "flex-end", gap: 4, padding: "10px 14px 0",
  borderBottom: "1px solid var(--pane-border)",
};
const tabBtnStyle = (active, hovered) => ({
  display: "flex", gap: 6, alignItems: "center",
  padding: "8px 12px", borderRadius: "6px 6px 0 0",
  background: active ? "var(--pane-hover)" : "transparent",
  color: active
    ? "var(--text-primary)"
    : hovered ? "var(--text-primary)" : "var(--text-secondary)",
  border: "none", borderBottom: active ? "1px solid var(--text-primary)" : "1px solid transparent",
  cursor: "pointer", fontSize: 12,
  transition: "color .2s",
});
const bodyStyle = { flex: 1, overflow: "auto", padding: 0 };
const footerStyle = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "12px 18px", borderTop: "1px solid var(--pane-border)",
};
const primaryBtnStyle = (enabled, loading) => ({
  position: "relative",
  padding: "8px 14px", borderRadius: 6, border: "none",
  background: loading ? "var(--text-primary)" : (enabled ? "var(--text-primary)" : "var(--control-bg-active)"),
  color: loading ? "var(--text-inverse)" : (enabled ? "var(--text-inverse)" : "var(--text-muted)"),
  cursor: loading ? "progress" : (enabled ? "pointer" : "not-allowed"),
  fontSize: 12, fontWeight: 500,
  display: "inline-flex", alignItems: "center", justifyContent: "center",
});

const noticeStyle = {
  background: "var(--warning-bg)", border: "1px solid var(--warning-border)",
  color: "var(--warning-text)", borderRadius: 6, padding: "8px 10px",
  fontSize: 12, marginBottom: 10,
};
const addBtnStyle = {
  display: "inline-flex", alignItems: "center", gap: 6,
  background: "transparent",
  border: "none",
  color: "var(--text-muted)",
  padding: "6px 8px",
  borderRadius: 6,
  marginTop: 2,
  cursor: "pointer", fontSize: 11,
  fontFamily: "var(--font-mono)",
  letterSpacing: ".06em",
  transition: "color .15s, background .15s",
};

const autoNoteStyle = {
  color: "var(--text-secondary)",
  fontSize: 11,
  fontFamily: "var(--font-mono)",
  marginBottom: 10,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
const autoPanelStyle = {
  border: "1px solid var(--control-bg-strong)",
  borderRadius: 8,
  background: "var(--control-bg-subtle)",
  overflow: "hidden",
};
const autoPanelHeaderStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  padding: "10px 12px",
  borderBottom: "1px solid var(--control-bg-strong)",
};
const autoTitleStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  color: "var(--text-primary)",
  fontSize: 12,
  fontWeight: 500,
};
const autoTextareaStyle = {
  width: "100%",
  minHeight: 132,
  resize: "vertical",
  background: "var(--control-bg-contrast)",
  color: "var(--text-primary)",
  border: "1px solid var(--control-bg)",
  borderRadius: 7,
  padding: "11px 12px",
  fontSize: 12,
  fontFamily: "inherit",
  lineHeight: 1.45,
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color .2s",
};
const autoErrorStyle = {
  color: "var(--danger-text-strong)",
  fontSize: 11,
  padding: "9px 12px 0",
};
const autoActionsStyle = {
  display: "flex",
  justifyContent: "flex-end",
  padding: 12,
};
const autoFillBtnStyle = (enabled, loading) => ({
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 60,
  padding: "8px 12px",
  borderRadius: 6,
  border: "none",
  background: loading ? "var(--text-primary)" : (enabled ? "var(--text-primary)" : "var(--control-border)"),
  color: loading ? "var(--text-inverse)" : (enabled ? "var(--text-inverse)" : "var(--text-muted)"),
  cursor: loading ? "progress" : (enabled ? "pointer" : "not-allowed"),
  fontSize: 12,
  fontWeight: 500,
});

const customRowStyle = (hasError) => ({
  border: "1px solid " + (hasError ? "var(--danger-border-strong)" : "var(--pane-border)"),
  borderRadius: 8,
  marginBottom: 10,
  background: "var(--control-bg-subtle)",
  overflow: "hidden",
  transition: "border-color .2s",
});
const customTextareaStyle = {
  width: "100%",
  minHeight: 72,
  resize: "vertical",
  background: "transparent",
  color: "var(--text-primary)",
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
  borderTop: "1px solid var(--control-bg)",
  background: "var(--control-bg-subtle)",
};
const customBranchStyle = {
  flex: 1,
  minWidth: 0,
  background: "transparent",
  color: "var(--text-secondary)",
  border: "none",
  padding: "4px 0",
  fontSize: 10,
  fontFamily: "var(--font-mono)",
  letterSpacing: ".06em",
  outline: "none",
};
const customDividerStyle = {
  width: 1, height: 12,
  background: "var(--control-bg-strong)",
  flexShrink: 0,
};
const customErrorStyle = {
  color: "var(--danger-text-strong)", fontSize: 11,
  padding: "0 12px 8px",
};
