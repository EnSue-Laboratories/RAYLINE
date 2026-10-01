import { memo } from "react";
import type { Locale } from "@shared/state/types";
import type { FontScale, MessageKey, Translator } from "./deps";
import { getSettingsStyles } from "./styles";

const LANGUAGES: readonly { locale: Locale; labelKey: MessageKey }[] = [
  { locale: "en-US", labelKey: "settings.languageEnglish" },
  { locale: "zh-CN", labelKey: "settings.languageChinese" },
];

interface LanguageSectionProps {
  s: FontScale;
  t: Translator;
  locale: string;
  onLocaleChange: (locale: Locale) => void;
}

/** Single language picker (#230 replaced the duplicate select/bottom section). */
export const LanguageSection = memo(function LanguageSection({ s, t, locale, onLocaleChange }: LanguageSectionProps) {
  const styles = getSettingsStyles(s);
  return (
    <div style={{ marginBottom: 24 }}>
      <div
        style={{
          ...styles.sectionLabel,
          color: "color-mix(in srgb, var(--text-primary) 25%, transparent)",
          marginTop: 0,
          marginBottom: 14,
        }}
      >
        {t("settings.language")}
      </div>
      <div style={{ ...styles.title, marginBottom: 10 }}>{t("settings.languageLabel")}</div>
      <div role="radiogroup" aria-label={t("settings.languageLabel")} style={{ display: "flex", gap: 8 }}>
        {LANGUAGES.map(({ locale: value, labelKey }) => {
          const selected = locale === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onLocaleChange(value)}
              style={{
                padding: "6px 16px",
                borderRadius: 7,
                background: selected ? "var(--control-bg-active)" : "var(--control-bg-subtle)",
                border: selected ? "1px solid var(--control-border-strong)" : "1px solid var(--control-border-soft)",
                color: selected ? "var(--text-primary)" : "var(--text-secondary)",
                fontSize: s(12),
                cursor: "pointer",
                transition: "all .2s",
                fontFamily: "var(--font-ui)",
              }}
            >
              {t(labelKey)}
            </button>
          );
        })}
      </div>
    </div>
  );
});
