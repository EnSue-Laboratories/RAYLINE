import { useCallback, useEffect, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { MulticaWorkspace } from "@shared/providers/types";
import { loadMulticaState, normalizeMulticaServerUrl, saveMulticaState } from "./settings/deps";
import { describeError, multicaSetupTitle, normalizeMulticaWorkspaces, type MulticaSetupStep } from "./settings/multicaSetup";

export interface MulticaSetupModalProps {
  open: boolean;
  onClose?: () => void;
}

/** Three-step Multica login: server + email → emailed code → workspace. */
export default function MulticaSetupModal({ open, onClose }: MulticaSetupModalProps) {
  const [step, setStep] = useState<MulticaSetupStep>("connect");
  const [serverUrl, setServerUrl] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [token, setToken] = useState("");
  /** null = not loaded yet, [] = loaded and empty. */
  const [workspaces, setWorkspaces] = useState<MulticaWorkspace[] | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);

  // Each time the modal opens, resume from the stored session (straight to the
  // workspace step when we already have a token).
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      const existing = loadMulticaState();
      const resume = Boolean(existing.token && existing.serverUrl);
      setError("");
      setBusy(false);
      setCode("");
      setServerUrl(existing.serverUrl || "");
      setEmail(existing.email || "");
      setToken(resume ? existing.token : "");
      setStep(resume ? "workspace" : "connect");
      setWorkspaces(null);
    }
  }

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const refreshWorkspaces = useCallback(async (srvUrl: string, tkn: string) => {
    setBusy(true);
    setError("");
    try {
      const list = normalizeMulticaWorkspaces(await window.api.multicaListWorkspaces({ serverUrl: srvUrl, token: tkn }));
      setWorkspaces(list);
      if (list[0]) setSelectedWorkspaceId(list[0].id);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }, []);

  // Landing on the workspace step fetches the list once.
  useEffect(() => {
    if (!open || step !== "workspace" || workspaces !== null || !token || !serverUrl) return;
    void refreshWorkspaces(serverUrl, token);
  }, [open, step, workspaces, token, serverUrl, refreshWorkspaces]);

  if (!open) return null;

  const handleSendCode = async () => {
    const normalizedServerUrl = normalizeMulticaServerUrl(serverUrl);
    if (!normalizedServerUrl || !email.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await window.api.multicaSendCode({ serverUrl: normalizedServerUrl, email: email.trim() });
      setStep("verify");
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyCode = async () => {
    const normalizedServerUrl = normalizeMulticaServerUrl(serverUrl);
    if (!normalizedServerUrl || !code.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await window.api.multicaVerifyCode({ serverUrl: normalizedServerUrl, email: email.trim(), code: code.trim() });
      const tkn = res?.token || "";
      if (!tkn) {
        setError("verify succeeded but no token was returned");
        return;
      }
      saveMulticaState({ serverUrl: normalizedServerUrl, email: email.trim(), token: tkn, tokenIssuedAt: Date.now() });
      setToken(tkn);
      setWorkspaces(null);
      setStep("workspace");
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const handlePickWorkspace = () => {
    const ws = workspaces?.find((w) => w.id === selectedWorkspaceId);
    if (!ws) return;
    saveMulticaState({ workspaceId: ws.id, workspaceSlug: ws.slug });
    window.dispatchEvent(new CustomEvent("multica-refresh"));
    onClose?.();
  };

  const onEnter = (action: () => Promise<void>) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") void action();
  };
  const errorBox = error ? <div role="alert" style={errorStyle}>{error}</div> : null;
  const cancelButton = (
    <button type="button" style={secondaryBtnStyle} onClick={onClose} disabled={busy}>
      Cancel
    </button>
  );

  let body: ReactNode;
  let footer: ReactNode;
  switch (step) {
    case "connect": {
      const canSend = Boolean(serverUrl.trim() && email.trim()) && !busy;
      body = (
        <div style={bodyStyle}>
          <Field label="Server URL">
            <input
              style={inputStyle}
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="https://your-multica-server"
              aria-label="Server URL"
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
            />
          </Field>
          <Field label="Email">
            <input
              style={inputStyle}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              aria-label="Email"
              autoComplete="email"
              spellCheck={false}
              disabled={busy}
              onKeyDown={onEnter(handleSendCode)}
            />
          </Field>
          {errorBox}
        </div>
      );
      footer = (
        <>
          {cancelButton}
          <button type="button" style={primaryBtnStyle(canSend)} onClick={handleSendCode} disabled={!canSend}>
            {busy ? "Sending..." : "Send code"}
          </button>
        </>
      );
      break;
    }
    case "verify": {
      const canVerify = Boolean(code.trim()) && !busy;
      body = (
        <div style={bodyStyle}>
          <div style={hintStyle}>
            We sent a 6-digit code to <span style={{ color: "var(--text-primary)" }}>{email}</span>.
          </div>
          <Field label="Verification code">
            <input
              style={inputStyle}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              aria-label="Verification code"
              autoComplete="one-time-code"
              inputMode="numeric"
              spellCheck={false}
              disabled={busy}
              autoFocus
              onKeyDown={onEnter(handleVerifyCode)}
            />
          </Field>
          {errorBox}
        </div>
      );
      footer = (
        <>
          <button
            type="button"
            style={secondaryBtnStyle}
            onClick={() => {
              setError("");
              setStep("connect");
            }}
            disabled={busy}
          >
            Back
          </button>
          <button type="button" style={primaryBtnStyle(canVerify)} onClick={handleVerifyCode} disabled={!canVerify}>
            {busy ? "Verifying..." : "Verify"}
          </button>
        </>
      );
      break;
    }
    case "workspace": {
      if (workspaces === null) {
        body = (
          <div style={bodyStyle}>
            <div style={hintStyle}>{busy ? "Loading workspaces..." : "Preparing..."}</div>
            {errorBox}
          </div>
        );
        footer = cancelButton;
      } else if (workspaces.length === 0) {
        body = (
          <div style={bodyStyle}>
            <div style={{ ...hintStyle, lineHeight: 1.5 }}>
              No workspaces yet. Create one in the Multica web UI at{" "}
              <span style={{ color: "var(--text-primary)" }}>{serverUrl}</span>, then click Refresh.
            </div>
            {errorBox}
          </div>
        );
        footer = (
          <>
            {cancelButton}
            <button type="button" style={primaryBtnStyle(!busy)} onClick={() => void refreshWorkspaces(serverUrl, token)} disabled={busy}>
              {busy ? "Refreshing..." : "Refresh"}
            </button>
          </>
        );
      } else {
        const canContinue = Boolean(selectedWorkspaceId) && !busy;
        body = (
          <div style={bodyStyle}>
            <div style={hintStyle}>Pick a workspace to use with RayLine:</div>
            <div role="radiogroup" style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
              {workspaces.map((ws) => (
                <WorkspaceOption
                  key={ws.id}
                  workspace={ws}
                  selected={ws.id === selectedWorkspaceId}
                  onSelect={setSelectedWorkspaceId}
                />
              ))}
            </div>
            {errorBox}
          </div>
        );
        footer = (
          <>
            {cancelButton}
            <button type="button" style={primaryBtnStyle(canContinue)} onClick={handlePickWorkspace} disabled={!canContinue}>
              Continue
            </button>
          </>
        );
      }
      break;
    }
    default: {
      const exhaustive: never = step;
      return exhaustive;
    }
  }

  return createPortal(
    <div style={backdropStyle} onPointerDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={multicaSetupTitle(step)}
        style={cardStyle}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={headerStyle}>
          <div style={titleStyle}>{multicaSetupTitle(step)}</div>
          <button type="button" style={closeBtnStyle} onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        {body}
        <div style={footerStyle}>{footer}</div>
      </div>
    </div>,
    document.body,
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      {children}
    </div>
  );
}

interface WorkspaceOptionProps {
  workspace: MulticaWorkspace;
  selected: boolean;
  onSelect: (id: string) => void;
}

function WorkspaceOption({ workspace, selected, onSelect }: WorkspaceOptionProps) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        borderRadius: 6,
        border: `1px solid ${selected ? "var(--border-strong)" : "var(--border)"}`,
        background: selected ? "var(--hover-overlay)" : "transparent",
        boxShadow: selected ? "inset 0 0 0 1px var(--border)" : "none",
        cursor: "pointer",
        transition: "background .16s ease, border-color .16s ease, box-shadow .16s ease",
      }}
    >
      <input
        type="radio"
        name="multica-workspace"
        value={workspace.id}
        checked={selected}
        onChange={() => onSelect(workspace.id)}
        style={{ accentColor: "var(--accent)" }}
      />
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span style={{ fontSize: 13, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {workspace.name}
        </span>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{workspace.slug}</span>
      </div>
    </label>
  );
}

const backdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "color-mix(in srgb, var(--bg-primary) 45%, transparent)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
  backdropFilter: "blur(6px)",
  WebkitBackdropFilter: "blur(6px)",
};
// --surface-glass is ~92% opaque, so the card's own 48px backdrop blur was
// visually negligible but re-ran over the already-blurred backdrop every frame.
const cardStyle: CSSProperties = {
  width: 440,
  maxWidth: "90vw",
  maxHeight: "85vh",
  background: "var(--surface-glass)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  display: "flex",
  flexDirection: "column",
  color: "var(--text-primary)",
  fontFamily: "var(--font-ui)",
  fontSize: 13,
  boxShadow: "var(--shadow-md)",
};
const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "14px 18px",
  borderBottom: "1px solid var(--border)",
};
const titleStyle: CSSProperties = { fontSize: 14, fontWeight: 500 };
const closeBtnStyle: CSSProperties = { background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", padding: 4 };
const bodyStyle: CSSProperties = { padding: 18, display: "flex", flexDirection: "column", gap: 12 };
const hintStyle: CSSProperties = { fontSize: 12, color: "var(--text-secondary)" };
const footerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  padding: "12px 18px",
  borderTop: "1px solid var(--border)",
};
const primaryBtnStyle = (enabled: boolean): CSSProperties => ({
  padding: "8px 14px",
  borderRadius: 6,
  border: "none",
  background: enabled ? "var(--text-primary)" : "var(--bg-tertiary)",
  color: enabled ? "var(--bg-primary)" : "var(--text-muted)",
  cursor: enabled ? "pointer" : "not-allowed",
  fontSize: 12,
  fontWeight: 500,
});
const secondaryBtnStyle: CSSProperties = {
  padding: "8px 14px",
  borderRadius: 6,
  background: "transparent",
  border: "1px solid var(--border)",
  color: "var(--text-secondary)",
  cursor: "pointer",
  fontSize: 12,
};
const inputStyle: CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 6,
  background: "var(--bg-tertiary)",
  border: "1px solid var(--border)",
  color: "var(--text-primary)",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
};
const labelStyle: CSSProperties = { fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 };
const errorStyle: CSSProperties = {
  fontSize: 12,
  color: "var(--accent)",
  background: "var(--hover-overlay)",
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid var(--border-strong)",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};
