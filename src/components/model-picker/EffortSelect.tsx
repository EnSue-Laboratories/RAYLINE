import { memo, useMemo } from "react";
import type { EffortLevel, ModelDefinition } from "@shared/models";
import type { FontScale } from "../../contexts/FontSizeContext";
import type { Translator } from "../../i18n";
import { MenuSelect, type MenuSelectOption } from "../ui/MenuSelect";
import { displayedEffort, getEffortOptions } from "./catalogView";
import { effortLabel, pickerText } from "./strings";

interface EffortSelectProps {
  s: FontScale;
  t: Translator;
  model: Pick<ModelDefinition, "efforts" | "defaultEffort" | "effort">;
  /** null = the model's default; it is shown selected but no flag is sent. */
  effort: EffortLevel | null;
  onEffortChange: (effort: EffortLevel | null) => void;
  compact?: boolean;
  disabled?: boolean;
  menuZIndex?: number;
}

/**
 * Per-conversation reasoning effort, styled like the model chip. There is no
 * separate "Default" entry: with no explicit choice the model's default level
 * is shown as selected, and picking any level makes it explicit.
 */
export const EffortSelect = memo(function EffortSelect({
  t,
  model,
  effort,
  onEffortChange,
  compact = false,
  disabled = false,
  menuZIndex,
}: EffortSelectProps) {
  const levels = getEffortOptions(model);
  const options = useMemo<MenuSelectOption<EffortLevel>[]>(
    () => levels.map((level) => ({ value: level, label: effortLabel(t, level) })),
    [levels, t],
  );
  const current = displayedEffort(model, effort) ?? model.defaultEffort ?? levels[0];
  if (options.length === 0 || current === undefined) return null;
  const label = pickerText(t, "modelPicker.effort");

  return (
    <MenuSelect
      variant="chip"
      compact={compact}
      value={current}
      options={options}
      onChange={onEffortChange}
      ariaLabel={label}
      title={label}
      disabled={disabled}
      menuZIndex={menuZIndex}
    />
  );
});
