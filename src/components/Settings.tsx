import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { Appearance, Locale, Wallpaper } from "@shared/state/types";
import { useStableCallback } from "../hooks/useStableCallback";
import { AdvancedSection } from "./settings/AdvancedSection";
import { SectionLabel, ToggleSetting } from "./settings/controls";
import { createTranslator, getPaneSurfaceStyle, useFontScale, WindowDragSpacer } from "./settings/deps";
import { DisplaySection } from "./settings/DisplaySection";
import type { RemoteSshConnectResult } from "./settings/helpers";
import { LanguageSection } from "./settings/LanguageSection";
import { MulticaSection } from "./settings/MulticaSection";
import { OpenCodeSection } from "./settings/OpenCodeSection";
import { RemoteSshSection } from "./settings/RemoteSshSection";
import type { AppRegionStyle } from "./settings/styles";
import { ThemeSection } from "./settings/ThemeSection";
import { AppVersionInfo, UpdatesSection } from "./settings/UpdatesSection";
import { useAppVersion } from "./settings/useAppVersion";
import { UpstreamsSection } from "./settings/UpstreamsSection";
import { WallpaperSection } from "./settings/WallpaperSection";

export interface SettingsProps {
  wallpaper?: Wallpaper | null;
  onWallpaperChange?: (wallpaper: Wallpaper | null) => void;
  appearance?: Appearance | null;
  onAppearanceChange?: (appearance: Appearance) => void;
  fontSize: number;
  onFontSizeChange?: (fontSize: number) => void;
  defaultPrBranch?: string | null;
  onDefaultPrBranchChange?: (branch: string) => void;
  coauthorEnabled?: boolean;
  onCoauthorEnabledChange?: (enabled: boolean) => void;
  /** Accepted for App compatibility; the trailer is not editable here yet. */
  coauthorTrailer?: string;
  onCoauthorTrailerChange?: (trailer: string) => void;
  appBlur?: number;
  onAppBlurChange?: (blur: number) => void;
  appOpacity?: number;
  onAppOpacityChange?: (opacity: number) => void;
  developerMode?: boolean;
  onDeveloperModeChange?: (enabled: boolean) => void;
  sidebarTerminalEnabled?: boolean;
  onSidebarTerminalEnabledChange?: (enabled: boolean) => void;
  remoteSshCommand?: string;
  onRemoteSshCommandChange?: (command: string) => void;
  onConnectRemoteSsh?: (command: string) => Promise<RemoteSshConnectResult>;
  chromeControlsOnHover?: boolean;
  onChromeControlsOnHoverChange?: (enabled: boolean) => void;
  notificationSound?: string;
  onNotificationSoundChange?: (soundId: string) => void;
  notificationsMuted?: boolean;
  onNotificationsMutedChange?: (muted: boolean) => void;
  /** `process.platform` of the main process; the updater UI is Windows-only. */
  platform?: string | null;
  locale?: string;
  onLocaleChange?: (locale: Locale) => void;
  windowControlsVisible?: boolean;
  onClose?: () => void;
}

const SCROLL_STYLE = {
  flex: 1,
  overflowY: "auto",
  padding: "0 24px max(96px, calc(96px + env(safe-area-inset-bottom)))",
  boxSizing: "border-box",
} as const;

const HEADER_STYLE: AppRegionStyle = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "0 24px 20px",
  WebkitAppRegion: "no-drag",
  flexShrink: 0,
};

/**
 * Full-page settings view. Each section is memoized and every callback handed
 * down is identity-stable, so editing one control only re-renders its section.
 */
