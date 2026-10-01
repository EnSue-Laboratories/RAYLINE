import { memo, useMemo, type CSSProperties } from "react";
import { Copy, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import type { OpenCodeModelEntry } from "@shared/providers/types";
import { ToggleSwitch } from "./controls";
import { useOpenCodeModels, type FontScale, type Translate } from "./deps";
import { buildOpenCodeProviderOptions, isOpenCodeReady } from "./helpers";
import { OpenCodeModelForm } from "./OpenCodeModelForm";
import { getSettingsStyles, smallIconButtonStyle } from "./styles";
import { useOpenCodeEditor } from "./useOpenCodeEditor";

interface OpenCodeSectionProps {
  s: FontScale;
  t: Translate;
  hasWallpaper: boolean;
}

/** OpenCode install status and the user's custom provider/model list. */
export const OpenCodeSection = memo(function OpenCodeSection({ s, t, hasWallpaper }: OpenCodeSectionProps) {
  const styles = getSettingsStyles(s);
  const openCode = useOpenCodeModels();
  const { rawModels, status, loading, refresh } = openCode;
  const editor = useOpenCodeEditor(t, openCode);
  const { mode } = editor;

  const providerOptions = useMemo(
    () => buildOpenCodeProviderOptions(status.supportedProviders, status.providers),
    [status.providers, status.supportedProviders],
  );
  const ready = isOpenCodeReady(status.configured, rawModels);

  return (
    <div style={{ marginBottom: 28, position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 2 }}>
        <div style={{ fontSize: s(13), color: "color-mix(in srgb, var(--text-primary) 87%, transparent)" }}>{t("settings.opencode")}</div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          style={styles.compactButton(!loading)}
          title={t("settings.opencodeRefresh")}
        >
          <RefreshCw size={12} strokeWidth={1.8} />
          {loading ? t("settings.checking") : t("settings.refresh")}
        </button>
      </div>
      <div style={{ fontSize: s(11), color: "color-mix(in srgb, var(--text-primary) 30%, transparent)", marginBottom: 12 }}>
        {t("settings.opencodeDescription")}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: mode.kind === "closed" ? 12 : 14,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: s(12),
              color: status.installed && ready ? "var(--success-text)" : "color-mix(in srgb, var(--text-primary) 72%, transparent)",
              marginBottom: 4,
            }}
          >
            {status.installed
              ? (ready ? t("settings.opencodeConfigured") : t("settings.opencodeInstalled"))
              : t("settings.opencodeNotInstalled")}
          </div>
          {status.version && (
            <div style={{ fontSize: s(11), color: "color-mix(in srgb, var(--text-primary) 42%, transparent)", marginBottom: 2 }}>
              {t("settings.version", { value: status.version })}
            </div>
          )}
          {status.configPath && (
            <div
              title={status.configPath}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: s(10),
                color: "color-mix(in srgb, var(--text-primary) 22%, transparent)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {status.configPath}
            </div>
          )}
        </div>
        {(mode.kind === "closed" || mode.kind === "edit") && (
          <button type="button" onClick={editor.startAdd} style={styles.compactButton(true)}>
            <Plus size={12} strokeWidth={1.8} />
            {t("settings.opencodeAddModel")}
          </button>
        )}
      </div>

      {mode.kind !== "closed" && (
        <OpenCodeModelForm
          s={s}
          t={t}
          mode={mode}
          draft={editor.draft}
          saving={editor.saving}
          providerOptions={providerOptions}
          hasWallpaper={hasWallpaper}
          onDraftChange={editor.updateDraft}
          onCancel={editor.cancel}
          onSave={editor.save}
        />
      )}

      {editor.message && (
        <div
          role="status"
          style={{
            fontSize: s(11),
            color: editor.message.tone === "success" ? "var(--success-text)" : "var(--warning-text)",
            marginBottom: 12,
          }}
        >
          {editor.message.text}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rawModels.length === 0 ? (
          <div style={{ fontSize: s(11), color: "color-mix(in srgb, var(--text-primary) 28%, transparent)" }}>
            {t("settings.opencodeNoModels")}
          </div>
        ) : rawModels.map((model) => (
          <OpenCodeModelRow
            key={model.id}
            s={s}
            t={t}
            model={model}
            onToggle={editor.toggleEnabled}
            onEdit={editor.startEdit}
            onDuplicate={editor.startDuplicate}
            onRemove={editor.remove}
          />
        ))}
      </div>
    </div>
  );
});

