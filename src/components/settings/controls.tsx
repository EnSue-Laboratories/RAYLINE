/**
 * Reusable form controls for the Settings view. All are memoized and only
 * take primitive / stable props so a parent re-render doesn't cascade.
 */

import { memo, useState, type ChangeEvent, type CSSProperties, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { isValidHexColor, type FontOption, type FontScale } from "./deps";
import { fieldRowStyle, getSettingsStyles, sliderStyle, toggleRowStyle, TEXT_MUTED } from "./styles";

// ── Layout ──────────────────────────────────────────────────────────────────

interface SettingBlockProps {
  children: ReactNode;
  style?: CSSProperties;
}

export function SettingBlock({ children, style }: SettingBlockProps) {
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 8,
        background: "color-mix(in srgb, var(--control-bg) 58%, transparent)",
        border: "1px solid var(--control-border)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

interface SectionLabelProps {
  s: FontScale;
  children: ReactNode;
  /** The first section has no top margin. */
  first?: boolean;
  /** Some sections use a slightly dimmer label. */
  dim?: boolean;
}

export const SectionLabel = memo(function SectionLabel({ s, children, first = false, dim = false }: SectionLabelProps) {
  const base = getSettingsStyles(s).sectionLabel;
  const style: CSSProperties = {
    ...base,
    ...(first ? { marginTop: 0 } : null),
    ...(dim ? { color: "color-mix(in srgb, var(--text-primary) 25%, transparent)" } : null),
  };
  return <div style={style}>{children}</div>;
});

interface SettingHeaderProps {
  s: FontScale;
  title: ReactNode;
  description?: ReactNode;
  /** Gap below the description (or title when there is none). */
  spacing?: number;
  /** Description color override (some legacy rows are dimmer). */
  descriptionColor?: string;
}

export function SettingHeader({ s, title, description, spacing = 0, descriptionColor }: SettingHeaderProps) {
  const styles = getSettingsStyles(s);
  return (
    <>
      <div style={description === undefined ? { ...styles.title, marginBottom: spacing } : styles.title}>{title}</div>
      {description !== undefined && (
        <div style={{ ...styles.description, marginBottom: spacing, ...(descriptionColor ? { color: descriptionColor } : null) }}>
          {description}
        </div>
      )}
    </>
  );
}

// ── Toggles ─────────────────────────────────────────────────────────────────

export type SwitchVariant = "control" | "soft";

interface ToggleSwitchProps {
  checked: boolean;
  onToggle: (next: boolean) => void;
  variant?: SwitchVariant;
  size?: "md" | "sm";
  ariaLabel?: string;
  title?: string;
}

export const ToggleSwitch = memo(function ToggleSwitch({
  checked,
  onToggle,
  variant = "control",
  size = "md",
  ariaLabel,
  title,
}: ToggleSwitchProps) {
  const small = size === "sm";
  const knob = small ? 14 : 16;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      title={title}
      onClick={() => onToggle(!checked)}
      style={{
        flexShrink: 0,
        width: small ? 34 : 38,
        height: small ? 20 : 22,
        borderRadius: 999,
        border: variant === "control"
          ? "1px solid var(--control-border)"
          : "1px solid color-mix(in srgb, var(--text-primary) 12%, transparent)",
        background: checked
          ? "var(--toggle-on)"
          : variant === "control" ? "var(--control-bg)" : "color-mix(in srgb, var(--text-primary) 6%, transparent)",
        position: "relative",
        cursor: "pointer",
        padding: 0,
        transition: "background 120ms ease",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: checked ? (small ? 16 : 18) : 2,
          width: knob,
          height: knob,
          borderRadius: "50%",
          background: "var(--toggle-knob)",
          transition: "left 120ms ease",
        }}
      />
    </button>
  );
});

interface ToggleSettingProps {
  s: FontScale;
  title: string;
  description: string;
  checked: boolean;
  onToggle: (next: boolean) => void;
  variant?: SwitchVariant;
  descriptionColor?: string;
  marginBottom?: number;
}

/** Title + description on the left, switch on the right. */
export const ToggleSetting = memo(function ToggleSetting({
  s,
  title,
  description,
  checked,
  onToggle,
  variant = "control",
  descriptionColor,
  marginBottom = 24,
}: ToggleSettingProps) {
  return (
    <div style={{ marginBottom }}>
      <div style={toggleRowStyle}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <SettingHeader s={s} title={title} description={description} descriptionColor={descriptionColor} />
        </div>
        <ToggleSwitch checked={checked} onToggle={onToggle} variant={variant} />
      </div>
    </div>
  );
});

// ── Sliders ─────────────────────────────────────────────────────────────────

interface RangeSettingProps {
  s: FontScale;
  label: string;
  value: number;
  min: number;
  max: number;
  /** Fill percentage of the track (callers keep the legacy fallbacks). */
  pct: number;
  onValueChange: (value: number) => void;
  description?: string;
}

export const RangeSetting = memo(function RangeSetting({
  s,
  label,
  value,
  min,
  max,
  pct,
  onValueChange,
  description,
}: RangeSettingProps) {
  const styles = getSettingsStyles(s);
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ ...styles.title, marginBottom: 10 }}>{label}</div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        aria-label={label}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onValueChange(Number(e.target.value))}
        style={sliderStyle(pct)}
      />
      {description && (
        <div style={{ fontSize: s(10), color: TEXT_MUTED, marginTop: 8 }}>{description}</div>
      )}
    </div>
  );
});

