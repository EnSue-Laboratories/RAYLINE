/**
 * UI string lookup. Dictionaries live in ./locales; en-US defines the key set
 * (`MessageKey`) and is the fallback for every other locale.
 *
 * `createTranslator(locale)` returns a cached function per locale, so calling
 * it during render (with or without `useMemo`) always yields the same
 * identity and never rebuilds a dictionary.
 */

import type { Locale } from "@shared/state/types";
import { enUS, type MessageKey } from "./locales/en-US";
import { zhCN } from "./locales/zh-CN";

export type { Locale } from "@shared/state/types";
export type { MessageKey } from "./locales/en-US";

export const DEFAULT_LOCALE: Locale = "en-US";
export const SUPPORTED_LOCALES: readonly Locale[] = ["en-US", "zh-CN"];

/** Values substituted into `{name}` placeholders (stringified with `String`). */
export type TranslationParams = Readonly<Record<string, string | number | boolean | null | undefined>>;

export type Translator = (key: MessageKey, params?: TranslationParams) => string;

type Dictionary = Readonly<Record<string, string>>;

const DICTIONARIES: Readonly<Record<Locale, Dictionary>> = {
  "en-US": enUS,
  "zh-CN": zhCN,
};

const FALLBACK: Dictionary = enUS;
const PLACEHOLDER = /\{([^{}]+)\}/g;

export function isMessageKey(value: unknown): value is MessageKey {
  return typeof value === "string" && Object.hasOwn(enUS, value);
}

/** Any `zh*` tag maps to zh-CN; everything else (including non-strings) to en-US. */
export function normalizeLocale(locale: unknown): Locale {
  if (typeof locale !== "string") return DEFAULT_LOCALE;
  return locale.toLowerCase().startsWith("zh") ? "zh-CN" : DEFAULT_LOCALE;
}

export function detectDefaultLocale(): Locale {
  if (typeof navigator === "undefined") return DEFAULT_LOCALE;
  return normalizeLocale(navigator.language || DEFAULT_LOCALE);
}

/**
 * Replace `{name}` placeholders that have an entry in `params`; unknown
 * placeholders are left as-is. Substituted text is not re-scanned.
 */
export function interpolate(template: string, params?: TranslationParams): string {
  if (!params || !template.includes("{")) return template;
  return template.replace(PLACEHOLDER, (match, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  );
}

function lookup(dictionary: Dictionary, key: string): string {
  return dictionary[key] ?? FALLBACK[key] ?? key;
}

const translatorCache = new Map<Locale, Translator>();

/**
 * Translator for `locale` (normalized). Missing keys fall back to en-US, then
 * to the key itself. Cached: the same locale always returns the same function.
 */
export function createTranslator(locale: unknown): Translator {
  const normalized = normalizeLocale(locale);
  const cached = translatorCache.get(normalized);
  if (cached) return cached;
  const dictionary = DICTIONARIES[normalized];
  const translate: Translator = (key, params) => interpolate(lookup(dictionary, key), params);
  translatorCache.set(normalized, translate);
  return translate;
}
