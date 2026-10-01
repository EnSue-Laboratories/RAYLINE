import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useFontScale } from "../../contexts/FontSizeContext";
import PointerSlider from "./PointerSlider";
import {
  buildControlSubmitText,
  clamp,
  controlOptionLabel,
  controlValue,
  formatNumber,
  valueFieldWidth,
  type ControlChange,
  type ControlConfig,
  type ValueControlDefinition,
} from "./valueControl";

/** Slider position per control JSON, so remounts keep the user's draft. */
const controlDraftCache = new Map<string, number>();

function initialSliderValue(json: string, config: ControlConfig): number {
  const cached = controlDraftCache.get(json);
  return cached !== undefined && Number.isFinite(cached) ? cached : config.initial;
}

export interface ValueControlCallbacks {
  onAnswer?: (text: string) => void;
  onControlChange?: (change: ControlChange) => void;
  canControlTarget?: (target: string) => boolean;
}

export interface ValueControlCardProps extends ValueControlCallbacks {
  json: string;
  control: ValueControlDefinition;
  config: ControlConfig;
}

/**
 * The interactive control. Mount it with `key={json}` so a different control
 * definition starts from fresh state (replaces the old reset effect).
 */
export default function ValueControlCard({ json, control, config, onAnswer, onControlChange, canControlTarget }: ValueControlCardProps) {
  const s = useFontScale();
  const [sliderValue, setSliderValue] = useState(() => initialSliderValue(json, config));
  const [valueDraft, setValueDraft] = useState(() => formatNumber(controlValue(config, initialSliderValue(json, config))));
  const [submitted, setSubmitted] = useState(false);
  const [buttonHovered, setButtonHovered] = useState(false);

  const value = controlValue(config, sliderValue);
  const valueText = `${formatNumber(value)}${control.unit}`;
  const selectedLabel = controlOptionLabel(config, sliderValue);
  const isBoundControl = Boolean(control.target && onControlChange && canControlTarget?.(control.target));
  const canSubmit = Boolean(onAnswer);
  const actionLabel = isBoundControl && control.actionLabel === "Send" ? "Save" : control.actionLabel;

  const applyValue = (nextValue: number, { syncDraft = true } = {}): number => {
    const normalizedValue = clamp(Number(nextValue), config.min, config.max);
    const nextControlValue = controlValue(config, normalizedValue);

    controlDraftCache.set(json, normalizedValue);
    setSliderValue(normalizedValue);
    if (syncDraft) setValueDraft(formatNumber(nextControlValue));
    setSubmitted(false);

    if (isBoundControl && onControlChange && nextControlValue !== value) {
      onControlChange({
        target: control.target,
        value: nextControlValue,
        label: control.label,
        unit: control.unit,
        optionLabel: controlOptionLabel(config, normalizedValue),
      });
    }
    return nextControlValue;
  };

  const commitValueDraft = (): number => {
    if (config.mode !== "continuous") return value;
    const parsed = Number(valueDraft);
    if (!Number.isFinite(parsed)) {
      setValueDraft(formatNumber(value));
      return value;
    }
    return applyValue(parsed);
  };

  const handleSubmit = () => {
    if (!onAnswer) return;
    const nextValue = commitValueDraft();
    const submitText = buildControlSubmitText(control, config, nextValue, sliderValue, isBoundControl);
    if (!submitText) return;
    onAnswer(submitText);
    setSubmitted(true);
  };

  return (
    <div
      style={{
        margin: "12px 0",
        borderRadius: 12,
        border: "1px solid var(--control-border)",
        background: "var(--control-bg)",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px 0" }}>
        <SlidersHorizontal size={14} strokeWidth={1.8} style={{ color: "var(--text-muted)" }} />
        <span style={{ fontSize: s(10), fontFamily: "var(--font-mono)", color: "var(--text-muted)", letterSpacing: ".1em" }}>
          CONTROL
        </span>
      </div>

      <div style={{ padding: "12px 14px 14px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: s(15), color: "var(--text-primary)", fontFamily: "var(--font-content)", lineHeight: 1.35 }}>
              {control.label}
            </div>
            {control.help && (
              <div style={{ fontSize: s(11), color: "var(--text-muted)", fontFamily: "var(--font-ui)", lineHeight: 1.5, marginTop: 2 }}>
                {control.help}
              </div>
            )}
          </div>
          {config.mode === "continuous" ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                background: "var(--control-bg)",
                border: "1px solid var(--control-bg-strong)",
                borderRadius: 999,
                padding: "3px 7px 3px 9px",
                whiteSpace: "nowrap",
              }}
            >
              <input
                type="text"
                inputMode="decimal"
                value={valueDraft}
                onChange={(event) => {
                  setValueDraft(event.target.value);
                  setSubmitted(false);
                }}
                onBlur={() => { commitValueDraft(); }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitValueDraft();
                    event.currentTarget.blur();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setValueDraft(formatNumber(value));
                    event.currentTarget.blur();
                  }
                }}
                aria-label={`${control.label} value`}
                style={{
                  width: valueFieldWidth(valueDraft),
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  color: "var(--text-primary)",
                  fontSize: s(11),
                  fontFamily: "var(--font-mono)",
                  textAlign: "right",
                }}
              />
              {control.unit && (
                <span style={{ fontSize: s(10.5), fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                  {control.unit}
                </span>
              )}
            </div>
          ) : (
            <div
              style={{
                fontSize: s(12),
                fontFamily: "var(--font-mono)",
                color: "var(--text-secondary)",
                background: "var(--control-bg-strong)",
                border: "1px solid var(--control-border)",
                borderRadius: 999,
                padding: "4px 9px",
                whiteSpace: "nowrap",
              }}
            >
              {selectedLabel ? `${selectedLabel} · ${valueText}` : valueText}
            </div>
          )}
        </div>

        <PointerSlider min={config.min} max={config.max} step={config.step} value={sliderValue} onChange={applyValue} />

        {config.mode === "discrete" && config.options.length <= 7 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${config.options.length}, minmax(0, 1fr))`,
              gap: 8,
              marginTop: 8,
            }}
          >
            {config.options.map((option, index) => {
              const active = index === Math.round(sliderValue);
              return (
                <div
                  key={option.id}
                  style={{
                    fontSize: s(10),
                    fontFamily: "var(--font-mono)",
                    color: active ? "var(--text-secondary)" : "var(--text-disabled)",
                    textAlign: index === 0 ? "left" : index === config.options.length - 1 ? "right" : "center",
                    transition: "color .15s ease",
                  }}
                >
                  {option.label}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 12 }}>
          <div
            style={{
              fontSize: s(10),
              fontFamily: "var(--font-mono)",
              color: isBoundControl ? "var(--accent-muted)" : "var(--text-disabled)",
              letterSpacing: ".06em",
            }}
          >
            {isBoundControl ? `BOUND · ${control.target}` : control.mode === "discrete" ? "DISCRETE" : "CONTINUOUS"}
          </div>
          {canSubmit && (
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              onMouseEnter={() => setButtonHovered(true)}
              onMouseLeave={() => setButtonHovered(false)}
              style={{
                border: submitted
                  ? "1px solid var(--control-bg-active)"
                  : buttonHovered
                    ? "1px solid var(--control-border-hover)"
                    : "1px solid var(--control-bg-strong)",
                background: submitted || buttonHovered ? "var(--control-bg-active)" : "var(--control-bg)",
                color: "var(--text-secondary)",
                borderRadius: 999,
                padding: "6px 11px",
                cursor: "pointer",
                fontSize: s(10),
                fontFamily: "var(--font-mono)",
                letterSpacing: ".08em",
                textTransform: "uppercase",
                boxShadow: submitted ? "none" : "inset 0 1px 0 var(--control-highlight)",
                transition: "all .15s ease",
              }}
            >
              {submitted ? (isBoundControl ? "SAVED" : "SENT") : actionLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
