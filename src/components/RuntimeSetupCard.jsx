import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  RefreshCw,
  Settings,
  Terminal,
} from "lucide-react";
import { useFontScale } from "../contexts/FontSizeContext";
import {
  RUNTIME_SETUP_DOCS,
  RUNTIME_SETUP_PROVIDERS,
  getRuntimeSetupCommand,
} from "../data/runtimeSetup";

const PRIMARY = "rgba(255,255,255,0.88)";
const SECONDARY = "rgba(255,255,255,0.48)";
const MUTED = "rgba(255,255,255,0.28)";
const BORDER = "rgba(255,255,255,0.065)";
const FILL = "rgba(255,255,255,0.025)";
const ACTIVE = "rgba(255,255,255,0.08)";
const UI_FONT = "system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

function providerStatusLabel(provider, state) {
  const installed = state?.installed?.[provider.id] === true;
  if (provider.id === "opencode" && installed && !state?.opencodeConfigured) return "Installed, needs provider";
  if (installed) return "Installed";
  return "Not installed";
}

function getPrimaryAction(provider, state) {
  const installed = state?.installed?.[provider.id] === true;
  if (provider.id === "opencode" && installed && !state?.opencodeConfigured) return "configure";
  return installed ? "signin" : "install";
}

function primaryActionLabel(action, provider) {
  if (action === "configure") return "Configure";
  if (action === "signin") return "Sign in";
  if (provider.id === "opencode") return "Install";
  return "Install and sign in";
}

