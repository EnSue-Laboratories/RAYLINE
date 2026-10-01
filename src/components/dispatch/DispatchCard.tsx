import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import type { DispatchRowInput, DispatchRowResult } from "@shared/chat/types";
import {
  defaultPlannerModel,
  getAvailableModels,
  isPlannerModel,
  visibleModels,
  type EffortLevel,
  type ModelDefinition,
} from "@shared/models";
import { useTranslator } from "../../contexts/LocaleContext";
import AutoTab from "./AutoTab";
import CustomTab from "./CustomTab";
import DispatchLoadingDots from "./DispatchLoadingDots";
import ModelPicker from "../ModelPicker";
import {
  buildDispatchPayload,
  buildModelPayload,
  cleanDispatchPlanError,
  dynamicModelsOf,
  resolvePlannerModelId,
  rowsFromPlan,
  summarizeDispatch,
  validateRows,
  type DispatchRow,
} from "./plan";
import {
  backdropStyle,
  bodyStyle,
  cardStyle,
  closeBtnStyle,
  footerStyle,
  headerStyle,
  headerTextStyle,
  primaryBtnStyle,
  subtitleStyle,
  tabBtnStyle,
  tabsStyle,
  titleStyle,
} from "./styles";
import { createTranslator } from "./translator";

export interface DispatchResponse {
  dispatchId?: string;
  results: DispatchRowResult[];
}

export interface DispatchCardProps {
  onClose: () => void;
  onDispatch: (rows: DispatchRowInput[]) => Promise<DispatchResponse>;
  currentCwd?: string;
  defaultModel?: string;
  /** Effort of the default model (null = model default). */
  defaultEffort?: EffortLevel | null;
  /** Built-in + dynamic models (App's `getAvailableModels(...)`). */
  availableModels?: readonly ModelDefinition[];
  /** Dynamic models only (#230 shape); used when `availableModels` is absent. */
  extraModels?: readonly ModelDefinition[];
  locale?: string;
}

type DispatchTab = "auto" | "custom";

const NO_MODELS: readonly ModelDefinition[] = [];

