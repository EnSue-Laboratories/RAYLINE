/**
 * Typed views of renderer modules that are still `// @ts-nocheck` (owned by
 * other migration packages). Each cast is done once here so the sidebar/git
 * components never see inferred `any`s. Delete an entry once its owner lands
 * real types and import the module directly instead.
 */
import { useFontScale as useFontScaleUntyped } from "../../contexts/FontSizeContext";
import { createTranslator as createTranslatorUntyped } from "../../i18n";
import useGitStatusUntyped from "../../hooks/useGitStatus";
import {
  applyPaneInteractionStyle as applyPaneInteractionStyleUntyped,
  getPaneInteractionStyle as getPaneInteractionStyleUntyped,
} from "../../utils/paneSurface";
import { useMemo } from "react";
import type { GitStatus } from "@shared/git/types";
import type { FontScale, Translator } from "./types";

// TODO(ts-boundary): drop once data-i18n lands (contexts/FontSizeContext).
export const useFontScale = useFontScaleUntyped as unknown as () => FontScale;

// TODO(ts-boundary): drop once data-i18n lands (i18n).
export const createTranslator = createTranslatorUntyped as unknown as (locale: string | null | undefined) => Translator;

/**
 * Translator for an explicit locale prop. PR #230 reads the locale from a
 * `LocaleContext` (`useTranslator()`), which does not exist on this branch yet.
 * TODO(ts-boundary): switch callers to data-i18n's LocaleContext `useTranslator`
 * once it lands, keeping the prop as an override.
 */
export function useLocaleTranslator(locale: string | null | undefined): Translator {
  return useMemo(() => createTranslator(locale), [locale]);
}

export interface GitStatusHandle {
  /** null = not loaded yet, or cwd is not a git repo. */
  status: GitStatus | null;
  /** Re-runs `git status`. */
  refresh: () => Promise<void>;
  /** `git fetch` then `git status`. */
  refetch: () => Promise<void>;
}

// TODO(ts-boundary): drop once app-shell lands (hooks/useGitStatus).
export const useGitStatus = useGitStatusUntyped as unknown as (cwd: string | null | undefined) => GitStatusHandle;

export type PaneInteractionState = "idle" | "hover" | "active";

export interface PaneInteractionStyle {
  background: string;
  backdropFilter: string;
  boxShadow: string;
}

// TODO(ts-boundary): drop once utils/paneSurface is converted.
export const getPaneInteractionStyle = getPaneInteractionStyleUntyped as unknown as (
  state: PaneInteractionState,
) => PaneInteractionStyle;

// TODO(ts-boundary): drop once utils/paneSurface is converted.
export const applyPaneInteractionStyle = applyPaneInteractionStyleUntyped as unknown as (
  element: HTMLElement,
  state: PaneInteractionState,
) => void;
