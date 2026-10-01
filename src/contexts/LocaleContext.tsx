/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createTranslator, DEFAULT_LOCALE, normalizeLocale, type Locale, type Translator } from "../i18n";

/**
 * The app's single locale context. Mount `<LocaleProvider locale={locale}
 * onLocaleChange={setLocale}>` once at the root of each window.
 *
 * The locale and its setter live in separate contexts so components that
 * only change the locale never re-render on a locale switch, and the locale
 * context holds a primitive (consumers re-render only when it changes).
 * `<LocaleContext.Provider value={locale}>` (PR #230 style) also works for
 * read-only consumers.
 */
export const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export type SetLocale = (locale: Locale) => void;

const noop: SetLocale = () => {};

export const SetLocaleContext = createContext<SetLocale>(noop);

export interface LocaleProviderProps {
  /** Any locale tag; normalized with `normalizeLocale`. */
  locale: string;
  /** Called by `useSetLocale()` consumers; keep it stable (e.g. a state setter). */
  onLocaleChange?: SetLocale;
  children?: ReactNode;
}

export function LocaleProvider({ locale, onLocaleChange = noop, children }: LocaleProviderProps) {
  return (
    <SetLocaleContext.Provider value={onLocaleChange}>
      <LocaleContext.Provider value={normalizeLocale(locale)}>{children}</LocaleContext.Provider>
    </SetLocaleContext.Provider>
  );
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useSetLocale(): SetLocale {
  return useContext(SetLocaleContext);
}

/**
 * Translator for the context locale. `createTranslator` caches one function
 * per locale, so the identity is stable and safe in dependency arrays.
 */
export function useTranslator(): Translator {
  return createTranslator(useContext(LocaleContext));
}

export interface LanguageValue {
  lang: Locale;
  setLang: SetLocale;
}

/** `{ lang, setLang }` view over the locale contexts (memoized). */
export function useLanguageValue(): LanguageValue {
  const lang = useContext(LocaleContext);
  const setLang = useContext(SetLocaleContext);
  return useMemo(() => ({ lang, setLang }), [lang, setLang]);
}