export default function DispatchCard({
  onClose,
  onDispatch,
  currentCwd,
  defaultModel = "sonnet",
  defaultEffort = null,
  availableModels,
  extraModels = NO_MODELS,
  locale,
}: DispatchCardProps) {
  const contextT = useTranslator();
  const t = locale ? createTranslator(locale) : contextT;
  const allModels = useMemo(() => availableModels ?? getAvailableModels(extraModels), [availableModels, extraModels]);
  const pickerModels = useMemo(() => (availableModels ? dynamicModelsOf(availableModels) : extraModels), [availableModels, extraModels]);

  const [tab, setTab] = useState<DispatchTab>("auto");
  const [globalModel, setGlobalModel] = useState(defaultModel);
  const [globalEffort, setGlobalEffort] = useState<EffortLevel | null>(defaultEffort);
  const [customRows, setCustomRows] = useState<DispatchRow[]>([]);
  const [autoBrief, setAutoBrief] = useState("");
  const [plannerSelection, setPlannerSelection] = useState(() => defaultPlannerModel(allModels, defaultModel));
  const [plannerEffort, setPlannerEffort] = useState<EffortLevel | null>(null);
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoError, setAutoError] = useState<string | null>(null);
  const [autoNote, setAutoNote] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);

  // Hidden / unavailable models stay listed only while something selects them.
  const models = useMemo(
    () => visibleModels(allModels, {}, [defaultModel, globalModel, plannerSelection, ...customRows.map((row) => row.model)]),
    [allModels, defaultModel, globalModel, plannerSelection, customRows],
  );
  const plannerCount = useMemo(() => models.filter(isPlannerModel).length, [models]);

  // Derived instead of reset in an effect: a vanished / non-planner
  // selection falls back to the default planner (legacy ids normalize).
  const autoPlannerModel = resolvePlannerModelId(models, plannerSelection, defaultModel);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Open menus consume Escape first (useDismissibleLayer); ignore IME.
      if (e.key === "Escape" && !e.defaultPrevented && !e.isComposing && e.keyCode !== 229) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The banner describes the last dispatch; leaving the tab clears it.
  const switchTab = useCallback((next: DispatchTab) => {
    if (next !== tab) setBanner(null);
    setTab(next);
  }, [tab]);

  const canDispatch = tab === "custom" && customRows.length > 0 && !submitting && Boolean(currentCwd);

  const handleAutoFill = useCallback(async () => {
    const brief = autoBrief.trim();
    if (!brief) {
      setAutoError(t("dispatch.autoErrorBriefEmpty"));
      return;
    }
    if (typeof window.api?.dispatchPlan !== "function") {
      setAutoError(t("dispatch.autoErrorUnavailable"));
      return;
    }
    const plannerModel = models.find((m) => m.id === autoPlannerModel && isPlannerModel(m)) ?? models.find(isPlannerModel);
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
        plannerModel: buildModelPayload(plannerModel, { includeRuntimeConfig: true, effort: plannerEffort }),
        targetModels: models.map((m) => buildModelPayload(m)),
        defaultTargetModel: globalModel,
      });
      const rows = rowsFromPlan(result?.rows ?? [], new Set(models.map((m) => m.id)));
      if (rows.length === 0) {
        setAutoError(t("dispatch.autoErrorNoRows"));
        return;
      }
      setCustomRows(rows);
      setErrors({});
      setAutoNote(t("dispatch.autoFilled", { count: rows.length }));
      switchTab("custom");
    } catch (e) {
      setAutoError(cleanDispatchPlanError(e, t("dispatch.autoErrorFailed")));
    } finally {
      setAutoLoading(false);
    }
  }, [autoBrief, autoPlannerModel, currentCwd, globalModel, models, plannerEffort, switchTab, t]);

  const handleSubmit = useCallback(async () => {
    if (tab !== "custom" || !currentCwd) return;
    const rowsToRun = customRows;
    const rowErrors = validateRows(rowsToRun, t);
    if (Object.keys(rowErrors).length) {
      setErrors(rowErrors);
      return;
    }
    setErrors({});
    setBanner(null);
    setSubmitting(true);

    const payload = buildDispatchPayload(rowsToRun, { model: globalModel, effort: globalEffort, cwd: currentCwd });
    let results: DispatchRowResult[];
    try {
      ({ results } = await onDispatch(payload));
    } catch (error) {
      console.error("[DispatchCard] dispatch failed", error);
      setBanner(t("dispatch.errorDispatchFailed"));
      return;
    } finally {
      setSubmitting(false);
    }

    const outcome = summarizeDispatch(rowsToRun, results, t("dispatch.errorDispatchFailed"));
    if (outcome.failed === 0) {
      setBanner(null);
      onClose();
      return;
    }
    setErrors(outcome.errors);
    setBanner(t("dispatch.banner", { success: outcome.succeeded, total: results.length, failed: outcome.failed }));
    setCustomRows((prev) => prev.filter((r) => !outcome.successBranches.has(r.branch.trim())));
  }, [tab, customRows, currentCwd, globalModel, globalEffort, onDispatch, onClose, t]);

  const rowCount = tab === "custom" ? customRows.length : 0;

  return (
    <div style={backdropStyle}>
      <div role="dialog" aria-modal="true" aria-label={t("dispatch.title")} style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <header style={headerStyle}>
          <div style={headerTextStyle}>
            <div style={titleStyle}>{t("dispatch.title")}</div>
            <div style={subtitleStyle}>{t("dispatch.subtitle")}</div>
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
          <TabBtn active={tab === "auto"} onClick={() => switchTab("auto")}>{t("dispatch.tabAuto")}</TabBtn>
          <TabBtn active={tab === "custom"} onClick={() => switchTab("custom")}>{t("dispatch.tabMenu")}</TabBtn>
        </div>

        <div style={bodyStyle}>
          {tab === "auto" ? (
            <AutoTab
              brief={autoBrief}
              setBrief={setAutoBrief}
              plannerModel={autoPlannerModel}
              setPlannerModel={setPlannerSelection}
              plannerEffort={plannerEffort}
              setPlannerEffort={setPlannerEffort}
              plannerCount={plannerCount}
              pickerModels={pickerModels}
              loading={autoLoading}
              error={autoError}
              onAutoFill={() => { void handleAutoFill(); }}
              t={t}
            />
          ) : (
            <CustomTab
              rows={customRows}
              setRows={setCustomRows}
              currentCwd={currentCwd}
              pickerModels={pickerModels}
              globalModel={globalModel}
              errors={errors}
              autoNote={autoNote}
              t={t}
            />
          )}
        </div>

        {tab === "custom" && (
          <footer style={footerStyle}>
            <ModelPicker
              extraModels={pickerModels}
              ariaLabel={t("dispatch.defaultModel")}
              value={globalModel}
              onChange={setGlobalModel}
              effort={globalEffort}
              onEffortChange={setGlobalEffort}
              menuZIndex={1200}
            />
            <button onClick={() => { void handleSubmit(); }} disabled={!canDispatch} style={primaryBtnStyle(canDispatch, submitting)}>
              <span style={{ visibility: submitting ? "hidden" : "visible" }}>
                {t(rowCount === 1 ? "dispatch.dispatchOne" : "dispatch.dispatchMany", { count: rowCount })}
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

interface TabBtnProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}

function TabBtn({ active, onClick, children }: TabBtnProps) {
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
