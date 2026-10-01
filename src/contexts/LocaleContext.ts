import { createContext, useContext } from "react";
import { createTranslator, DEFAULT_LOCALE, type Locale, type Translator } from "../i18n";

/**
 * Current UI locale. Holds a primitive, so consumers re-render only when the
 * locale itself changes. Provide it once near the root:
 * `<LocaleContext.Provider value={locale}>`.
 *
 * (Replaces the never-used `LanguageContext` `{ lang, setLang }` object.)
 */
export const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/**
 * Translator for the context locale. `createTranslator` caches one function
 * per locale, so the identity is stable and safe in dependency arrays.
 */
export function useTranslator(): Translator {
  return createTranslator(useContext(LocaleContext));
}
