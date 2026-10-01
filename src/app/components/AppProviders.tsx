import { memo, useEffect, type ReactNode } from "react";
import { FontSizeContext } from "../../contexts/FontSizeContext";
import { LocaleProvider } from "../../contexts/LocaleContext";
import { useTheme } from "../../contexts/ThemeContext";
import { useAppSetting } from "../../store/appSettings";
import { applyAppearanceToDocument, applyAppearanceWindowBackground } from "../../utils/appearance";
import { setLocale } from "../actions/settings";
import { getApi } from "../lib/api";
import { AgentProvider } from "./AgentProvider";

/** Applies the appearance profile for the resolved theme to the document and window. */
const AppearanceSync = memo(function AppearanceSync() {
  const appearance = useAppSetting("appearance");
  const { resolved } = useTheme();
  useEffect(() => {
    applyAppearanceToDocument(appearance, resolved);
    applyAppearanceWindowBackground(appearance, resolved, getApi());
  }, [appearance, resolved]);
  return null;
});

/**
 * Root contexts. Subscribes to locale/font size itself and passes `children`
 * through, so a locale or font change re-renders only context consumers.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const locale = useAppSetting("locale");
  const fontSize = useAppSetting("fontSize");
  return (
    <LocaleProvider locale={locale} onLocaleChange={setLocale}>
      <FontSizeContext.Provider value={fontSize}>
        <AppearanceSync />
        <AgentProvider>{children}</AgentProvider>
      </FontSizeContext.Provider>
    </LocaleProvider>
  );
}
