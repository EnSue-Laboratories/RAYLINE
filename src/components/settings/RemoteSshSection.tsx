import { memo, useState } from "react";
import { Terminal } from "lucide-react";
import { SettingHeader } from "./controls";
import type { FontScale, Translate } from "./deps";
import {
  IDLE_REMOTE_SSH_STATUS,
  remoteSshResultToStatus,
  remoteSshStatusColor,
  type RemoteSshConnectResult,
  type RemoteSshStatus,
} from "./helpers";
import { getSettingsStyles } from "./styles";

interface RemoteSshSectionProps {
  s: FontScale;
  t: Translate;
  command: string;
  onCommandChange: (command: string) => void;
  /** Absent when the host can't probe SSH runtimes. */
  onConnect?: (command: string) => Promise<RemoteSshConnectResult>;
}

/** SSH command used to run Claude / Codex on a remote host. */
export const RemoteSshSection = memo(function RemoteSshSection({ s, t, command, onCommandChange, onConnect }: RemoteSshSectionProps) {
  const styles = getSettingsStyles(s);
  const [status, setStatus] = useState<RemoteSshStatus>(IDLE_REMOTE_SSH_STATUS);
  const [statusCommand, setStatusCommand] = useState(command);
  // Editing the command clears a stale result (but not an in-flight check).
  if (statusCommand !== command) {
    setStatusCommand(command);
    if (status.kind !== "connecting") setStatus(IDLE_REMOTE_SSH_STATUS);
  }

  const trimmed = command.trim();
  const connecting = status.kind === "connecting";

  const handleConnect = async () => {
    if (!trimmed) {
      setStatus({ kind: "error", text: t("settings.remoteSshCommandRequired") });
      return;
    }
    if (!onConnect) {
      setStatus({ kind: "error", text: t("settings.remoteSshUnavailable") });
      return;
    }
    setStatus({ kind: "connecting", text: t("settings.remoteSshConnecting") });
    const result = await onConnect(trimmed);
    setStatus(remoteSshResultToStatus(result, t));
  };

  return (
    <div style={{ marginBottom: 28 }}>
      <SettingHeader s={s} title={t("settings.remoteSsh")} description={t("settings.remoteSshDescription")} spacing={10} />
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8, alignItems: "center" }}>
        <input
          type="text"
          value={command}
          placeholder={t("settings.remoteSshPlaceholder")}
          aria-label={t("settings.remoteSsh")}
          onChange={(e) => onCommandChange(e.target.value)}
          spellCheck={false}
          style={styles.input}
        />
        <button
          type="button"
          onClick={handleConnect}
          disabled={connecting || !trimmed}
          style={styles.compactButton(!connecting && Boolean(trimmed))}
        >
          <Terminal size={12} strokeWidth={1.8} />
          {connecting ? t("settings.remoteSshConnecting") : t("settings.remoteSshConnect")}
        </button>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        <button type="button" onClick={() => onCommandChange("")} disabled={!trimmed} style={styles.compactButton(Boolean(trimmed))}>
          {t("settings.remoteSshClear")}
        </button>
      </div>
      {status.text && (
        <div role="status" style={{ fontSize: s(11), color: remoteSshStatusColor(status.kind), marginTop: 8 }}>
          {status.text}
        </div>
      )}
    </div>
  );
});
