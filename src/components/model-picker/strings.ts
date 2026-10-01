/**
 * Model-picker strings that are not in the locale files yet. They resolve
 * through the normal translator once data-i18n adds the keys; until then the
 * English fallback below is used. Keep in sync with the list in the PR body.
 */

import type { EffortLevel } from "@shared/models";
import type { DisabledReason, ModelBadge } from "./catalogView";
import { interpolate, isMessageKey, type TranslationParams, type Translator } from "../../i18n";

export const PICKER_FALLBACK_STRINGS = {
  "modelPicker.effort": "Reasoning effort",
  "modelPicker.effortDefault": "Default ({effort})",
  "modelPicker.effortLow": "Low",
  "modelPicker.effortMedium": "Medium",
  "modelPicker.effortHigh": "High",
  "modelPicker.effortXhigh": "Extra high",
  "modelPicker.effortMax": "Max",
  "modelPicker.effortUltra": "Ultra",
  "modelPicker.badgeLegacy": "Legacy",
  "modelPicker.badgeRetiring": "Retires {date}",
  "modelPicker.badgeRetired": "Retired",
  "modelPicker.successorHint": "Use {model} instead.",
  "modelPicker.badgeNeedsCli": "CLI ≥ {version}",
  "modelPicker.needsCliHint": "Requires CLI {version} or newer.",
  "modelPicker.cliOutdated": "Your CLI is older than {version}. Update it to use this model.",
} as const;

export type PickerStringKey = keyof typeof PICKER_FALLBACK_STRINGS;

export function pickerText(t: Translator, key: PickerStringKey, params?: TranslationParams): string {
  return isMessageKey(key) ? t(key, params) : interpolate(PICKER_FALLBACK_STRINGS[key], params);
}

const EFFORT_KEYS: Readonly<Record<EffortLevel, PickerStringKey>> = {
  low: "modelPicker.effortLow",
  medium: "modelPicker.effortMedium",
  high: "modelPicker.effortHigh",
  xhigh: "modelPicker.effortXhigh",
  max: "modelPicker.effortMax",
  ultra: "modelPicker.effortUltra",
};

export function effortLabel(t: Translator, effort: EffortLevel): string {
  return pickerText(t, EFFORT_KEYS[effort]);
}

// ── Badges ──────────────────────────────────────────────────────────────────

export interface BadgeView {
  key: string;
  text: string;
  hint: string;
  tone: "muted" | "warning" | "danger";
}

export function badgeView(t: Translator, badge: ModelBadge): BadgeView {
  switch (badge.kind) {
    case "legacy":
      return { key: "legacy", text: pickerText(t, "modelPicker.badgeLegacy"), hint: "", tone: "muted" };
    case "retiring": {
      const successor = badge.successorName ? pickerText(t, "modelPicker.successorHint", { model: badge.successorName }) : "";
      const text = pickerText(t, "modelPicker.badgeRetiring", { date: badge.date });
      return { key: "retiring", text, hint: [`${text}.`, successor].filter(Boolean).join(" "), tone: "warning" };
    }
    case "retired": {
      const successor = badge.successorName ? pickerText(t, "modelPicker.successorHint", { model: badge.successorName }) : "";
      const text = pickerText(t, "modelPicker.badgeRetired");
      return { key: "retired", text, hint: [`${text}.`, successor].filter(Boolean).join(" "), tone: "danger" };
    }
    case "needs-cli":
      return {
        key: "needs-cli",
        text: pickerText(t, "modelPicker.badgeNeedsCli", { version: badge.minVersion }),
        hint: pickerText(t, badge.verified ? "modelPicker.cliOutdated" : "modelPicker.needsCliHint", { version: badge.minVersion }),
        tone: badge.verified ? "warning" : "muted",
      };
    default: {
      const exhaustive: never = badge;
      return exhaustive;
    }
  }
}

export function disabledReasonText(t: Translator, reason: DisabledReason, minVersion: string | undefined): string {
  switch (reason) {
    case "unavailable":
      return t("models.runtimeUnavailable");
    case "planner":
      return t("models.plannerUnavailable");
    case "cli-outdated":
      return pickerText(t, "modelPicker.cliOutdated", { version: minVersion ?? "" });
    default: {
      const exhaustive: never = reason;
      return exhaustive;
    }
  }
}
