import { createContext, useContext } from "react";

/**
 * LanguageContext — provides { lang, setLang } to the component tree.
 * The actual translation module (src/i18n.js) is a singleton; this context
 * just triggers re-renders when the language changes.
 */
export const LanguageContext = createContext({ lang: "en", setLang: () => {} });

export function useLanguage() {
  return useContext(LanguageContext);
}
