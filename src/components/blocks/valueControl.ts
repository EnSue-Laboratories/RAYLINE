/**
 * Parsing and value math for ```control``` fences (ValueControlBlock).
 *
 * A control is `{ "type": "value_control", "label", "min", "max", "step",
 * "value", "unit", "mode": "continuous" | "discrete", "options", ... }`.
 * The slider works on a "slider value": the value itself for continuous
 * controls, the option index for discrete ones.
 */

export interface ControlOption {
  value: number;
  label: string;
  id: string;
}

interface ControlConfigBase {
  min: number;
  max: number;
  step: number;
  /** Initial slider value. */
  initial: number;
}

export interface ContinuousControlConfig extends ControlConfigBase {
  mode: "continuous";
}

export interface DiscreteControlConfig extends ControlConfigBase {
  mode: "discrete";
  options: readonly ControlOption[];
}

export type ControlConfig = ContinuousControlConfig | DiscreteControlConfig;

export type ControlMode = ControlConfig["mode"];

/** Normalized control definition (unknown extra fields are kept). */
export interface ValueControlDefinition {
  type: "value_control";
  label: string;
  unit: string;
  help: string;
  actionLabel: string;
  target: string;
  mode: ControlMode;
  messageTemplate?: string;
  min?: unknown;
  max?: unknown;
  step?: unknown;
  value?: unknown;
  options?: unknown;
  [extra: string]: unknown;
}

export interface NormalizedControl {
  control: ValueControlDefinition;
  config: ControlConfig;
}

/** Payload sent to `onControlChange` for target-bound controls. */
export interface ControlChange {
  target: string;
  value: number;
  label: string;
  unit: string;
  optionLabel: string | null;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function roundToStep(value: number, step: number, min: number): number {
  if (!Number.isFinite(step) || step <= 0) return value;
  const origin = Number.isFinite(min) ? min : 0;
  const rounded = Math.round((value - origin) / step) * step + origin;
  return Number(rounded.toFixed(6));
}

function buildContinuousConfig(raw: ValueControlDefinition): ContinuousControlConfig {
  const min = finiteNumber(raw.min) ?? 0;
  const max = finiteNumber(raw.max) ?? 100;
  const rawStep = finiteNumber(raw.step);
  const step = rawStep !== null && rawStep > 0 ? rawStep : 1;
  const initial = clamp(roundToStep(finiteNumber(raw.value) ?? min, step, min), min, max);
  return { mode: "continuous", min, max, step, initial };
}

function parseOption(option: unknown, index: number): ControlOption | null {
  if (option == null) return null;
  if (typeof option === "number") return { value: option, label: String(option), id: `option-${index}` };
  if (typeof option === "string") {
    const numeric = Number(option);
    return { value: Number.isFinite(numeric) ? numeric : index, label: option, id: `option-${index}` };
  }
  if (typeof option !== "object") return null;
  const record = option as Record<string, unknown>;
  const value = Number(record.value);
  if (!Number.isFinite(value)) return null;
  const label = typeof record.label === "string" && record.label ? record.label : String(value);
  const id = typeof record.id === "string" && record.id ? record.id : `option-${index}`;
  return { value, label, id };
}

function buildDiscreteConfig(raw: ValueControlDefinition): ControlConfig {
  const options = Array.isArray(raw.options)
    ? raw.options.map((option: unknown, index) => parseOption(option, index)).filter((o): o is ControlOption => o !== null)
    : [];
  const first = options[0];
  if (!first) return buildContinuousConfig(raw);

  const target = finiteNumber(raw.value) ?? first.value;
  let initial = 0;
  options.forEach((option, index) => {
    const best = options[initial] ?? first;
    if (Math.abs(option.value - target) < Math.abs(best.value - target)) initial = index;
  });

  return { mode: "discrete", min: 0, max: options.length - 1, step: 1, initial, options };
}

function optionAt(config: DiscreteControlConfig, sliderValue: number): ControlOption | undefined {
  const index = clamp(Math.round(Number(sliderValue)), 0, config.options.length - 1);
  return config.options[index];
}

/** Value represented by a slider position. */
export function controlValue(config: ControlConfig, sliderValue: number): number {
  switch (config.mode) {
    case "continuous":
      return clamp(Number(sliderValue), config.min, config.max);
    case "discrete":
      return optionAt(config, sliderValue)?.value ?? config.options[0]?.value ?? 0;
    default: {
      const exhaustive: never = config;
      return exhaustive;
    }
  }
}

/** Option label at a slider position (discrete controls only). */
export function controlOptionLabel(config: ControlConfig, sliderValue: number): string | null {
  if (config.mode !== "discrete") return null;
  return optionAt(config, sliderValue)?.label || null;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value ? value : fallback;
}

/** Parse + validate a control fence body; throws with a user-facing message. */
export function normalizeControlBlock(json: string): NormalizedControl {
  const parsed: unknown = JSON.parse(json);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Control block must be a JSON object.");
  }
  const record = parsed as Record<string, unknown>;
  if (record.type !== "value_control") {
    throw new Error(`Unsupported control type: ${stringOr(record.type, "unknown")}`);
  }

