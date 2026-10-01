import { createTranslator as createTranslatorUntyped } from "../../i18n";

export type TranslationVars = Readonly<Record<string, string | number>>;
export type Translator = (key: string, vars?: TranslationVars) => string;

// TODO(ts-boundary): drop the cast once data-i18n lands a typed createTranslator.
export const createTranslator = createTranslatorUntyped as (locale?: string | null) => Translator;

/**
 * Translate `key`, or use the English `fallback` while the key is missing
 * from the catalogue (createTranslator returns the key itself then).
 */
export function translateOr(t: Translator, key: string, fallback: string, vars?: TranslationVars): string {
  const value = t(key, vars);
  if (value !== key) return value;
  let text = fallback;
  for (const [name, v] of Object.entries(vars ?? {})) text = text.replaceAll(`{${name}}`, String(v));
  return text;
}
