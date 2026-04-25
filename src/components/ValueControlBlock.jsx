import { useEffect, useMemo, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useFontScale } from "../contexts/FontSizeContext";

const controlDraftCache = new Map();

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundToStep(value, step, min) {
  if (!Number.isFinite(step) || step <= 0) return value;
  const origin = Number.isFinite(min) ? min : 0;
  const rounded = Math.round((value - origin) / step) * step + origin;
  return Number(rounded.toFixed(6));
}

function buildContinuousConfig(raw) {
  const min = Number.isFinite(raw.min) ? raw.min : 0;
  const max = Number.isFinite(raw.max) ? raw.max : 100;
  const step = Number.isFinite(raw.step) && raw.step > 0 ? raw.step : 1;
  const initial = clamp(
    roundToStep(Number.isFinite(raw.value) ? raw.value : min, step, min),
    min,
    max
  );

  return {
    mode: "continuous",
    min,
    max,
    step,
    initial,
    getValue: (sliderValue) => clamp(Number(sliderValue), min, max),
    renderValue: (sliderValue) => Number(sliderValue),
    selectedLabel: null,
  };
}

function buildDiscreteConfig(raw) {
  const options = Array.isArray(raw.options)
    ? raw.options
        .map((option, index) => {
          if (option == null) return null;
          if (typeof option === "number") {
            return { value: option, label: String(option), id: `option-${index}` };
          }
          if (typeof option === "string") {
            const numeric = Number(option);
            return {
              value: Number.isFinite(numeric) ? numeric : index,
              label: option,
              id: `option-${index}`,
            };
          }
          const value = Number(option.value);
          if (!Number.isFinite(value)) return null;
          return {
            value,
            label: option.label || String(value),
            id: option.id || `option-${index}`,
          };
        })
        .filter(Boolean)
    : [];

  if (options.length === 0) {
    return buildContinuousConfig(raw);
  }

  const initialIndex = options.reduce((bestIdx, option, index) => {
    const targetValue = Number.isFinite(raw.value) ? raw.value : options[0].value;
    return Math.abs(option.value - targetValue) < Math.abs(options[bestIdx].value - targetValue)
      ? index
      : bestIdx;
  }, 0);

  return {
    mode: "discrete",
    min: 0,
    max: options.length - 1,
    step: 1,
    initial: initialIndex,
    options,
    getValue: (sliderValue) => {
      const index = clamp(Math.round(Number(sliderValue)), 0, options.length - 1);
      return options[index]?.value ?? options[0].value;
    },
    renderValue: (sliderValue) => {
      const index = clamp(Math.round(Number(sliderValue)), 0, options.length - 1);
      return options[index]?.value ?? options[0].value;
    },
    selectedLabel: (sliderValue) => {
      const index = clamp(Math.round(Number(sliderValue)), 0, options.length - 1);
      return options[index]?.label || null;
    },
  };
}

function normalizeControlBlock(json) {
  const parsed = JSON.parse(json);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Control block must be a JSON object.");
  }
  if (parsed.type !== "value_control") {
    throw new Error(`Unsupported control type: ${parsed.type || "unknown"}`);
  }

  const control = {
    ...parsed,
    label: parsed.label || "Value",
    unit: parsed.unit || "",
    help: parsed.help || "",
    actionLabel: parsed.actionLabel || "Send",
    target: parsed.target || "",
    mode: parsed.mode === "discrete" ? "discrete" : "continuous",
  };

  const config = control.mode === "discrete"
    ? buildDiscreteConfig(control)
    : buildContinuousConfig(control);

  return { control, config };
}

function fillTemplate(template, variables) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key) => {
    const value = variables[key];
    return value == null ? "" : String(value);
  });
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return String(value);
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

