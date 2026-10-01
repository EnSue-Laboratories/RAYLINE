import { memo } from "react";
import { CheckCircle2, Copy, ExternalLink, Settings as SettingsIcon, Terminal } from "lucide-react";
import { useFontScale, type RuntimeSetupProvider, type RuntimeSetupProviderId } from "./deps";
import {
  RUNTIME_BORDER,
  RUNTIME_FILL,
  RUNTIME_MUTED,
  RUNTIME_PRIMARY,
  RUNTIME_SECONDARY,
  RUNTIME_UI_FONT,
  runtimeIconButtonStyle,
} from "./runtimeSetupStyles";
import {
  getPrimaryAction,
  isProviderInstalled,
  primaryActionLabel,
  providerStatusLabel,
  type RuntimeSetupState,
} from "./runtimeSetup";

interface RuntimeProviderRowProps {
  provider: RuntimeSetupProvider;
  state: RuntimeSetupState | null | undefined;
  copied: boolean;
  onCopy: (providerId: RuntimeSetupProviderId) => void;
  onConfirmInstall: (providerId: RuntimeSetupProviderId) => void;
  onRunSignIn: (providerId: RuntimeSetupProviderId) => void;
  onOpenDocs: (providerId: RuntimeSetupProviderId) => void;
  onConfigure?: (providerId: RuntimeSetupProviderId) => void;
}

/** One runtime (Codex / Claude Code / OpenCode) with install, copy and docs actions. */
export const RuntimeProviderRow = memo(function RuntimeProviderRow({
  provider,
  state,
  copied,
  onCopy,
  onConfirmInstall,
  onRunSignIn,
  onOpenDocs,
  onConfigure,
}: RuntimeProviderRowProps) {
  const s = useFontScale();
  const installed = isProviderInstalled(provider, state);
  const action = getPrimaryAction(provider, state);
  const configure = action === "configure";

  const handlePrimary = () => {
    if (action === "configure") onConfigure?.(provider.id);
    else if (action === "signin") onRunSignIn(provider.id);
    else onConfirmInstall(provider.id);
  };

  return (
    <div
      style={{
        border: `1px solid ${RUNTIME_BORDER}`,
        borderRadius: 8,
        background: provider.primary ? RUNTIME_FILL : "rgba(255,255,255,0.012)",
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
              fontFamily: RUNTIME_UI_FONT,
              letterSpacing: "0",
              color: installed ? "rgba(180,255,210,0.58)" : RUNTIME_MUTED,
            }}
          >
            {provider.eyebrow}
          </span>
          {installed && <CheckCircle2 size={12} color="rgba(180,255,210,0.62)" strokeWidth={1.7} />}
        </div>
        <div style={{ color: RUNTIME_PRIMARY, fontSize: s(14), fontWeight: 600, letterSpacing: "0" }}>{provider.name}</div>
        <div style={{ color: RUNTIME_SECONDARY, fontSize: s(11), lineHeight: 1.45, marginTop: 4 }}>{provider.description}</div>
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginTop: 8,
            color: RUNTIME_MUTED,
            fontSize: s(11),
            fontFamily: RUNTIME_UI_FONT,
            letterSpacing: "0",
          }}
        >
          <span>{providerStatusLabel(provider, state)}</span>
          <span>{provider.installNote}</span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={handlePrimary}
          style={{
            height: 30,
            padding: "0 11px",
            borderRadius: 7,
            border: "1px solid rgba(255,255,255,0.12)",
            background: configure ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.84)",
            color: configure ? "rgba(255,255,255,0.78)" : "#08080a",
            cursor: "pointer",
            fontSize: s(12),
            fontFamily: RUNTIME_UI_FONT,
            letterSpacing: "0",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {configure ? <SettingsIcon size={12} /> : <Terminal size={12} />}
          {primaryActionLabel(action, provider)}
        </button>
        <button
          type="button"
          onClick={() => onCopy(provider.id)}
          title={`Copy ${provider.name} install command`}
          aria-label={`Copy ${provider.name} install command`}
          style={runtimeIconButtonStyle(s)}
        >
          <Copy size={13} />
          {copied && <span style={{ fontSize: s(9) }}>Copied</span>}
        </button>
        <button
          type="button"
          onClick={() => onOpenDocs(provider.id)}
          title={`Open ${provider.name} docs`}
          aria-label={`Open ${provider.name} docs`}
          style={runtimeIconButtonStyle(s)}
        >
          <ExternalLink size={13} />
        </button>
      </div>
    </div>
  );
});
