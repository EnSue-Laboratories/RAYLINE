import type { EffortLevel, ModelDefinition } from "@shared/models";
import ModelPicker from "../ModelPicker";
import DispatchLoadingDots from "./DispatchLoadingDots";
import {
  autoActionsStyle,
  autoErrorStyle,
  autoFillBtnStyle,
  autoPanelHeaderStyle,
  autoPanelStyle,
  autoTextareaStyle,
  autoTitleStyle,
  fieldHoverProps,
} from "./styles";
import type { Translator } from "./translator";

export interface AutoTabProps {
  brief: string;
  setBrief: (brief: string) => void;
  plannerModel: string;
  setPlannerModel: (modelId: string) => void;
  plannerEffort: EffortLevel | null;
  setPlannerEffort: (effort: EffortLevel | null) => void;
  plannerCount: number;
  pickerModels: readonly ModelDefinition[];
  loading: boolean;
  error: string | null;
  onAutoFill: () => void;
  t: Translator;
}

/** "Auto" tab: a brief plus a planner model that drafts the session rows. */
export default function AutoTab({
  brief,
  setBrief,
  plannerModel,
  setPlannerModel,
  plannerEffort,
  setPlannerEffort,
  plannerCount,
  pickerModels,
  loading,
  error,
  onAutoFill,
  t,
}: AutoTabProps) {
  const canFill = Boolean(brief.trim()) && plannerCount > 0 && !loading;
  return (
    <div style={{ padding: "24px 14px 14px" }}>
      <div style={autoPanelStyle}>
        <div style={autoPanelHeaderStyle}>
          <div style={autoTitleStyle}>
            <span>{t("dispatch.autoComposerTitle")}</span>
          </div>
          <ModelPicker
            extraModels={pickerModels}
            ariaLabel={t("dispatch.autoPlannerModel")}
            value={plannerModel}
            onChange={setPlannerModel}
            effort={plannerEffort}
            onEffortChange={setPlannerEffort}
            purpose="planner"
            menuZIndex={1200}
            disabled={loading}
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
          <button type="button" onClick={onAutoFill} disabled={!canFill} style={autoFillBtnStyle(canFill, loading)}>
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
    </div>
  );
}