function ProviderRow({ provider, state, copiedProvider, onCopy, onConfirmInstall, onRunSignIn, onOpenDocs, onConfigure }) {
  const s = useFontScale();
  const installed = state?.installed?.[provider.id] === true;
  const action = getPrimaryAction(provider, state);
  const isAdvanced = !provider.primary;

  return (
    <div
      style={{
        border: `1px solid ${BORDER}`,
        borderRadius: 8,
        background: isAdvanced ? "rgba(255,255,255,0.012)" : FILL,
        padding: 12,
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        gap: 12,
        alignItems: "center",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
          <span
            style={{
              fontSize: s(8),
              fontFamily: UI_FONT,
              letterSpacing: "0",
              color: installed ? "rgba(180,255,210,0.58)" : MUTED,
            }}
          >
            {provider.eyebrow}
          </span>
          {installed && <CheckCircle2 size={12} color="rgba(180,255,210,0.62)" strokeWidth={1.7} />}
        </div>
        <div style={{ color: PRIMARY, fontSize: s(14), fontWeight: 600, letterSpacing: "0" }}>
          {provider.name}
        </div>
        <div style={{ color: SECONDARY, fontSize: s(11), lineHeight: 1.45, marginTop: 4 }}>
          {provider.description}
        </div>
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginTop: 8,
            color: MUTED,
            fontSize: s(11),
            fontFamily: UI_FONT,
            letterSpacing: "0",
          }}
        >
          <span>{providerStatusLabel(provider, state)}</span>
          <span>{provider.installNote}</span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
        <button
          onClick={() => {
            if (action === "configure") onConfigure(provider.id);
            else if (action === "signin") onRunSignIn(provider.id);
            else onConfirmInstall(provider.id);
          }}
          style={{
            height: 30,
            padding: "0 11px",
            borderRadius: 7,
            border: "1px solid rgba(255,255,255,0.12)",
            background: action === "configure" ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.84)",
            color: action === "configure" ? "rgba(255,255,255,0.78)" : "#08080a",
            cursor: "pointer",
            fontSize: s(12),
            fontFamily: UI_FONT,
            letterSpacing: "0",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {action === "configure" ? <Settings size={12} /> : <Terminal size={12} />}
          {primaryActionLabel(action, provider)}
        </button>
        <button
          onClick={() => onCopy(provider.id)}
          title={`Copy ${provider.name} install command`}
          style={iconButtonStyle(s)}
        >
          <Copy size={13} />
          {copiedProvider === provider.id && <span style={{ fontSize: s(9) }}>Copied</span>}
        </button>
        <button
          onClick={() => onOpenDocs(provider.id)}
          title={`Open ${provider.name} docs`}
          style={iconButtonStyle(s)}
        >
          <ExternalLink size={13} />
        </button>
      </div>
    </div>
  );
}

function iconButtonStyle(s) {
  return {
    height: 30,
    minWidth: 30,
    padding: "0 9px",
    borderRadius: 7,
    border: `1px solid ${BORDER}`,
    background: "transparent",
    color: SECONDARY,
    cursor: "pointer",
    fontSize: s(12),
    fontFamily: UI_FONT,
    letterSpacing: "0",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  };
}

export default function RuntimeSetupCard({
  state,
  platform,
  onRunCommand,
  onRefresh,
  onConfigureOpenCode,
}) {
  const s = useFontScale();
  const [confirmProvider, setConfirmProvider] = useState(null);
  const [copiedProvider, setCopiedProvider] = useState(null);
  const confirmProviderMeta = useMemo(
    () => RUNTIME_SETUP_PROVIDERS.find((provider) => provider.id === confirmProvider) || null,
    [confirmProvider]
  );
  const confirmCommand = confirmProvider
    ? getRuntimeSetupCommand(confirmProvider, "install", platform)
    : "";

  const openDocs = (providerId) => {
    const url = RUNTIME_SETUP_DOCS[providerId];
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  const copyCommand = async (providerId) => {
    const command = getRuntimeSetupCommand(providerId, "install", platform);
    if (!command) return;
    try {
      await navigator.clipboard?.writeText(command);
      setCopiedProvider(providerId);
      window.setTimeout(() => setCopiedProvider((current) => current === providerId ? null : current), 1400);
    } catch {
      setConfirmProvider(providerId);
    }
  };

  const runInstall = () => {
    if (!confirmProvider || !confirmCommand) return;
    onRunCommand?.({ providerId: confirmProvider, action: "install", command: confirmCommand });
    setConfirmProvider(null);
  };

  const runSignIn = (providerId) => {
    const command = getRuntimeSetupCommand(providerId, "signin", platform);
    if (!command) return;
    onRunCommand?.({ providerId, action: "signin", command });
  };

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
        fontFamily: UI_FONT,
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
              <div
                style={{
                  color: SECONDARY,
                  fontSize: s(12),
                  fontFamily: UI_FONT,
                  letterSpacing: "0",
                  marginBottom: 7,
                }}
              >
                Runtime setup
              </div>
              <h2
                style={{
                  color: PRIMARY,
                  fontSize: s(25),
                  lineHeight: 1.08,
                  fontWeight: 650,
                  margin: 0,
                  letterSpacing: "0",
                  fontFamily: UI_FONT,
                }}
              >
                Choose an agent runtime
              </h2>
              <p style={{ color: SECONDARY, fontSize: s(12), lineHeight: 1.55, margin: "9px 0 0", maxWidth: 520 }}>
                RayLine needs one local coding-agent CLI before it can start a chat. Pick Codex or Claude Code for the shortest path; OpenCode is available for custom provider setups.
              </p>
            </div>
            <button
              onClick={onRefresh}
              style={{
                ...iconButtonStyle(s),
                height: 32,
                color: state?.checking ? MUTED : SECONDARY,
                cursor: state?.checking ? "default" : "pointer",
              }}
              disabled={state?.checking}
            >
              <RefreshCw size={13} style={{ animation: state?.checking ? "spin 900ms linear infinite" : "none" }} />
              Refresh
            </button>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            {RUNTIME_SETUP_PROVIDERS.filter((provider) => provider.primary).map((provider) => (
              <ProviderRow
                key={provider.id}
                provider={provider}
                state={state}
                copiedProvider={copiedProvider}
                onCopy={copyCommand}
                onConfirmInstall={setConfirmProvider}
                onRunSignIn={runSignIn}
                onOpenDocs={openDocs}
                onConfigure={onConfigureOpenCode}
              />
            ))}
          </div>

          <div style={{ marginTop: 14 }}>
            <div
              style={{
                color: MUTED,
                fontSize: s(12),
                fontFamily: UI_FONT,
                letterSpacing: "0",
                margin: "0 0 7px 2px",
              }}
            >
              Advanced
            </div>
            {RUNTIME_SETUP_PROVIDERS.filter((provider) => !provider.primary).map((provider) => (
              <ProviderRow
                key={provider.id}
                provider={provider}
                state={state}
                copiedProvider={copiedProvider}
                onCopy={copyCommand}
                onConfirmInstall={setConfirmProvider}
                onRunSignIn={runSignIn}
                onOpenDocs={openDocs}
                onConfigure={onConfigureOpenCode}
              />
            ))}
          </div>
        </div>
      </div>

      {confirmProviderMeta && (
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
            style={{
              width: "min(620px, 100%)",
              border: `1px solid ${BORDER}`,
              borderRadius: 10,
              background: "rgba(13,13,16,0.94)",
              boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
              padding: 18,
            }}
          >
            <div style={{ color: PRIMARY, fontSize: s(16), fontWeight: 650, marginBottom: 6 }}>
              Install {confirmProviderMeta.name}
            </div>
            <div style={{ color: SECONDARY, fontSize: s(12), lineHeight: 1.5, marginBottom: 12 }}>
              RayLine will run this official setup command in a visible terminal. Review it before continuing.
            </div>
            <pre
              style={{
                margin: 0,
                maxHeight: 220,
                overflow: "auto",
                border: `1px solid ${BORDER}`,
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
              <button
                onClick={() => openDocs(confirmProviderMeta.id)}
                style={{ ...iconButtonStyle(s), height: 32 }}
              >
                <ExternalLink size={13} />
                Official docs
              </button>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setConfirmProvider(null)}
                  style={{
                    height: 32,
                    padding: "0 12px",
                    borderRadius: 7,
                    border: `1px solid ${BORDER}`,
                    background: "transparent",
                    color: SECONDARY,
                    cursor: "pointer",
                    fontSize: s(12),
                    fontFamily: UI_FONT,
                    letterSpacing: "0",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={runInstall}
                  style={{
                    height: 32,
                    padding: "0 12px",
                    borderRadius: 7,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: ACTIVE,
                    color: PRIMARY,
                    cursor: "pointer",
                    fontSize: s(12),
                    fontFamily: UI_FONT,
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
