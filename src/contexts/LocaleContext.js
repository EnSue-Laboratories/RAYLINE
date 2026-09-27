import { createContext, useContext, useMemo } from "react";
import { createTranslator } from "../i18n";

export const LocaleContext = createContext("en-US");

export function useTranslator() {
  const locale = useContext(LocaleContext);
  return useMemo(() => createTranslator(locale), [locale]);
}
