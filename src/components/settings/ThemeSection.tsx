import { memo, useMemo, useState } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";
import type {
  Appearance,
  AppearancePaletteKey,
  AppearanceTypographyKey,
  ThemeMode,
} from "@shared/state/types";
import { useStableCallback } from "../../hooks/useStableCallback";
import { ColorField, SegmentedControl, SelectField, SettingBlock, SettingHeader, type ChoiceOption } from "./controls";
import {
  DEFAULT_APPEARANCE,
  FONT_OPTIONS,
  normalizeAppearance,
  useTheme,
  type FontOptionGroup,
  type FontScale,
  type ThemeModeSetting,
  type Translate,
} from "./deps";
import { resetAppearanceProfile, updateAppearanceProfile } from "./helpers";
import { AppearancePreview, type AppearancePreviewLabels } from "./AppearancePreview";
import { getSettingsStyles, iconActionStyle } from "./styles";

const PALETTE_FIELDS: readonly { key: AppearancePaletteKey; labelKey: string }[] = [
  { key: "accent", labelKey: "settings.appearanceAccent" },
  { key: "background", labelKey: "settings.appearanceBackground" },
  { key: "pane", labelKey: "settings.appearancePane" },
  { key: "surface", labelKey: "settings.appearanceSurface" },
  { key: "surfaceStrong", labelKey: "settings.appearanceSurfaceStrong" },
  { key: "border", labelKey: "settings.appearanceBorder" },
  { key: "text", labelKey: "settings.appearanceText" },
  { key: "success", labelKey: "settings.appearanceSuccess" },
  { key: "danger", labelKey: "settings.appearanceDanger" },
  { key: "warning", labelKey: "settings.appearanceWarning" },
];

const TYPOGRAPHY_FIELDS: readonly { key: AppearanceTypographyKey; labelKey: string; group: FontOptionGroup }[] = [
  { key: "uiFont", labelKey: "settings.appearanceUiFont", group: "ui" },
  { key: "contentFont", labelKey: "settings.appearanceContentFont", group: "content" },
  { key: "monoFont", labelKey: "settings.appearanceMonoFont", group: "mono" },
];

interface ThemeSectionProps {
  s: FontScale;
  t: Translate;
  appearance: Appearance | null | undefined;
  onAppearanceChange: (next: Appearance) => void;
}

