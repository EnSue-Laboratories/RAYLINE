import { memo, useEffect, useState, type CSSProperties } from "react";
import { SectionLabel } from "./controls";
import type { FontScale, Translate } from "./deps";
import {
  applyUpdaterStatus,
  beginUpdateCheck,
  INITIAL_UPDATER_STATE,
  NOT_AVAILABLE_RESET_MS,
  type UpdaterViewState,
} from "./updater";

interface AppVersionInfoProps {
  s: FontScale;
  t: Translate;
  version: string | null;
}

/** Version line at the top of Settings (#230 shows it on every platform). */
export const AppVersionInfo = memo(function AppVersionInfo({ s, t, version }: AppVersionInfoProps) {
  if (!version) return null;
  return (
    <div data-testid="app-build" style={{ marginBottom: 20, color: "var(--text-muted)", fontSize: s(11), fontFamily: "var(--font-mono)" }}>
      {t("settings.currentVersion")} v{version}
    </div>
  );
});

function useUpdater(): [UpdaterViewState, () => void] {
  const [state, setState] = useState<UpdaterViewState>(INITIAL_UPDATER_STATE);
  useEffect(() => {
    let resetTimer: number | undefined;
    const unsubscribe = window.api?.onUpdaterStatus?.((status) => {
      setState((prev) => applyUpdaterStatus(prev, status));
      if (status.phase === "not-available") {
        window.clearTimeout(resetTimer);
        resetTimer = window.setTimeout(() => {
          setState((prev) => applyUpdaterStatus(prev, { phase: "idle" }));
        }, NOT_AVAILABLE_RESET_MS);
      }
    });
    return () => {
      window.clearTimeout(resetTimer);
      unsubscribe?.();
    };
  }, []);
  const check = () => {
    setState(beginUpdateCheck);
    void window.api?.checkForUpdates?.();
  };
  return [state, check];
}

interface UpdatesSectionProps {
  s: FontScale;
  t: Translate;
  version: string | null;
}

/** Windows auto-updater (electron-updater). */
export const UpdatesSection = memo(function UpdatesSection({ s, t, version }: UpdatesSectionProps) {
  const [updater, checkForUpdates] = useUpdater();
  const { phase, version: updateVersion, percent, error } = updater;
  const button = (overrides: CSSProperties): CSSProperties => ({
    padding: "6px 14px",
    borderRadius: 7,
    background: "color-mix(in srgb, var(--text-primary) 6%, transparent)",
    border: "1px solid color-mix(in srgb, var(--text-primary) 6%, transparent)",
    color: "color-mix(in srgb, var(--text-primary) 75%, transparent)",
    fontSize: s(12),
    cursor: "pointer",
    transition: "all .2s",
    fontFamily: "var(--font-ui)",
    ...overrides,
  });

  return (
    <>
      <SectionLabel s={s} dim>{t("settings.updates")}</SectionLabel>
      <div style={{ marginBottom: 32 }}>
        {version && (
          <div
            style={{
              fontSize: s(11),
              color: "color-mix(in srgb, var(--text-primary) 35%, transparent)",
              fontFamily: "var(--font-mono)",
              marginBottom: 14,
              letterSpacing: ".04em",
            }}
          >
            {t("settings.currentVersion")}  v{version}
          </div>
        )}

        <div role="status">
          {phase === "available" && updateVersion && (
            <div style={{ fontSize: s(12), color: "var(--success-text)", marginBottom: 10 }}>
              {t("settings.updateAvailable", { version: updateVersion })}
            </div>
          )}
          {phase === "not-available" && (
            <div style={{ fontSize: s(12), color: "color-mix(in srgb, var(--text-primary) 38%, transparent)", marginBottom: 10 }}>
              {t("settings.upToDate")}
            </div>
          )}
          {phase === "ready" && (
            <div style={{ fontSize: s(12), color: "var(--success-text)", marginBottom: 10 }}>{t("settings.readyToInstall")}</div>
          )}
          {phase === "error" && (
            <div style={{ fontSize: s(12), color: "var(--danger-text)", marginBottom: 10 }}>
              {t("settings.updateError")}
              {error && (
                <span style={{ opacity: 0.6, marginLeft: 6, fontFamily: "var(--font-mono)", fontSize: s(10) }}>{error.slice(0, 80)}</span>
              )}
            </div>
          )}
        </div>

        {phase === "downloading" && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: s(12), color: "color-mix(in srgb, var(--text-primary) 55%, transparent)", marginBottom: 6 }}>
              {t("settings.downloading", { pct: percent })}
            </div>
            <div
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              style={{ height: 3, borderRadius: 2, background: "color-mix(in srgb, var(--text-primary) 8%, transparent)", overflow: "hidden" }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${percent}%`,
                  background: "color-mix(in srgb, var(--text-primary) 40%, transparent)",
                  transition: "width .3s ease",
                  borderRadius: 2,
                }}
              />
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          {(phase === "idle" || phase === "not-available") && (
            <button type="button" onClick={checkForUpdates} style={button({})}>
              {t("settings.checkUpdates")}
            </button>
          )}
          {phase === "checking" && (
            <button
              type="button"
              disabled
              style={button({
                background: "color-mix(in srgb, var(--text-primary) 3%, transparent)",
                color: "color-mix(in srgb, var(--text-primary) 38%, transparent)",
                cursor: "not-allowed",
                transition: undefined,
              })}
            >
              {t("settings.checking")}
            </button>
          )}
          {phase === "available" && (
            <button
              type="button"
              onClick={() => void window.api?.downloadUpdate?.()}
              style={button({ background: "var(--success-bg)", border: "1px solid var(--success-border)", color: "var(--success-text)" })}
            >
              {t("settings.checkUpdates")}
            </button>
          )}
          {phase === "ready" && (
            <button
              type="button"
              onClick={() => void window.api?.installUpdate?.()}
              style={button({
                background: "var(--success-bg)",
                border: "1px solid var(--success-border)",
                color: "var(--success-text-strong)",
                fontWeight: 600,
              })}
            >
              {t("settings.installRestart")}
            </button>
          )}
          {phase === "error" && (
            <button type="button" onClick={checkForUpdates} style={button({ color: "color-mix(in srgb, var(--text-primary) 60%, transparent)" })}>
              {t("settings.retryUpdate")}
            </button>
          )}
        </div>
      </div>
    </>
  );
});
