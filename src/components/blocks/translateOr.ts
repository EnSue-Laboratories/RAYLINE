import { interpolate, isMessageKey, type TranslationParams, type Translator } from "../../i18n";

/**
 * Translate `key` when the catalogue has it, else use the English
 * `fallback` (for strings ported from #230 whose keys data-i18n hasn't
 * added yet — they switch over automatically once the keys exist).
 */
export function translateOr(t: Translator, key: string, fallback: string, params?: TranslationParams): string {
  return isMessageKey(key) ? t(key, params) : interpolate(fallback, params);
}