function PointerSlider({ min, max, step, value, onChange }) {
  const trackRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const percent = max === min ? 0 : ((value - min) / (max - min)) * 100;

  const updateFromClientX = (clientX) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    const rawValue = min + ratio * (max - min);
    onChange(clamp(roundToStep(rawValue, step, min), min, max));
  };

  const handlePointerDown = (event) => {
    event.preventDefault();
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateFromClientX(event.clientX);
  };

  const handlePointerMove = (event) => {
    if (!dragging) return;
    updateFromClientX(event.clientX);
  };

  const finishPointer = (event) => {
    if (!dragging) return;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleKeyDown = (event) => {
    let nextValue = value;
    const keyStep = Number.isFinite(step) && step > 0 ? step : 1;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      nextValue = value - keyStep;
    } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      nextValue = value + keyStep;
    } else if (event.key === "PageDown") {
      nextValue = value - keyStep * 4;
    } else if (event.key === "PageUp") {
      nextValue = value + keyStep * 4;
    } else if (event.key === "Home") {
      nextValue = min;
    } else if (event.key === "End") {
      nextValue = max;
    } else {
      return;
    }

    event.preventDefault();
    onChange(clamp(roundToStep(nextValue, step, min), min, max));
  };

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
      style={{
        position: "relative",
        height: 34,
        width: "100%",
        cursor: "ew-resize",
        touchAction: "none",
        outline: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "50%",
          height: 8,
          borderRadius: 999,
          background: "rgba(255,255,255,0.1)",
          transform: "translateY(-50%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: "50%",
          width: `${percent}%`,
          height: 8,
          borderRadius: 999,
          background: "rgba(255,255,255,0.82)",
          transform: "translateY(-50%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: `calc(${percent}% - 11px)`,
          width: 22,
          height: 22,
          borderRadius: "50%",
          border: "1px solid rgba(255,255,255,0.32)",
          background: "rgba(246,248,255,0.96)",
          boxShadow: dragging ? "0 0 0 10px rgba(255,255,255,0.05)" : "0 8px 24px rgba(0,0,0,0.22)",
          transform: `translateY(-50%) scale(${dragging ? 1.05 : 1})`,
          transition: dragging ? "none" : "box-shadow .14s ease, transform .14s ease",
        }}
      />
    </div>
  );
}