  const control: ValueControlDefinition = {
    ...record,
    type: "value_control",
    label: stringOr(record.label, "Value"),
    unit: stringOr(record.unit, ""),
    help: stringOr(record.help, ""),
    actionLabel: stringOr(record.actionLabel, "Send"),
    target: stringOr(record.target, ""),
    mode: record.mode === "discrete" ? "discrete" : "continuous",
    messageTemplate: typeof record.messageTemplate === "string" ? record.messageTemplate : undefined,
  };

  const config = control.mode === "discrete" ? buildDiscreteConfig(control) : buildContinuousConfig(control);
  return { control, config };
}

export function fillTemplate(template: string, variables: Readonly<Record<string, string | number | null | undefined>>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => {
    const value = variables[key];
    return value == null ? "" : String(value);
  });
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

/** Width of the inline numeric field, in `ch`. */
export function valueFieldWidth(draft: string): string {
  return `${Math.min(Math.max(draft.length + 0.35, 3), 5.5)}ch`;
}

const BOUND_TEMPLATE = "The user saved {{label}} at {{value}}{{unit}}. Adjust related components accordingly.";
const ANSWER_TEMPLATE = "Set {{label}} to {{value}}{{unit}}.";

/** Message sent through `onAnswer` when the user submits the control. */
export function buildControlSubmitText(
  control: ValueControlDefinition,
  config: ControlConfig,
  value: number,
  sliderValue: number,
  isBound: boolean,
): string {
  return fillTemplate(control.messageTemplate || (isBound ? BOUND_TEMPLATE : ANSWER_TEMPLATE), {
    label: control.label,
    value: formatNumber(value),
    unit: control.unit,
    target: control.target,
    optionLabel: controlOptionLabel(config, sliderValue) || "",
  }).trim();
}

/** Slider value after a keyboard step; null for keys the slider ignores. */
export function sliderValueForKey(key: string, value: number, min: number, max: number, step: number): number | null {
  const keyStep = Number.isFinite(step) && step > 0 ? step : 1;
  let next: number;
  switch (key) {
    case "ArrowLeft":
    case "ArrowDown":
      next = value - keyStep;
      break;
    case "ArrowRight":
    case "ArrowUp":
      next = value + keyStep;
      break;
    case "PageDown":
      next = value - keyStep * 4;
      break;
    case "PageUp":
      next = value + keyStep * 4;
      break;
    case "Home":
      next = min;
      break;
    case "End":
      next = max;
      break;
    default:
      return null;
  }
  return clamp(roundToStep(next, step, min), min, max);
}

/** Slider value at a pointer x-position within a track. */
export function sliderValueAtRatio(ratio: number, min: number, max: number, step: number): number {
  const raw = min + clamp(ratio, 0, 1) * (max - min);
  return clamp(roundToStep(raw, step, min), min, max);
}