/** APPEARANCE label, theme mode and the per-theme palette/typography editor. */
export const ThemeSection = memo(function ThemeSection({ s, t, appearance, onAppearanceChange }: ThemeSectionProps) {
  const { mode, resolved, setMode } = useTheme();
  const styles = getSettingsStyles(s);
  const [editingTheme, setEditingTheme] = useState<ThemeMode>(() => (resolved === "light" ? "light" : "dark"));
  const [collapsed, setCollapsed] = useState(true);

  const normalized = useMemo(() => normalizeAppearance(appearance), [appearance]);
  const profile = normalized.profiles[editingTheme];

  const themeOptions = useMemo<readonly ChoiceOption<ThemeModeSetting>[]>(() => [
    { value: "auto", label: t("settings.themeAuto") },
    { value: "light", label: t("settings.themeLight") },
    { value: "dark", label: t("settings.themeDark") },
  ], [t]);
  const editingOptions = useMemo<readonly ChoiceOption<ThemeMode>[]>(() => [
    { value: "light", label: t("settings.configureLight") },
    { value: "dark", label: t("settings.configureDark") },
  ], [t]);
  const previewLabels = useMemo<AppearancePreviewLabels>(() => ({
    accent: t("settings.appearanceAccent"),
    surface: t("settings.appearanceSurface"),
    text: t("settings.appearanceText"),
    success: t("settings.appearanceSuccess"),
    danger: t("settings.appearanceDanger"),
    warning: t("settings.appearanceWarning"),
    logo: t("settings.appearanceLogoRed"),
    guideTitle: t("settings.appearanceGuideTitle"),
    logoUse: t("settings.appearanceGuideLogoUse"),
    accentUse: t("settings.appearanceGuideAccentUse"),
    successUse: t("settings.appearanceGuideSuccessUse"),
    dangerUse: t("settings.appearanceGuideDangerUse"),
    warningUse: t("settings.appearanceGuideWarningUse"),
    surfaceTextUse: t("settings.appearanceGuideSurfaceTextUse"),
  }), [t]);

  const handlePaletteChange = useStableCallback((key: AppearancePaletteKey, value: string) => {
    onAppearanceChange(updateAppearanceProfile(normalizeAppearance(appearance), editingTheme, { section: "palette", key, value }));
  });
  const handleTypographyChange = useStableCallback((key: AppearanceTypographyKey, value: string) => {
    onAppearanceChange(updateAppearanceProfile(normalizeAppearance(appearance), editingTheme, { section: "typography", key, value }));
  });
  const handleResetProfile = () => {
    onAppearanceChange(resetAppearanceProfile(normalizeAppearance(appearance), editingTheme, DEFAULT_APPEARANCE));
  };
  const toggleLabel = collapsed ? t("settings.expandThemeManagement") : t("settings.collapseThemeManagement");

  return (
    <>
      <div style={{ ...styles.sectionLabel, marginTop: 0 }}>{t("settings.appearance")}</div>
      <SettingBlock style={{ marginBottom: 24 }}>
        <div style={{ marginBottom: 14 }}>
          <SettingHeader s={s} title={t("settings.theme")} description={t("settings.themeDescription")} spacing={10} />
          <SegmentedControl options={themeOptions} value={mode} onChange={setMode} s={s} />
        </div>

        <div style={{ marginBottom: collapsed ? 0 : 14 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: collapsed ? 0 : 10,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <SettingHeader s={s} title={t("settings.appearanceProfile")} description={t("settings.appearanceProfileDescription")} />
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              {!collapsed && (
                <>
                  <button
                    type="button"
                    onClick={handleResetProfile}
                    title={t("settings.resetProfile")}
                    aria-label={t("settings.resetProfile")}
                    style={iconActionStyle}
                  >
                    <RotateCcw size={12} strokeWidth={1.8} />
                  </button>
                  <button type="button" onClick={() => onAppearanceChange(DEFAULT_APPEARANCE)} style={styles.smallAction}>
                    {t("settings.resetAll")}
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setCollapsed((value) => !value)}
                title={toggleLabel}
                aria-label={toggleLabel}
                aria-expanded={!collapsed}
                style={iconActionStyle}
              >
                <ChevronDown
                  size={13}
                  strokeWidth={2}
                  style={{ transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 140ms ease" }}
                />
              </button>
            </div>
          </div>
          {!collapsed && <SegmentedControl options={editingOptions} value={editingTheme} onChange={setEditingTheme} s={s} />}
        </div>

        {!collapsed && (
          <>
            <AppearancePreview profile={profile} labels={previewLabels} s={s} />
            <div style={{ overflow: "hidden", borderRadius: 8, border: "1px solid var(--control-border)" }}>
              {PALETTE_FIELDS.map((field) => (
                <ColorField
                  key={field.key}
                  fieldKey={field.key}
                  label={t(field.labelKey)}
                  value={profile.palette[field.key]}
                  onChange={handlePaletteChange}
                  s={s}
                />
              ))}
            </div>
            <div style={{ marginTop: 14, overflow: "hidden", borderRadius: 8, border: "1px solid var(--control-border)" }}>
              {TYPOGRAPHY_FIELDS.map((field) => (
                <SelectField
                  key={field.key}
                  fieldKey={field.key}
                  label={t(field.labelKey)}
                  value={profile.typography[field.key]}
                  options={FONT_OPTIONS[field.group]}
                  onChange={handleTypographyChange}
                  s={s}
                />
              ))}
            </div>
          </>
        )}
      </SettingBlock>
    </>
  );
});
