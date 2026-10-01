import { memo, type CSSProperties } from "react";
import { Check } from "lucide-react";
import { ToggleSwitch } from "./controls";
import type { FontScale, Translator } from "./deps";
import type { OpenCodeDraft } from "./helpers";
import { OpenCodeProviderCombobox } from "./OpenCodeProviderCombobox";
import { getSettingsStyles, type AppRegionStyle } from "./styles";
import type { OpenCodeEditorMode } from "./useOpenCodeEditor";

interface OpenCodeModelFormProps {
  s: FontScale;
  t: Translator;
  mode: Exclude<OpenCodeEditorMode, { kind: "closed" }>;
  draft: OpenCodeDraft;
  saving: boolean;
  providerOptions: readonly string[];
  hasWallpaper: boolean;
  onDraftChange: (patch: Partial<OpenCodeDraft>) => void;
  onCancel: () => void;
  onSave: () => void;
}

const GRID_TWO: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 8 };

function dialogStyle(hasWallpaper: boolean): AppRegionStyle {
  return {
    position: "absolute",
    zIndex: 60,
    top: 92,
    left: "50%",
    transform: "translateX(-50%)",
    width: "min(620px, calc(100% - 48px))",
    boxSizing: "border-box",
    padding: 14,
    borderRadius: 10,
    border: "1px solid color-mix(in srgb, var(--text-primary) 8%, transparent)",
    // The dialog scrolls with the settings page; without a wallpaper there is
    // nothing worth blurring, so skip the per-frame backdrop filter.
    ...(hasWallpaper
      ? { background: "rgba(12,14,22,0.72)", backdropFilter: "blur(38px) saturate(1.15)" }
      : { background: "var(--surface-glass)" }),
    boxShadow: "0 24px 70px rgba(0,0,0,0.45)",
    WebkitAppRegion: "no-drag",
  };
}

/** Add / edit / duplicate form. Editing renders as a floating dialog. */
export const OpenCodeModelForm = memo(function OpenCodeModelForm({
  s,
  t,
  mode,
  draft,
  saving,
  providerOptions,
  hasWallpaper,
  onDraftChange,
  onCancel,
  onSave,
}: OpenCodeModelFormProps) {
  const styles = getSettingsStyles(s);
  const editing = mode.kind === "edit";
  const canSave = !saving && Boolean(draft.providerId.trim()) && Boolean(draft.modelId.trim());
  const title = editing ? t("settings.opencodeEditModel") : t("settings.opencodeAddModel");
  const apiKeyPlaceholder = mode.kind === "duplicate"
    ? t("settings.opencodeDuplicateApiKeyPlaceholder")
    : editing
      ? t("settings.opencodeApiKeyEditPlaceholder")
      : t("settings.opencodeApiKeyPlaceholder");
  const submitLabel = saving
    ? t("settings.saving")
    : editing
      ? t("settings.opencodeUpdateModel")
      : mode.kind === "duplicate"
        ? t("settings.opencodeDuplicateSubmit")
        : t("settings.opencodeSaveModel");

  return (
    <div role={editing ? "dialog" : undefined} aria-label={editing ? title : undefined} style={editing ? dialogStyle(hasWallpaper) : undefined}>
      <div
        style={{
          fontSize: s(11),
          color: "color-mix(in srgb, var(--text-primary) 55%, transparent)",
          marginBottom: 8,
          fontFamily: "var(--font-mono)",
          letterSpacing: ".02em",
        }}
      >
        {title}
      </div>
      <div style={{ ...GRID_TWO, marginBottom: 8 }}>
        <OpenCodeProviderCombobox
          s={s}
          t={t}
          value={draft.providerId}
          options={providerOptions}
          hasWallpaper={hasWallpaper}
          onChange={(providerId) => onDraftChange({ providerId })}
        />
        <input
          type="text"
          value={draft.modelId}
          placeholder={t("settings.opencodeModelPlaceholder")}
          aria-label={t("settings.opencodeModelPlaceholder")}
          onChange={(e) => onDraftChange({ modelId: e.target.value })}
          spellCheck={false}
          style={styles.input}
        />
        <input
          type="text"
          value={draft.label}
          placeholder={t("settings.opencodeLabelPlaceholder")}
          aria-label={t("settings.opencodeLabelPlaceholder")}
          onChange={(e) => onDraftChange({ label: e.target.value })}
          spellCheck={false}
          style={{ ...styles.input, gridColumn: "1 / -1" }}
        />
      </div>
      <div style={{ ...GRID_TWO, marginBottom: 10 }}>
        <input
          type="password"
          value={draft.apiKey}
          placeholder={apiKeyPlaceholder}
          aria-label={apiKeyPlaceholder}
          onChange={(e) => onDraftChange({ apiKey: e.target.value })}
          spellCheck={false}
          style={styles.input}
        />
        <input
          type="text"
          value={draft.baseURL}
          placeholder={t("settings.opencodeBaseUrlPlaceholder")}
          aria-label={t("settings.opencodeBaseUrlPlaceholder")}
          onChange={(e) => onDraftChange({ baseURL: e.target.value })}
          spellCheck={false}
          style={styles.input}
        />
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "8px 10px",
          marginBottom: 10,
          borderRadius: 7,
          border: "1px solid color-mix(in srgb, var(--text-primary) 6%, transparent)",
          background: "color-mix(in srgb, var(--text-primary) 2.5%, transparent)",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: s(12), color: "color-mix(in srgb, var(--text-primary) 76%, transparent)", marginBottom: 2 }}>
            {t("settings.opencodeThinking")}
          </div>
          <div style={{ fontSize: s(10), color: "color-mix(in srgb, var(--text-primary) 30%, transparent)", lineHeight: 1.35 }}>
            {t("settings.opencodeThinkingDescription")}
          </div>
        </div>
        <ToggleSwitch
          checked={draft.thinking}
          onToggle={(thinking) => onDraftChange({ thinking })}
          variant="soft"
          ariaLabel={t("settings.opencodeThinking")}
        />
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "flex-start", marginBottom: 12 }}>
        <button type="button" onClick={onCancel} disabled={saving} style={styles.compactButton(!saving)}>
          {t("settings.opencodeCancelAdd")}
        </button>
        <button type="button" onClick={onSave} disabled={!canSave} style={styles.compactButton(canSave)}>
          <Check size={12} strokeWidth={1.8} />
          {submitLabel}
        </button>
      </div>
    </div>
  );
});
