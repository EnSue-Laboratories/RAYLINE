import { memo, useState } from "react";
import { Check } from "lucide-react";
import type { ProviderUpstreamSettings, UpstreamProviderId } from "@shared/providers/types";
import { useStableCallback } from "../../hooks/useStableCallback";
import { SettingHeader } from "./controls";
import { useProviderUpstreams, type FontScale, type MessageKey, type Translator } from "./deps";
import { getUpstreamStatus, normalizeUpstreamDraft, UPSTREAM_PROVIDERS } from "./helpers";
import { getSettingsStyles, glassSwitchKnobStyle, glassSwitchStyle } from "./styles";

const PROVIDER_LABEL_KEYS: Readonly<Record<UpstreamProviderId, MessageKey>> = {
  claude: "settings.upstreamClaude",
  codex: "settings.upstreamCodex",
};

const DIM_TEXT = "color-mix(in srgb, var(--text-primary) 34%, transparent)";

type Edits = Partial<Record<UpstreamProviderId, ProviderUpstreamSettings>>;
type Messages = Partial<Record<UpstreamProviderId, string>>;

function without<T extends object>(record: T, key: keyof T): T {
  const next = { ...record };
  delete next[key];
  return next;
}

interface UpstreamsSectionProps {
  s: FontScale;
  t: Translator;
}

/** Custom base URL / API key / model list per CLI. */
export const UpstreamsSection = memo(function UpstreamsSection({ s, t }: UpstreamsSectionProps) {
  const { configsByProvider, saveConfig, clearConfig } = useProviderUpstreams();
  // Unsaved edits per provider; providers without edits show the stored config.
  const [edits, setEdits] = useState<Edits>({});
  const [messages, setMessages] = useState<Messages>({});

  const draftFor = (provider: UpstreamProviderId): ProviderUpstreamSettings =>
    edits[provider] ?? normalizeUpstreamDraft(configsByProvider[provider]);

  const handleDraftChange = useStableCallback((provider: UpstreamProviderId, patch: Partial<ProviderUpstreamSettings>) => {
    setEdits((prev) => ({ ...prev, [provider]: { ...(prev[provider] ?? normalizeUpstreamDraft(configsByProvider[provider])), ...patch } }));
    setMessages((prev) => ({ ...prev, [provider]: "" }));
  });

  const handleSave = useStableCallback((provider: UpstreamProviderId) => {
    saveConfig(provider, draftFor(provider));
    setEdits((prev) => without(prev, provider));
    setMessages((prev) => ({ ...prev, [provider]: t("settings.upstreamSaved") }));
  });

  const handleToggle = useStableCallback((provider: UpstreamProviderId, enabled: boolean) => {
    saveConfig(provider, { ...draftFor(provider), enabled });
    setEdits((prev) => without(prev, provider));
    setMessages((prev) => ({
      ...prev,
      [provider]: enabled ? t("settings.upstreamEnabledSaved") : t("settings.upstreamDisabledSaved"),
    }));
  });

  const handleClear = useStableCallback((provider: UpstreamProviderId) => {
    clearConfig(provider);
    setEdits((prev) => without(prev, provider));
    setMessages((prev) => ({ ...prev, [provider]: t("settings.upstreamCleared") }));
  });

  return (
    <div style={{ marginBottom: 28 }}>
      <SettingHeader s={s} title={t("settings.upstreams")} description={t("settings.upstreamsDescription")} spacing={12} />
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {UPSTREAM_PROVIDERS.map((provider) => (
          <UpstreamCard
            key={provider}
            s={s}
            t={t}
            provider={provider}
            draft={draftFor(provider)}
            message={messages[provider] ?? ""}
            onDraftChange={handleDraftChange}
            onToggle={handleToggle}
            onSave={handleSave}
            onClear={handleClear}
          />
        ))}
      </div>
    </div>
  );
});

