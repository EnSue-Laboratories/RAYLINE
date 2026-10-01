import { memo, type CSSProperties } from "react";
import type { FontScale } from "../../contexts/FontSizeContext";
import type { Translator } from "../../i18n";
import type { PickerOption } from "./catalogView";
import { badgeView, disabledReasonText } from "./strings";

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
  // Typography matches the original picker: mono rows, uppercase tag on the right.
  const style: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    width: "100%",
    padding: "9px 13px",
    border: 0,
    borderRadius: 7,
    background: selected
      ? "var(--control-bg)"
      : active
        ? "color-mix(in srgb, var(--control-bg) 63%, transparent)"
        : "transparent",
    color: disabled
      ? "var(--text-muted)"
      : selected
        ? "var(--text-primary)"
        : "color-mix(in srgb, var(--text-primary) 43%, transparent)",
    textAlign: "left",
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: s(11),
    fontFamily: "var(--font-mono)",
    transition: "background .12s, color .12s",
  };
  const tag = option.model.tag && option.model.tag.toUpperCase() !== label.toUpperCase() ? option.model.tag : "";

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
      {tag && (
        <span style={{ flexShrink: 0, fontSize: s(9), opacity: 0.4, letterSpacing: ".1em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
          {tag}
        </span>
      )}
    </button>
  );
});
