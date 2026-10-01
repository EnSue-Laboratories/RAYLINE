import { useState } from "react";
import { ExternalLink, RefreshCw, Terminal } from "lucide-react";
import { useStableCallback } from "../hooks/useStableCallback";
import {
  getRuntimeSetupCommand,
  RUNTIME_SETUP_DOCS,
  RUNTIME_SETUP_PROVIDERS,
  useFontScale,
  type RuntimeSetupProviderId,
} from "./settings/deps";
import { RuntimeProviderRow } from "./settings/RuntimeProviderRow";
import type { RuntimeSetupCommandRequest, RuntimeSetupState } from "./settings/runtimeSetup";
import {
  RUNTIME_ACTIVE,
  RUNTIME_BORDER,
  RUNTIME_MUTED,
  RUNTIME_PRIMARY,
  RUNTIME_SECONDARY,
  RUNTIME_UI_FONT,
  runtimeIconButtonStyle,
} from "./settings/runtimeSetupStyles";

export type { RuntimeSetupCommandRequest, RuntimeSetupState } from "./settings/runtimeSetup";

export interface RuntimeSetupCardProps {
  state: RuntimeSetupState | null | undefined;
  platform?: string | null;
  onRunCommand?: (request: RuntimeSetupCommandRequest) => void;
  onRefresh?: () => void;
  onConfigureOpenCode?: (providerId: RuntimeSetupProviderId) => void;
}

const COPIED_FEEDBACK_MS = 1400;
const PRIMARY_PROVIDERS = RUNTIME_SETUP_PROVIDERS.filter((provider) => provider.primary);
const ADVANCED_PROVIDERS = RUNTIME_SETUP_PROVIDERS.filter((provider) => !provider.primary);