interface UpstreamCardProps {
  s: FontScale;
  t: Translator;
  provider: UpstreamProviderId;
  draft: ProviderUpstreamSettings;
  message: string;
  onDraftChange: (provider: UpstreamProviderId, patch: Partial<ProviderUpstreamSettings>) => void;
  onToggle: (provider: UpstreamProviderId, enabled: boolean) => void;
  onSave: (provider: UpstreamProviderId) => void;
  onClear: (provider: UpstreamProviderId) => void;
}

const UpstreamCard = memo(function UpstreamCard({
  s,
  t,
  provider,
  draft,
  message,
  onDraftChange,
  onToggle,
  onSave,
  onClear,
}: UpstreamCardProps) {
  const styles = getSettingsStyles(s);
  const { configured, enabled, activeOverride, statusKey } = getUpstreamStatus(draft);
  const label = t(PROVIDER_LABEL_KEYS[provider]);

  return (
    <div
      style={{
        padding: 12,
        border: "1px solid var(--control-border-soft)",
        borderRadius: 8,
        background: enabled ? "var(--control-bg-soft)" : "var(--control-bg-subtle)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: enabled ? 10 : 0 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: s(12), color: "color-mix(in srgb, var(--text-primary) 76%, transparent)" }}>
            {t("settings.upstreamOverrideTitle", { provider: label })}
          </div>
          <div style={{ fontSize: s(10), color: DIM_TEXT, marginTop: 2 }}>{t(statusKey)}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flexShrink: 0 }}>
          {configured && (
            <span
              style={{
                flexShrink: 0,
                padding: "2px 5px",
                borderRadius: 5,
                border: activeOverride ? "1px solid var(--accent-border)" : "1px solid var(--control-border)",
                background: activeOverride ? "var(--accent-bg)" : "var(--control-bg-soft)",
                color: activeOverride ? "var(--accent-muted)" : "color-mix(in srgb, var(--text-primary) 44%, transparent)",
                fontSize: s(9),
                fontFamily: "'JetBrains Mono', monospace",
                lineHeight: 1,
              }}
            >
              {activeOverride ? t("settings.upstreamOverrideBadge") : t("settings.upstreamDisabledBadge")}
            </span>
          )}
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label={t("settings.upstreamEnableLabel", { provider: label })}
            onClick={() => onToggle(provider, !enabled)}
            style={glassSwitchStyle(enabled)}
          >
            <span style={glassSwitchKnobStyle(enabled)} />
          </button>
        </div>
      </div>

      {enabled && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8, marginBottom: 8 }}>
            <input
              type="text"
              value={draft.baseURL}
              placeholder={t("settings.upstreamBaseUrlPlaceholder")}
              aria-label={t("settings.upstreamBaseUrlPlaceholder")}
              onChange={(e) => onDraftChange(provider, { baseURL: e.target.value })}
              spellCheck={false}
              style={styles.input}
            />
            <input
              type="password"
              value={draft.apiKey}
              placeholder={t("settings.upstreamApiKeyPlaceholder")}
              aria-label={t("settings.upstreamApiKeyPlaceholder")}
              onChange={(e) => onDraftChange(provider, { apiKey: e.target.value })}
              spellCheck={false}
              style={styles.input}
            />
          </div>
          <textarea
            value={draft.modelListText}
            placeholder={t("settings.upstreamModelListPlaceholder")}
            aria-label={t("settings.upstreamModelListPlaceholder")}
            onChange={(e) => onDraftChange(provider, { modelListText: e.target.value })}
            spellCheck={false}
            style={styles.textarea}
          />
          <div style={{ fontSize: s(10), color: DIM_TEXT, marginTop: 6, marginBottom: 10 }}>{t("settings.upstreamModelListHint")}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => onClear(provider)} disabled={!configured} style={styles.compactButton(configured)}>
              {t("settings.upstreamClear")}
            </button>
            <button type="button" onClick={() => onSave(provider)} style={styles.compactButton(true)}>
              <Check size={12} strokeWidth={1.8} />
              {t("settings.upstreamSave")}
            </button>
          </div>
        </>
      )}
      {message && (
        <div style={{ fontSize: s(11), color: "var(--success-text)", marginTop: enabled ? 10 : 8 }}>{message}</div>
      )}
    </div>
  );
});
