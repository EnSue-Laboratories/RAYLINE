import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { loadMulticaState, normalizeMulticaServerUrl, saveMulticaState } from "../multica/store";

export default function MulticaSetupModal({ open, onClose }) {
  const [step, setStep] = useState("connect"); // "connect" | "verify" | "workspace"
  const [serverUrl, setServerUrl] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [token, setToken] = useState("");
  const [workspaces, setWorkspaces] = useState(null); // null = not yet loaded, [] = loaded empty
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // On first open, if we already have a token, jump straight to Step C.
  useEffect(() => {
    if (!open) return;
    const existing = loadMulticaState();
    setError("");
    setBusy(false);
    setCode("");
    if (existing.token && existing.serverUrl) {
      setServerUrl(existing.serverUrl);
      setEmail(existing.email || "");
      setToken(existing.token);
      setStep("workspace");
      setWorkspaces(null);
    } else {
      setServerUrl(existing.serverUrl || "");
      setEmail(existing.email || "");
      setToken("");
      setStep("connect");
      setWorkspaces(null);
    }
  }, [open]);

  // Escape closes the modal.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const refreshWorkspaces = useCallback(async (srvUrl, tkn) => {
    setBusy(true);
    setError("");
    try {
      const res = await window.api.multicaListWorkspaces({ serverUrl: srvUrl, token: tkn });
      const list = Array.isArray(res) ? res : (res?.workspaces || []);
      setWorkspaces(list);
      if (list.length > 0) {
        setSelectedWorkspaceId(list[0].id);
      }
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  // When we land on step "workspace", fetch the list.
  useEffect(() => {
    if (!open) return;
    if (step !== "workspace") return;
    if (workspaces !== null) return;
    if (!token || !serverUrl) return;
    refreshWorkspaces(serverUrl, token);
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
      setError(err?.message || String(err));
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
      const res = await window.api.multicaVerifyCode({
        serverUrl: normalizedServerUrl,
        email: email.trim(),
        code: code.trim(),
      });
      const tkn = res?.token || "";
      if (!tkn) {
        setError("verify succeeded but no token was returned");
        return;
      }
      saveMulticaState({
        serverUrl: normalizedServerUrl,
        email: email.trim(),
        token: tkn,
        tokenIssuedAt: Date.now(),
      });
      setToken(tkn);
      setWorkspaces(null);
      setStep("workspace");
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const handlePickWorkspace = () => {
    if (!selectedWorkspaceId || !workspaces) return;
    const ws = workspaces.find((w) => w.id === selectedWorkspaceId);
    if (!ws) return;
    saveMulticaState({ workspaceId: ws.id, workspaceSlug: ws.slug });
    window.dispatchEvent(new CustomEvent("multica-refresh"));
    onClose?.();
  };

  const title = step === "connect"
    ? "Connect to Multica"
    : step === "verify"
      ? "Verify email"
      : "Choose workspace";

  const renderConnect = () => (
    <div style={bodyStyle}>
      <div>
        <div style={labelStyle}>Server URL</div>
        <input
          style={inputStyle}
          value={serverUrl}
          onChange={(e) => setServerUrl(e.target.value)}
          placeholder="https://your-multica-server"
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
        />
      </div>
      <div>
        <div style={labelStyle}>Email</div>
        <input
          style={inputStyle}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          spellCheck={false}
          disabled={busy}
          onKeyDown={(e) => { if (e.key === "Enter") handleSendCode(); }}
        />
      </div>
      {error && <div style={errorStyle}>{error}</div>}
    </div>
  );

  const renderVerify = () => (
    <div style={bodyStyle}>
      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
        We sent a 6-digit code to <span style={{ color: "var(--text-primary)" }}>{email}</span>.
      </div>
      <div>
        <div style={labelStyle}>Verification code</div>
        <input
          style={inputStyle}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="123456"
          autoComplete="one-time-code"
          inputMode="numeric"
          spellCheck={false}
          disabled={busy}
          autoFocus
          onKeyDown={(e) => { if (e.key === "Enter") handleVerifyCode(); }}
        />
      </div>
      {error && <div style={errorStyle}>{error}</div>}
    </div>
  );

  const renderWorkspace = () => {
    if (workspaces === null) {
      return (
        <div style={bodyStyle}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {busy ? "Loading workspaces..." : "Preparing..."}
          </div>
          {error && <div style={errorStyle}>{error}</div>}
        </div>
      );
    }
    if (workspaces.length === 0) {
      return (
        <div style={bodyStyle}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
            No workspaces yet. Create one in the Multica web UI at{" "}
            <span style={{ color: "var(--text-primary)" }}>{serverUrl}</span>, then click Refresh.
          </div>
          {error && <div style={errorStyle}>{error}</div>}
        </div>
      );
    }
    return (
      <div style={bodyStyle}>
        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          Pick a workspace to use with RayLine:
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
          {workspaces.map((ws) => {
            const selected = ws.id === selectedWorkspaceId;
            return (
              <label
                key={ws.id}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
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
                  value={ws.id}
                  checked={selected}
                  onChange={() => setSelectedWorkspaceId(ws.id)}
                  style={{ accentColor: "var(--accent)" }}
                />
                <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <span style={{ fontSize: 13, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {ws.name}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {ws.slug}
                  </span>
                </div>
              </label>
            );
          })}
        </div>
        {error && <div style={errorStyle}>{error}</div>}
      </div>
    );
  };

  const renderFooter = () => {
    if (step === "connect") {
      const canSend = Boolean(serverUrl.trim() && email.trim()) && !busy;
      return (
        <div style={footerStyle}>
          <button type="button" style={secondaryBtnStyle} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            style={primaryBtnStyle(canSend)}
            onClick={handleSendCode}
            disabled={!canSend}
          >
            {busy ? "Sending..." : "Send code"}
          </button>
        </div>
      );
    }
    if (step === "verify") {
      const canVerify = Boolean(code.trim()) && !busy;
      return (
        <div style={footerStyle}>
          <button
            type="button"
            style={secondaryBtnStyle}
            onClick={() => { setError(""); setStep("connect"); }}
            disabled={busy}
          >
            Back
          </button>
          <button
            type="button"
            style={primaryBtnStyle(canVerify)}
            onClick={handleVerifyCode}
            disabled={!canVerify}
          >
            {busy ? "Verifying..." : "Verify"}
          </button>
        </div>
      );
    }
    // workspace step
    if (workspaces && workspaces.length === 0) {
      return (
        <div style={footerStyle}>
          <button type="button" style={secondaryBtnStyle} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            style={primaryBtnStyle(!busy)}
            onClick={() => refreshWorkspaces(serverUrl, token)}
            disabled={busy}
          >
            {busy ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      );
    }
    if (workspaces && workspaces.length > 0) {
      const canContinue = Boolean(selectedWorkspaceId) && !busy;
      return (
        <div style={footerStyle}>
          <button type="button" style={secondaryBtnStyle} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            style={primaryBtnStyle(canContinue)}
            onClick={handlePickWorkspace}
            disabled={!canContinue}
          >
            Continue
          </button>
        </div>
      );
    }
    // loading state
    return (
      <div style={footerStyle}>
        <button type="button" style={secondaryBtnStyle} onClick={onClose} disabled={busy}>
          Cancel
        </button>
      </div>
    );
  };

  return createPortal(
    <div style={backdropStyle} onPointerDown={onClose}>
      <div
        style={cardStyle}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={headerStyle}>
          <div style={titleStyle}>{title}</div>
          <button
            type="button"
            style={closeBtnStyle}
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        {step === "connect" && renderConnect()}
        {step === "verify" && renderVerify()}
        {step === "workspace" && renderWorkspace()}
        {renderFooter()}
      </div>
    </div>,
    document.body,
  );
}

const backdropStyle = {
  position: "fixed", inset: 0, background: "color-mix(in srgb, var(--bg-primary) 45%, transparent)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 1000, backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
};
const cardStyle = {
  width: 440, maxWidth: "90vw", maxHeight: "85vh",
  background: "var(--surface-glass)",
  backdropFilter: "blur(48px) saturate(1.2)",
  WebkitBackdropFilter: "blur(48px) saturate(1.2)",
  border: "1px solid var(--border)",
  borderRadius: 12, display: "flex", flexDirection: "column",
  color: "var(--text-primary)", fontFamily: "system-ui, sans-serif", fontSize: 13,
  boxShadow: "var(--shadow-md)",
};
const headerStyle = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "14px 18px", borderBottom: "1px solid var(--border)",
};
const titleStyle = { fontSize: 14, fontWeight: 500 };
const closeBtnStyle = {
  background: "none", border: "none", color: "var(--text-secondary)",
  cursor: "pointer", padding: 4,
};
const bodyStyle = { padding: 18, display: "flex", flexDirection: "column", gap: 12 };
const footerStyle = {
  display: "flex", justifyContent: "flex-end", gap: 8,
  padding: "12px 18px", borderTop: "1px solid var(--border)",
};
const primaryBtnStyle = (enabled) => ({
  padding: "8px 14px", borderRadius: 6, border: "none",
  background: enabled ? "var(--text-primary)" : "var(--bg-tertiary)",
  color: enabled ? "var(--bg-primary)" : "var(--text-muted)",
  cursor: enabled ? "pointer" : "not-allowed",
  fontSize: 12, fontWeight: 500,
});
const secondaryBtnStyle = {
  padding: "8px 14px", borderRadius: 6,
  background: "transparent",
  border: "1px solid var(--border)",
  color: "var(--text-secondary)",
  cursor: "pointer", fontSize: 12,
};
const inputStyle = {
  width: "100%", padding: "8px 10px", borderRadius: 6,
  background: "var(--bg-tertiary)",
  border: "1px solid var(--border)",
  color: "var(--text-primary)", fontSize: 13, fontFamily: "inherit",
  outline: "none",
};
const labelStyle = { fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 };
const errorStyle = {
  fontSize: 12, color: "var(--accent)",
  background: "var(--hover-overlay)",
  padding: "8px 10px", borderRadius: 6,
  border: "1px solid var(--border-strong)",
  whiteSpace: "pre-wrap", wordBreak: "break-word",
};
