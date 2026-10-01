/**
 * @deprecated Compatibility shim. The single locale context is
 * `LocaleContext` (src/contexts/LocaleContext), provided by `LocaleProvider`.
 * `useLanguage()` reads from it, so it works under that provider.
 */
export { useLanguageValue as useLanguage, type LanguageValue as LanguageContextValue } from "./LocaleContext";
