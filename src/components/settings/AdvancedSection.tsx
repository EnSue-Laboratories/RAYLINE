import { MenuSelect } from "../ui/MenuSelect";
import { memo } from "react";
import { Check } from "lucide-react";
import { SectionLabel, SettingHeader, ToggleSetting } from "./controls";
import { CHIME_SOUNDS, playChime, type FontScale, type Translator } from "./deps";
import { getSettingsStyles, TEXT_STRONG } from "./styles";

const CHIME_OPTIONS = CHIME_SOUNDS.map((sound) => ({ value: sound.id, label: sound.label }));

const DIMMER_DESCRIPTION = "color-mix(in srgb, var(--text-primary) 30%, transparent)";

interface AdvancedSectionProps {
  s: FontScale;
  t: Translator;
  developerMode: boolean;
  onDeveloperModeChange: (value: boolean) => void;
  sidebarTerminalEnabled: boolean;
  onSidebarTerminalEnabledChange: (value: boolean) => void;
  notificationSound: string;
  onNotificationSoundChange: (id: string) => void;
  notificationsMuted: boolean;
  onNotificationsMutedChange: (muted: boolean) => void;
  defaultPrBranch: string;
  onDefaultPrBranchChange: (branch: string) => void;
  coauthorEnabled: boolean;
  onCoauthorEnabledChange: (value: boolean) => void;
}

/** ADVANCED: developer mode, and (when on) terminal, notifications and git. */
export const AdvancedSection = memo(function AdvancedSection(props: AdvancedSectionProps) {
  const { s, t, developerMode, onDeveloperModeChange } = props;
  return (
    <>
      <SectionLabel s={s}>{t("settings.advanced")}</SectionLabel>
      <ToggleSetting
        s={s}
        title={t("settings.developerMode")}
        description={t("settings.developerModeDescription")}
        checked={developerMode}
        onToggle={onDeveloperModeChange}
      />
      {developerMode && <DeveloperSettings {...props} />}
    </>
  );
});

function DeveloperSettings({
  s,
  t,
  sidebarTerminalEnabled,
  onSidebarTerminalEnabledChange,
  notificationSound,
  onNotificationSoundChange,
  notificationsMuted,
  onNotificationsMutedChange,
  defaultPrBranch,
  onDefaultPrBranchChange,
  coauthorEnabled,
  onCoauthorEnabledChange,
}: AdvancedSectionProps) {
  const styles = getSettingsStyles(s);
  const mutedOpacity = notificationsMuted ? 0.4 : 1;
  return (
    <>
      <SectionLabel s={s} dim>{t("settings.terminal")}</SectionLabel>
      <ToggleSetting
        s={s}
        title={t("settings.sidebarTerminal")}
        description={t("settings.sidebarTerminalDescription")}
        descriptionColor={DIMMER_DESCRIPTION}
        checked={sidebarTerminalEnabled}
        onToggle={onSidebarTerminalEnabledChange}
        variant="soft"
      />

      <SectionLabel s={s}>{t("settings.notifications")}</SectionLabel>
      <div style={{ marginBottom: 20 }}>
        <SettingHeader s={s} title={t("settings.completionChime")} description={t("settings.completionChimeDescription")} spacing={10} />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, display: "flex", minWidth: 0 }}>
            <MenuSelect
              value={notificationSound}
              options={CHIME_OPTIONS}
              ariaLabel={t("settings.completionChime")}
              onChange={onNotificationSoundChange}
              disabled={notificationsMuted}
              triggerStyle={{ width: "100%", height: 32 }}
            />
          </div>
          <button
            type="button"
            onClick={() => playChime(notificationSound)}
            disabled={notificationsMuted}
            style={{
              height: 32,
              padding: "0 12px",
              background: "var(--control-bg)",
              border: "1px solid var(--control-border)",
              borderRadius: 7,
              color: TEXT_STRONG,
              fontSize: s(12),
              cursor: notificationsMuted ? "not-allowed" : "pointer",
              opacity: mutedOpacity,
            }}
          >
            {t("settings.preview")}
          </button>
        </div>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={notificationsMuted}
          onChange={(e) => onNotificationsMutedChange(e.target.checked)}
          style={{ opacity: 0, width: 0, height: 0, margin: 0, pointerEvents: "none" }}
        />
        <span
          aria-hidden
          style={{
            width: 18,
            height: 18,
            borderRadius: 5,
            border: "1px solid var(--control-border)",
            background: "transparent",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: notificationsMuted ? "inset 0 0 0 1px var(--control-border)" : "none",
            flexShrink: 0,
            transition: "border-color .15s, background .15s, box-shadow .15s",
          }}
        >
          <Check
            size={12}
            strokeWidth={2.2}
            color="var(--text-primary)"
            style={{
              opacity: notificationsMuted ? 1 : 0,
              transform: notificationsMuted ? "scale(1)" : "scale(0.75)",
              transition: "opacity .12s ease, transform .12s ease",
            }}
          />
        </span>
        <span style={{ fontSize: s(13), color: TEXT_STRONG }}>{t("settings.muteCompletionChime")}</span>
      </label>

      <SectionLabel s={s}>{t("settings.git")}</SectionLabel>
      <div style={{ marginBottom: 24 }}>
        <SettingHeader s={s} title={t("settings.defaultPrBranch")} description={t("settings.defaultPrBranchDescription")} spacing={10} />
        <input
          type="text"
          value={defaultPrBranch}
          placeholder="main"
          aria-label={t("settings.defaultPrBranch")}
          onChange={(e) => onDefaultPrBranchChange(e.target.value)}
          onBlur={(e) => {
            if (!e.target.value.trim()) onDefaultPrBranchChange("main");
          }}
          spellCheck={false}
          style={styles.input}
        />
      </div>
      <ToggleSetting
        s={s}
        title={t("settings.autoCoauthor")}
        description={t("settings.autoCoauthorDescription")}
        checked={coauthorEnabled}
        onToggle={onCoauthorEnabledChange}
        marginBottom={12}
      />
    </>
  );
}