/** First-run screen shown when no agent CLI is installed. */
export default function RuntimeSetupCard({ state, platform, onRunCommand, onRefresh, onConfigureOpenCode }: RuntimeSetupCardProps) {
  const s = useFontScale();
  const [confirmProvider, setConfirmProvider] = useState<RuntimeSetupProviderId | null>(null);
  const [copiedProvider, setCopiedProvider] = useState<RuntimeSetupProviderId | null>(null);
  const confirmMeta = confirmProvider ? RUNTIME_SETUP_PROVIDERS.find((provider) => provider.id === confirmProvider) ?? null : null;
  const confirmCommand = confirmProvider ? getRuntimeSetupCommand(confirmProvider, "install", platform ?? undefined) : "";
  const checking = Boolean(state?.checking);

  const openDocs = useStableCallback((providerId: RuntimeSetupProviderId) => {
    const url = RUNTIME_SETUP_DOCS[providerId];
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  });

  const copyCommand = useStableCallback(async (providerId: RuntimeSetupProviderId) => {
    const command = getRuntimeSetupCommand(providerId, "install", platform ?? undefined);
    if (!command) return;
    try {
      await navigator.clipboard?.writeText(command);
      setCopiedProvider(providerId);
      window.setTimeout(() => setCopiedProvider((current) => (current === providerId ? null : current)), COPIED_FEEDBACK_MS);
    } catch {
      setConfirmProvider(providerId);
    }
  });

  const handleCopy = useStableCallback((providerId: RuntimeSetupProviderId) => {
    void copyCommand(providerId);
  });

  const runSignIn = useStableCallback((providerId: RuntimeSetupProviderId) => {
    const command = getRuntimeSetupCommand(providerId, "signin", platform ?? undefined);
    if (command) onRunCommand?.({ providerId, action: "signin", command });
  });

  const configure = useStableCallback((providerId: RuntimeSetupProviderId) => onConfigureOpenCode?.(providerId));

  const runInstall = () => {
    if (!confirmProvider || !confirmCommand) return;
    onRunCommand?.({ providerId: confirmProvider, action: "install", command: confirmCommand });
    setConfirmProvider(null);
  };

  const renderRows = (providers: typeof RUNTIME_SETUP_PROVIDERS) =>
    providers.map((provider) => (
      <RuntimeProviderRow
        key={provider.id}
        provider={provider}
        state={state}
        copied={copiedProvider === provider.id}
        onCopy={handleCopy}
        onConfirmInstall={setConfirmProvider}
        onRunSignIn={runSignIn}
        onOpenDocs={openDocs}
        onConfigure={configure}
      />
    ));

  return (
    <div
      style={{
        flex: 1,
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px 0",
        userSelect: "none",
        fontFamily: RUNTIME_UI_FONT,
      }}
    >
      <div style={{ width: "min(720px, 100%)" }}>
        <style>{`
          @keyframes runtime-setup-rise {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>

        <div style={{ animation: "runtime-setup-rise 360ms cubic-bezier(.16,1,.3,1) both" }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 18 }}>
            <div>
              <div style={{ color: RUNTIME_SECONDARY, fontSize: s(12), fontFamily: RUNTIME_UI_FONT, letterSpacing: "0", marginBottom: 7 }}>
                Runtime setup
              </div>
              <h2
                style={{
                  color: RUNTIME_PRIMARY,
                  fontSize: s(25),
                  lineHeight: 1.08,
                  fontWeight: 650,
                  margin: 0,
                  letterSpacing: "0",
                  fontFamily: RUNTIME_UI_FONT,
                }}
              >
                Choose an agent runtime
              </h2>
              <p style={{ color: RUNTIME_SECONDARY, fontSize: s(12), lineHeight: 1.55, margin: "9px 0 0", maxWidth: 520 }}>
                RayLine needs one local coding-agent CLI before it can start a chat. Pick Codex or Claude Code for the shortest path;
                OpenCode and Grok are available for additional local runtimes.
              </p>
            </div>
            <button
              type="button"
              onClick={onRefresh}
              style={{
                ...runtimeIconButtonStyle(s),
                height: 32,
                color: checking ? RUNTIME_MUTED : RUNTIME_SECONDARY,
                cursor: checking ? "default" : "pointer",
              }}
              disabled={checking}
            >
              <RefreshCw size={13} style={{ animation: checking ? "spin 900ms linear infinite" : "none" }} />
              Refresh
            </button>
          </div>

          <div style={{ display: "grid", gap: 8 }}>{renderRows(PRIMARY_PROVIDERS)}</div>

          <div style={{ marginTop: 14 }}>
            <div style={{ color: RUNTIME_MUTED, fontSize: s(12), fontFamily: RUNTIME_UI_FONT, letterSpacing: "0", margin: "0 0 7px 2px" }}>
              Advanced
            </div>
            {renderRows(ADVANCED_PROVIDERS)}
          </div>
        </div>
      </div>

      {confirmMeta && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            background: "rgba(0,0,0,0.42)",
            backdropFilter: "blur(22px)",
            WebkitBackdropFilter: "blur(22px)",
          }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setConfirmProvider(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Install ${confirmMeta.name}`}
            style={{
              width: "min(620px, 100%)",
              border: `1px solid ${RUNTIME_BORDER}`,
              borderRadius: 10,
              background: "rgba(13,13,16,0.94)",
              boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
              padding: 18,
            }}
          >
            <div style={{ color: RUNTIME_PRIMARY, fontSize: s(16), fontWeight: 650, marginBottom: 6 }}>Install {confirmMeta.name}</div>
            <div style={{ color: RUNTIME_SECONDARY, fontSize: s(12), lineHeight: 1.5, marginBottom: 12 }}>
              RayLine will run this official setup command in a visible terminal. Review it before continuing.
            </div>
            <pre
              style={{
                margin: 0,
                maxHeight: 220,
                overflow: "auto",
                border: `1px solid ${RUNTIME_BORDER}`,
                borderRadius: 8,
                background: "rgba(0,0,0,0.24)",
                color: "rgba(255,255,255,0.74)",
                fontSize: s(10.5),
                lineHeight: 1.55,
                padding: 12,
                whiteSpace: "pre-wrap",
                userSelect: "text",
              }}
            >
              {confirmCommand}
            </pre>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 14 }}>
              <button type="button" onClick={() => openDocs(confirmMeta.id)} style={{ ...runtimeIconButtonStyle(s), height: 32 }}>
                <ExternalLink size={13} />
                Official docs
              </button>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setConfirmProvider(null)}
                  style={{
                    height: 32,
                    padding: "0 12px",
                    borderRadius: 7,
                    border: `1px solid ${RUNTIME_BORDER}`,
                    background: "transparent",
                    color: RUNTIME_SECONDARY,
                    cursor: "pointer",
                    fontSize: s(12),
                    fontFamily: RUNTIME_UI_FONT,
                    letterSpacing: "0",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={runInstall}
                  style={{
                    height: 32,
                    padding: "0 12px",
                    borderRadius: 7,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: RUNTIME_ACTIVE,
                    color: RUNTIME_PRIMARY,
                    cursor: "pointer",
                    fontSize: s(12),
                    fontFamily: RUNTIME_UI_FONT,
                    letterSpacing: "0",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                  }}
                >
                  <Terminal size={13} />
                  Run in terminal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
