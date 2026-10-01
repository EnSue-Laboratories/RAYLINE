import { useLocale } from "../../contexts/LocaleContext";
import { createTranslator, type Translator } from "../../i18n";

/**
 * Translator for an explicit `locale` prop when given (App still passes one to
 * Sidebar / BranchSelector / GitStatusPill / project dialogs), else the
 * LocaleContext locale. createTranslator is cached per locale, so the identity
 * is stable.
 */
export function useLocaleTranslator(locale?: string | null): Translator {
  const contextLocale = useLocale();
  return createTranslator(locale ?? contextLocale);
}
