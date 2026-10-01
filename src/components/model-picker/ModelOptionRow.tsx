import { memo, type CSSProperties } from "react";
import { Check } from "lucide-react";
import type { FontScale } from "../../contexts/FontSizeContext";
import type { Translator } from "../../i18n";
import type { PickerOption } from "./catalogView";
import { badgeView, disabledReasonText, type BadgeView } from "./strings";

const TONE_COLORS: Readonly<Record<BadgeView["tone"], string>> = {
  muted: "var(--text-muted)",
  warning: "var(--warning-text)",
  danger: "var(--danger-text)",
};

interface ModelOptionRowProps {
  s: FontScale;
  t: Translator;
  option: PickerOption;
  label: string;
  domId: string;
  selected: boolean;
  active: boolean;
  onHover: (id: string) => void;
  onChoose: (option: PickerOption) => void;
}

export const ModelOptionRow = memo(function ModelOptionRow({
  s,
  t,
  option,
  label,
  domId,
  selected,
  active,
  onHover,
  onChoose,
}: ModelOptionRowProps) {
  const disabled = option.disabled !== null;
  const badges = option.badges.map((badge) => badgeView(t, badge));
  const reason = option.disabled ? disabledReasonText(t, option.disabled, option.model.minCliVersion) : "";
  const title = [label, ...badges.map((badge) => badge.hint), reason].filter(Boolean).join(" — ");
  const style: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "9px 12px",
    border: 0,
    borderRadius: 6,
    background: active ? "var(--pane-hover)" : "transparent",
    color: disabled ? "var(--text-muted)" : "var(--text-primary)",
    textAlign: "left",
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: s(11),
  };

  return (
    <button
      type="button"
      role="option"
      id={domId}
      data-model-id={option.id}
      aria-selected={selected}
      aria-disabled={disabled}
      disabled={disabled}
      tabIndex={-1}
      title={title}
      onMouseEnter={() => onHover(option.id)}
      onClick={() => onChoose(option)}
      style={style}
    >
      <span style={{ minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
        {option.model.grokContinue ? ` · ${t("models.continue")}` : ""}
        {reason && <small style={{ display: "block", marginTop: 2, whiteSpace: "normal" }}>{reason}</small>}
      </span>
      {badges.map((badge) => (
        <span
          key={badge.key}
          style={{
            flexShrink: 0,
            padding: "1px 5px",
            borderRadius: 4,
            border: "1px solid var(--control-border)",
            color: TONE_COLORS[badge.tone],
            fontFamily: "var(--font-mono)",
            fontSize: s(9),
            letterSpacing: ".04em",
            whiteSpace: "nowrap",
          }}
        >
          {badge.text}
        </span>
      ))}
      {selected && <Check size={12} style={{ flexShrink: 0 }} />}
    </button>
  );
});