export default function Settings(props: SettingsProps) {
  const {
    wallpaper,
    appearance,
    fontSize,
    defaultPrBranch,
    coauthorEnabled = false,
    appBlur = 0,
    appOpacity = 100,
    developerMode = false,
    sidebarTerminalEnabled = false,
    remoteSshCommand = "",
    onConnectRemoteSsh,
    chromeControlsOnHover = false,
    notificationSound = "glass",
    notificationsMuted = false,
    platform = null,
    locale = "en-US",
    windowControlsVisible = false,
  } = props;
  const s = useFontScale();
  const t = useMemo(() => createTranslator(locale), [locale]);
  const appVersion = useAppVersion();
  const [backHover, setBackHover] = useState(false);
  const hasWallpaper = Boolean(wallpaper?.dataUrl);

  // App passes fresh inline closures for some of these; pin their identity.
  const onWallpaperChange = useStableCallback((next: Wallpaper | null) => props.onWallpaperChange?.(next));
  const onAppearanceChange = useStableCallback((next: Appearance) => props.onAppearanceChange?.(next));
  const onFontSizeChange = useStableCallback((next: number) => props.onFontSizeChange?.(next));
  const onDefaultPrBranchChange = useStableCallback((next: string) => props.onDefaultPrBranchChange?.(next));
  const onCoauthorEnabledChange = useStableCallback((next: boolean) => props.onCoauthorEnabledChange?.(next));
  const onAppBlurChange = useStableCallback((next: number) => props.onAppBlurChange?.(next));
  const onAppOpacityChange = useStableCallback((next: number) => props.onAppOpacityChange?.(next));
  const onDeveloperModeChange = useStableCallback((next: boolean) => props.onDeveloperModeChange?.(next));
  const onSidebarTerminalEnabledChange = useStableCallback((next: boolean) => props.onSidebarTerminalEnabledChange?.(next));
  const onRemoteSshCommandChange = useStableCallback((next: string) => props.onRemoteSshCommandChange?.(next));
  const connectRemoteSsh = useStableCallback((command: string) =>
    props.onConnectRemoteSsh?.(command) ?? Promise.resolve<RemoteSshConnectResult>({ ok: false }),
  );
  const onChromeControlsOnHoverChange = useStableCallback((next: boolean) => props.onChromeControlsOnHoverChange?.(next));
  const onNotificationSoundChange = useStableCallback((next: string) => props.onNotificationSoundChange?.(next));
  const onNotificationsMutedChange = useStableCallback((next: boolean) => props.onNotificationsMutedChange?.(next));
  const onLocaleChange = useStableCallback((next: Locale) => props.onLocaleChange?.(next));

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        position: "relative",
        zIndex: 10,
        ...getPaneSurfaceStyle(hasWallpaper),
        color: "var(--text-primary)",
        fontFamily: "var(--font-ui)",
      }}
    >
      <div style={{ marginRight: windowControlsVisible ? 126 : 0 }}>
        <WindowDragSpacer />
      </div>

      <div style={HEADER_STYLE}>
        <button
          type="button"
          aria-label={t("chromeRail.closeSettings")}
          onClick={props.onClose}
          onMouseEnter={() => setBackHover(true)}
          onMouseLeave={() => setBackHover(false)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            borderRadius: 7,
            background: "var(--control-bg)",
            border: "1px solid var(--control-border)",
            color: backHover
              ? "color-mix(in srgb, var(--text-primary) 82%, transparent)"
              : "color-mix(in srgb, var(--text-primary) 54%, transparent)",
            cursor: "pointer",
            transition: "all .2s",
          }}
        >
          <ArrowLeft size={14} strokeWidth={1.5} />
        </button>
        <span style={{ fontSize: s(14), fontWeight: 600, color: "var(--text-primary)" }}>{t("settings.title")}</span>
      </div>

      <div style={SCROLL_STYLE}>
        <div style={{ width: "100%", maxWidth: 520, margin: "0 auto" }}>
          <AppVersionInfo s={s} t={t} version={appVersion} />
          <ThemeSection s={s} t={t} appearance={appearance} onAppearanceChange={onAppearanceChange} />
          <LanguageSection s={s} t={t} locale={locale} onLocaleChange={onLocaleChange} />
          <ToggleSetting
            s={s}
            title={t("settings.chromeControlsOnHover")}
            description={t("settings.chromeControlsOnHoverDescription")}
            checked={chromeControlsOnHover}
            onToggle={onChromeControlsOnHoverChange}
          />
          <WallpaperSection s={s} t={t} wallpaper={wallpaper} onWallpaperChange={onWallpaperChange} />
          <DisplaySection
            s={s}
            t={t}
            appBlur={appBlur}
            onAppBlurChange={onAppBlurChange}
            appOpacity={appOpacity}
            onAppOpacityChange={onAppOpacityChange}
            fontSize={fontSize}
            onFontSizeChange={onFontSizeChange}
          />

          <SectionLabel s={s}>{t("settings.integrations")}</SectionLabel>
          <UpstreamsSection s={s} t={t} />
          <RemoteSshSection
            s={s}
            t={t}
            command={remoteSshCommand}
            onCommandChange={onRemoteSshCommandChange}
            onConnect={onConnectRemoteSsh ? connectRemoteSsh : undefined}
          />
          <MulticaSection s={s} t={t} />
          <OpenCodeSection s={s} t={t} hasWallpaper={hasWallpaper} />

          <AdvancedSection
            s={s}
            t={t}
            developerMode={developerMode}
            onDeveloperModeChange={onDeveloperModeChange}
            sidebarTerminalEnabled={sidebarTerminalEnabled}
            onSidebarTerminalEnabledChange={onSidebarTerminalEnabledChange}
            notificationSound={notificationSound}
            onNotificationSoundChange={onNotificationSoundChange}
            notificationsMuted={notificationsMuted}
            onNotificationsMutedChange={onNotificationsMutedChange}
            defaultPrBranch={defaultPrBranch ?? ""}
            onDefaultPrBranchChange={onDefaultPrBranchChange}
            coauthorEnabled={coauthorEnabled}
            onCoauthorEnabledChange={onCoauthorEnabledChange}
          />

          {platform === "win32" && <UpdatesSection s={s} t={t} version={appVersion} />}
        </div>
      </div>
    </div>
  );
}