export default function ValueControlBlock({ json, isStreaming, onAnswer, onControlChange, canControlTarget }) {
  const s = useFontScale();

  // Parse/normalize eagerly but never short-circuit — all hooks must run in the same order.
  // Errors from normalizeControlBlock are captured and rendered at the bottom.
  const parsed = useMemo(() => {
    if (isStreaming) return { ok: false, streaming: true };
    try {
      return { ok: true, ...normalizeControlBlock(json) };
    } catch (err) {
      return { ok: false, error: err };
    }
  }, [json, isStreaming]);

  const control = parsed.ok ? parsed.control : null;
  const config = parsed.ok ? parsed.config : null;
  const fallbackInitial = 0;
  const initialSliderValue = config ? config.initial : fallbackInitial;

  const cachedDraftValue = controlDraftCache.get(json);
  const [sliderValue, setSliderValue] = useState(
    Number.isFinite(cachedDraftValue) ? cachedDraftValue : initialSliderValue
  );
  const [valueDraft, setValueDraft] = useState(() =>
    config
      ? formatNumber(config.getValue(Number.isFinite(cachedDraftValue) ? cachedDraftValue : config.initial))
      : ""
  );
  const [submitted, setSubmitted] = useState(false);
  const [buttonHovered, setButtonHovered] = useState(false);

  useEffect(() => {
    if (!config) return;
    const nextValue = Number.isFinite(controlDraftCache.get(json))
      ? controlDraftCache.get(json)
      : config.initial;
    setSliderValue(nextValue);
    setValueDraft(formatNumber(config.getValue(nextValue)));
    setSubmitted(false);
  }, [json, config, config?.initial]);

  const value = useMemo(
    () => (config ? config.getValue(sliderValue) : 0),
    [config, sliderValue]
  );

  if (isStreaming) {
    return (
      <div
        style={{
          margin: "12px 0",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(255,255,255,0.02)",
          padding: "18px 16px",
          color: "rgba(255,255,255,0.28)",
          fontSize: s(11),
          fontFamily: "'JetBrains Mono',monospace",
          letterSpacing: ".08em",
        }}
      >
        CONTROL
      </div>
    );
  }

  if (!parsed.ok) {
    return (
      <div
        style={{
          margin: "12px 0",
          borderRadius: 10,
          border: "1px solid rgba(255,120,120,0.18)",
          background: "rgba(120,0,0,0.12)",
          padding: "14px 16px",
        }}
      >
        <div
          style={{
            fontSize: s(10),
            fontFamily: "'JetBrains Mono',monospace",
            color: "rgba(255,180,180,0.75)",
            letterSpacing: ".08em",
            marginBottom: 8,
          }}
        >
          INVALID CONTROL
        </div>
        <div
          style={{
            fontSize: s(13),
            color: "rgba(255,220,220,0.8)",
            fontFamily: "system-ui,-apple-system,sans-serif",
          }}
        >
          {parsed.error?.message}
        </div>
      </div>
    );
  }
  const valueText = `${formatNumber(value)}${control.unit || ""}`;
  const selectedLabel = config.selectedLabel ? config.selectedLabel(sliderValue) : null;
  const valueFieldWidth = `${Math.min(Math.max(valueDraft.length + 0.35, 3), 5.5)}ch`;
  const isBoundControl = Boolean(control.target && onControlChange && canControlTarget?.(control.target));
  const canSubmit = Boolean(onAnswer);
  const actionLabel = isBoundControl && control.actionLabel === "Send"
    ? "Save"
    : control.actionLabel;

  const buildSubmitText = (nextValue, nextSliderValue = sliderValue) => fillTemplate(
    control.messageTemplate || (
      isBoundControl
        ? "The user saved {{label}} at {{value}}{{unit}}. Adjust related components accordingly."
        : "Set {{label}} to {{value}}{{unit}}."
    ),
    {
      label: control.label,
      value: formatNumber(nextValue),
      unit: control.unit || "",
      target: control.target || "",
      optionLabel: config.selectedLabel ? config.selectedLabel(nextSliderValue) || "" : "",
    }
  ).trim();

  const applyValue = (nextValue, { syncDraft = true } = {}) => {
    const normalizedValue = config.mode === "continuous"
      ? clamp(Number(nextValue), config.min, config.max)
      : clamp(Number(nextValue), config.min, config.max);

    controlDraftCache.set(json, normalizedValue);
    setSliderValue(normalizedValue);
    if (syncDraft) {
      setValueDraft(formatNumber(config.getValue(normalizedValue)));
    }
    setSubmitted(false);

    if (isBoundControl && config.getValue(normalizedValue) !== value) {
      onControlChange({
        target: control.target,
        value: config.getValue(normalizedValue),
        label: control.label,
        unit: control.unit || "",
        optionLabel: config.selectedLabel ? config.selectedLabel(normalizedValue) : null,
      });
    }

    return config.getValue(normalizedValue);
  };

  const handleChange = (nextValue) => {
    applyValue(nextValue);
  };

  const commitValueDraft = () => {
    if (config.mode !== "continuous") return value;
    const parsed = Number(valueDraft);
    if (!Number.isFinite(parsed)) {
      setValueDraft(formatNumber(value));
      return value;
    }
    return applyValue(parsed);
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    const nextValue = commitValueDraft();
    const submitText = buildSubmitText(nextValue, sliderValue);
    if (!submitText) return;
    onAnswer(submitText);
    setSubmitted(true);
  };

  return (
    <div
      style={{
        margin: "12px 0",
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.025)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 14px 0",
        }}
      >
        <SlidersHorizontal size={14} strokeWidth={1.8} style={{ color: "rgba(255,255,255,0.4)" }} />
        <span
          style={{
            fontSize: s(10),
            fontFamily: "'JetBrains Mono',monospace",
            color: "rgba(255,255,255,0.3)",
            letterSpacing: ".1em",
          }}
        >
          CONTROL
        </span>
      </div>

      <div style={{ padding: "12px 14px 14px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 10,
            marginBottom: 10,
          }}
        >
          <div>
            <div
              style={{
                fontSize: s(15),
                color: "rgba(255,255,255,0.86)",
                fontFamily: "'Newsreader','Iowan Old Style',Georgia,serif",
                lineHeight: 1.35,
              }}
            >
              {control.label}
            </div>
            {control.help && (
              <div
                style={{
                  fontSize: s(11),
                  color: "rgba(255,255,255,0.35)",
                  fontFamily: "system-ui,-apple-system,sans-serif",
                  lineHeight: 1.5,
                  marginTop: 2,
                }}
              >
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
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.07)",
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
                onBlur={commitValueDraft}
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
                  width: valueFieldWidth,
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  color: "rgba(255,255,255,0.82)",
                  fontSize: s(11),
                  fontFamily: "'JetBrains Mono',monospace",
                  textAlign: "right",
                }}
              />
              {control.unit && (
                <span
                  style={{
                    fontSize: s(10.5),
                    fontFamily: "'JetBrains Mono',monospace",
                    color: "rgba(255,255,255,0.42)",
                  }}
                >
                  {control.unit}
                </span>
              )}
            </div>
          ) : (
            <div
              style={{
                fontSize: s(12),
                fontFamily: "'JetBrains Mono',monospace",
                color: "rgba(255,255,255,0.75)",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 999,
                padding: "4px 9px",
                whiteSpace: "nowrap",
              }}
            >
              {selectedLabel ? `${selectedLabel} · ${valueText}` : valueText}
            </div>
          )}
        </div>

        <PointerSlider
          min={config.min}
          max={config.max}
          step={config.step}
          value={sliderValue}
          onChange={handleChange}
        />

        {config.mode === "discrete" && Array.isArray(config.options) && config.options.length <= 7 && (
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
                    fontFamily: "'JetBrains Mono',monospace",
                    color: active ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.22)",
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

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            marginTop: 12,
          }}
        >
          <div
            style={{
              fontSize: s(10),
              fontFamily: "'JetBrains Mono',monospace",
              color: isBoundControl ? "rgba(170,220,255,0.52)" : "rgba(255,255,255,0.22)",
              letterSpacing: ".06em",
            }}
          >
            {isBoundControl
              ? `BOUND · ${control.target}`
              : control.mode === "discrete"
                ? "DISCRETE"
                : "CONTINUOUS"}
          </div>
          {canSubmit && (
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              onMouseEnter={() => setButtonHovered(true)}
              onMouseLeave={() => setButtonHovered(false)}
              style={{
                border: submitted
                  ? "1px solid rgba(255,255,255,0.10)"
                  : buttonHovered
                    ? "1px solid rgba(255,255,255,0.14)"
                    : "1px solid rgba(255,255,255,0.07)",
                background: submitted
                  ? "rgba(255,255,255,0.09)"
                  : buttonHovered
                    ? "rgba(255,255,255,0.085)"
                    : "rgba(255,255,255,0.045)",
                color: submitted ? "rgba(255,255,255,0.72)" : canSubmit ? "rgba(255,255,255,0.78)" : "rgba(255,255,255,0.28)",
                borderRadius: 999,
                padding: "6px 11px",
                cursor: canSubmit ? "pointer" : "default",
                fontSize: s(10),
                fontFamily: "'JetBrains Mono',monospace",
                letterSpacing: ".08em",
                textTransform: "uppercase",
                boxShadow: submitted ? "none" : "inset 0 1px 0 rgba(255,255,255,0.03)",
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
