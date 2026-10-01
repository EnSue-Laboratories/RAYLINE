import { memo, useEffect, useState } from "react";
import type { MulticaStoreState } from "@shared/providers/types";
import { SettingHeader } from "./controls";
import {
  loadMulticaState,
  normalizeMulticaServerUrl,
  saveMulticaState,
  type FontScale,
  type Translator,
} from "./deps";
import { getMulticaStatusKey, isMulticaConnected, MULTICA_SESSION_RESET } from "./helpers";
import { getSettingsStyles } from "./styles";

const MULTICA_REFRESH_EVENT = "multica-refresh";
const OPEN_MULTICA_SETUP_EVENT = "open-multica-setup";
const SECONDARY_TEXT = "color-mix(in srgb, var(--text-primary) 46%, transparent)";

interface MulticaSectionProps {
  s: FontScale;
  t: Translator;
}

/** Multica server URL + connection status; setup itself lives in MulticaSetupModal. */
export const MulticaSection = memo(function MulticaSection({ s, t }: MulticaSectionProps) {
  const styles = getSettingsStyles(s);
  const [multica, setMultica] = useState<MulticaStoreState>(loadMulticaState);
  const [serverDraft, setServerDraft] = useState(() => multica.serverUrl || "");

  const apply = (next: MulticaStoreState) => {
    setMultica(next);
    setServerDraft(next.serverUrl || "");
  };

  useEffect(() => {
    const handleRefresh = () => {
      const next = loadMulticaState();
      setMultica(next);
      setServerDraft(next.serverUrl || "");
    };
    window.addEventListener(MULTICA_REFRESH_EVENT, handleRefresh);
    return () => window.removeEventListener(MULTICA_REFRESH_EVENT, handleRefresh);
  }, []);

  const normalizedDraft = normalizeMulticaServerUrl(serverDraft);
  const serverDirty = normalizedDraft !== (multica.serverUrl || "");
  const connected = isMulticaConnected(multica);

  /** Changing the server drops the session (tokens are per server). */
  const saveServer = () => {
    apply(saveMulticaState({ ...MULTICA_SESSION_RESET, serverUrl: normalizedDraft }));
    window.dispatchEvent(new CustomEvent(MULTICA_REFRESH_EVENT));
  };

  const handleSaveServer = () => {
    if (serverDirty) saveServer();
    else setServerDraft(normalizedDraft);
  };

  const handleDisconnect = () => {
    apply(saveMulticaState({ ...MULTICA_SESSION_RESET }));
    window.dispatchEvent(new CustomEvent(MULTICA_REFRESH_EVENT));
  };

  const handleOpenSetup = () => {
    if (serverDirty) saveServer();
    window.dispatchEvent(new CustomEvent(OPEN_MULTICA_SETUP_EVENT));
  };

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: s(13), color: "var(--text-primary)", marginBottom: 2 }}>Multica</div>
      <div style={{ ...styles.description, marginBottom: 12 }}>{t("settings.multicaDescription")}</div>

      <div style={{ marginBottom: 12 }}>
        <div
          style={{
            fontSize: s(12),
            color: connected ? "var(--success-text)" : "color-mix(in srgb, var(--text-primary) 78%, transparent)",
            marginBottom: 4,
          }}
        >
          {t(getMulticaStatusKey(multica))}
        </div>
        {multica.email && (
          <div style={{ fontSize: s(11), color: SECONDARY_TEXT, marginBottom: 2 }}>{t("settings.email", { value: multica.email })}</div>
        )}
        {(multica.workspaceSlug || multica.workspaceId) && (
          <div style={{ fontSize: s(11), color: SECONDARY_TEXT }}>
            {t("settings.workspace", { value: multica.workspaceSlug || multica.workspaceId })}
          </div>
        )}
      </div>

      <div style={{ marginBottom: 10 }}>
        <SettingHeader s={s} title={t("settings.serverUrl")} description={t("settings.serverUrlDescription")} spacing={10} />
        <input
          type="text"
          value={serverDraft}
          placeholder="https://your-multica-server"
          aria-label={t("settings.serverUrl")}
          onChange={(e) => setServerDraft(e.target.value)}
          spellCheck={false}
          style={styles.input}
        />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={handleSaveServer}
          disabled={!serverDirty}
          style={{
            ...styles.button,
            background: serverDirty ? "color-mix(in srgb, var(--control-bg), var(--text-primary) 7%)" : "var(--control-bg)",
            color: serverDirty
              ? "color-mix(in srgb, var(--text-primary) 89%, transparent)"
              : "color-mix(in srgb, var(--text-primary) 41%, transparent)",
            cursor: serverDirty ? "pointer" : "not-allowed",
          }}
        >
          {normalizedDraft ? t("settings.saveServer") : t("settings.clearServer")}
        </button>
        <button type="button" onClick={handleOpenSetup} style={styles.button}>
          {connected ? t("settings.manageConnection") : t("settings.openSetup")}
        </button>
        {(multica.token || multica.workspaceId || multica.workspaceSlug) && (
          <button
            type="button"
            onClick={handleDisconnect}
            style={{ ...styles.button, color: "color-mix(in srgb, var(--text-primary) 71%, transparent)" }}
          >
            {t("settings.disconnect")}
          </button>
        )}
      </div>
    </div>
  );
});