const BADGE_BASE: CSSProperties = {
  flexShrink: 0,
  padding: "2px 5px",
  borderRadius: 5,
  fontFamily: "var(--font-mono)",
  lineHeight: 1,
};

interface OpenCodeModelRowProps {
  s: FontScale;
  t: Translate;
  model: OpenCodeModelEntry;
  onToggle: (model: OpenCodeModelEntry) => void;
  onEdit: (model: OpenCodeModelEntry) => void;
  onDuplicate: (model: OpenCodeModelEntry) => Promise<void>;
  onRemove: (modelKey: string) => void;
}

const OpenCodeModelRow = memo(function OpenCodeModelRow({ s, t, model, onToggle, onEdit, onDuplicate, onRemove }: OpenCodeModelRowProps) {
  const enabled = model.enabled !== false;
  const toggleLabel = enabled ? t("settings.opencodeDisableModel") : t("settings.opencodeEnableModel");
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        padding: "7px 8px 7px 10px",
        border: "1px solid color-mix(in srgb, var(--text-primary) 6%, transparent)",
        borderRadius: 7,
        background: "color-mix(in srgb, var(--text-primary) 2.5%, transparent)",
        opacity: enabled ? 1 : 0.55,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span
            style={{
              fontSize: s(12),
              color: "color-mix(in srgb, var(--text-primary) 76%, transparent)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {model.label || `${model.providerId}/${model.modelId}`}
          </span>
          {model.thinking && (
            <span
              style={{
                ...BADGE_BASE,
                border: "1px solid color-mix(in srgb, var(--accent) 18%, transparent)",
                background: "color-mix(in srgb, var(--accent) 8%, transparent)",
                color: "color-mix(in srgb, var(--accent) 62%, transparent)",
                fontSize: s(9),
              }}
            >
              {t("settings.opencodeThinkingBadge")}
            </span>
          )}
          {!enabled && (
            <span
              style={{
                ...BADGE_BASE,
                border: "1px solid color-mix(in srgb, var(--text-primary) 10%, transparent)",
                background: "color-mix(in srgb, var(--text-primary) 4%, transparent)",
                color: "color-mix(in srgb, var(--text-primary) 42%, transparent)",
                fontSize: s(9),
              }}
            >
              {t("settings.opencodeDisabledBadge")}
            </span>
          )}
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: s(10),
            color: "color-mix(in srgb, var(--text-primary) 28%, transparent)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {model.providerId}/{model.modelId}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <ToggleSwitch
          checked={enabled}
          onToggle={() => onToggle(model)}
          variant="soft"
          size="sm"
          ariaLabel={toggleLabel}
          title={toggleLabel}
        />
        <button type="button" onClick={() => onEdit(model)} aria-label={t("settings.opencodeEditModel")} title={t("settings.opencodeEditModel")} style={smallIconButtonStyle}>
          <Pencil size={13} strokeWidth={1.7} />
        </button>
        <button
          type="button"
          onClick={() => void onDuplicate(model)}
          aria-label={t("settings.opencodeDuplicateModel")}
          title={t("settings.opencodeDuplicateModel")}
          style={smallIconButtonStyle}
        >
          <Copy size={13} strokeWidth={1.7} />
        </button>
        <button type="button" onClick={() => onRemove(model.id)} aria-label={t("settings.opencodeRemoveModel")} title={t("settings.opencodeRemoveModel")} style={smallIconButtonStyle}>
          <Trash2 size={13} strokeWidth={1.7} />
        </button>
      </div>
    </div>
  );
});