// ── Choice controls ─────────────────────────────────────────────────────────

export interface ChoiceOption<V extends string> {
  value: V;
  label: string;
}

interface SegmentedControlProps<V extends string> {
  options: readonly ChoiceOption<V>[];
  value: V;
  onChange: (value: V) => void;
  s: FontScale;
}

function SegmentedControlImpl<V extends string>({ options, value, onChange, s }: SegmentedControlProps<V>) {
  return (
    <div
      role="radiogroup"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
        gap: 4,
        padding: 3,
        borderRadius: 8,
        background: "var(--control-bg)",
        border: "1px solid var(--control-border)",
      }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            style={{
              height: 28,
              borderRadius: 6,
              border: "none",
              background: active ? "var(--control-bg-active)" : "transparent",
              color: active ? "var(--text-primary)" : "var(--text-secondary)",
              cursor: "pointer",
              fontFamily: "var(--font-ui)",
              fontSize: s(11),
              fontWeight: active ? 600 : 500,
              transition: "background .15s, color .15s",
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export const SegmentedControl = memo(SegmentedControlImpl) as typeof SegmentedControlImpl;

interface ColorFieldProps<K extends string> {
  fieldKey: K;
  label: string;
  value: string;
  onChange: (key: K, value: string) => void;
  s: FontScale;
}

function ColorFieldImpl<K extends string>({ fieldKey, label, value, onChange, s }: ColorFieldProps<K>) {
  const [draft, setDraft] = useState(value);
  const [syncedValue, setSyncedValue] = useState(value);
  // Reset the draft when the committed value changes from outside.
  if (syncedValue !== value) {
    setSyncedValue(value);
    setDraft(value);
  }

  const commit = (next: string) => {
    setDraft(next);
    if (isValidHexColor(next)) onChange(fieldKey, next);
  };
  const draftValid = isValidHexColor(draft);

  return (
    <div style={fieldRowStyle}>
      <span style={{ fontSize: s(12), color: "var(--text-secondary)", fontFamily: "var(--font-ui)" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="color"
          value={isValidHexColor(value) ? value : "#000000"}
          onChange={(e) => commit(e.target.value.toUpperCase())}
          aria-label={label}
          style={{
            width: 30,
            height: 24,
            padding: 0,
            border: "1px solid var(--control-border)",
            borderRadius: 999,
            background: "transparent",
            cursor: "pointer",
          }}
        />
        <input
          type="text"
          value={draft}
          aria-label={label}
          onChange={(e) => commit(e.target.value)}
          onBlur={() => {
            if (!draftValid) setDraft(value);
          }}
          spellCheck={false}
          style={{
            width: 96,
            height: 28,
            borderRadius: 8,
            border: `1px solid ${draftValid ? "var(--control-border)" : "var(--danger-border)"}`,
            background: "var(--control-bg)",
            color: "var(--text-primary)",
            fontFamily: "var(--font-mono)",
            fontSize: s(11),
            padding: "0 8px",
            outline: "none",
            textTransform: "uppercase",
          }}
        />
      </div>
    </div>
  );
}

export const ColorField = memo(ColorFieldImpl) as typeof ColorFieldImpl;

interface SelectFieldProps<K extends string> {
  fieldKey: K;
  label: string;
  value: string;
  options: readonly FontOption[];
  onChange: (key: K, value: string) => void;
  s: FontScale;
}

function SelectFieldImpl<K extends string>({ fieldKey, label, value, options, onChange, s }: SelectFieldProps<K>) {
  return (
    <div style={fieldRowStyle}>
      <span style={{ fontSize: s(12), color: "var(--text-secondary)", fontFamily: "var(--font-ui)" }}>{label}</span>
      <div style={{ position: "relative", display: "flex", alignItems: "center", width: 210 }}>
        <select
          value={value}
          aria-label={label}
          onChange={(e) => onChange(fieldKey, e.target.value)}
          style={{
            width: "100%",
            height: 30,
            borderRadius: 8,
            border: "1px solid var(--control-border)",
            background: "var(--control-bg)",
            color: "var(--text-primary)",
            fontFamily: "var(--font-ui)",
            fontSize: s(11),
            padding: "0 28px 0 10px",
            outline: "none",
            appearance: "none",
            WebkitAppearance: "none",
            MozAppearance: "none",
          }}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={12}
          strokeWidth={2}
          style={{ position: "absolute", right: 10, color: "var(--text-muted)", pointerEvents: "none" }}
        />
      </div>
    </div>
  );
}

export const SelectField = memo(SelectFieldImpl) as typeof SelectFieldImpl;
