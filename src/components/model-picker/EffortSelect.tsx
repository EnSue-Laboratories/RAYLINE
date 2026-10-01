import { memo } from "react";
import { ChevronDown } from "lucide-react";
import { isEffortLevel, type EffortLevel, type ModelDefinition } from "@shared/models";
import type { FontScale } from "../../contexts/FontSizeContext";
import type { Translator } from "../../i18n";
import { displayedEffort, getEffortOptions } from "./catalogView";
import { effortLabel, pickerText } from "./strings";

interface EffortSelectProps {
  s: FontScale;
  t: Translator;
  model: Pick<ModelDefinition, "efforts" | "defaultEffort" | "effort">;
  /** null = the model's default (no flag is passed to the CLI). */
  effort: EffortLevel | null;
  onEffortChange: (effort: EffortLevel | null) => void;
  compact?: boolean;
  disabled?: boolean;
}

const DEFAULT_VALUE = "";

/**
 * Per-conversation reasoning effort for the selected model. A native select:
 * keyboard, screen-reader and type-ahead behavior come for free.
 */
export const EffortSelect = memo(function EffortSelect({
  s,
  t,
  model,
  effort,
  onEffortChange,
  compact = false,
  disabled = false,
}: EffortSelectProps) {
  const options = getEffortOptions(model);
  if (options.length === 0) return null;
  const label = pickerText(t, "modelPicker.effort");
  // An explicit choice the model can't take is shown clamped, as it will be sent.
  const value = effort ? (displayedEffort(model, effort) ?? DEFAULT_VALUE) : DEFAULT_VALUE;
  const defaultLabel = model.defaultEffort
    ? pickerText(t, "modelPicker.effortDefault", { effort: effortLabel(t, model.defaultEffort) })
    : pickerText(t, "modelPicker.effortDefault", { effort: "—" });

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", flexShrink: 0 }}>
      <select
        aria-label={label}
        title={label}
        value={value}
        disabled={disabled}
        data-effort-select="true"
        onChange={(e) => onEffortChange(isEffortLevel(e.target.value) ? e.target.value : null)}
        style={{
          appearance: "none",
          WebkitAppearance: "none",
          MozAppearance: "none",
          padding: compact ? "3px 20px 3px 6px" : "4px 22px 4px 10px",
          background: "var(--control-bg)",
          border: "1px solid var(--control-border)",
          borderRadius: 7,
          color: "var(--text-secondary)",
          fontSize: s(10),
          fontFamily: "var(--font-mono)",
          cursor: disabled ? "default" : "pointer",
          outline: "none",
          maxWidth: 140,
        }}
      >
        <option value={DEFAULT_VALUE}>{defaultLabel}</option>
        {options.map((level) => (
          <option key={level} value={level}>
            {effortLabel(t, level)}
          </option>
        ))}
      </select>
      <ChevronDown
        size={10}
        aria-hidden="true"
        style={{ position: "absolute", right: 7, pointerEvents: "none", color: "var(--text-muted)" }}
      />
    </div>
  );
});
