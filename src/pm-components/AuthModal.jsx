import { useEffect, useRef, useState } from "react";
import { X, Loader2, Check, Copy, ExternalLink, AlertCircle } from "lucide-react";

function cleanError(msg) {
  if (!msg) return "Unknown error";
  return String(msg)
    .replace(/^Error invoking remote method '[^']+':\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .trim();
}

function GitHubGlyph({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

// phases: idle | starting | code | success | error | cancelled
export default function AuthModal({ mode = "signin", currentUser, onClose, onAuthSuccess }) {
  const [phase, setPhase] = useState("idle");
  const [code, setCode] = useState(null);
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);
  const [errorOutput, setErrorOutput] = useState(null);
  const [copied, setCopied] = useState(false);
  const unsubRef = useRef(null);
  const startTimerRef = useRef(null);
  const flowStartedRef = useRef(false);

  const clearAuthListener = () => {
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }
  };

  const start = async () => {
    clearAuthListener();
    flowStartedRef.current = true;
    setPhase("starting");
    setCode(null);
    setUser(null);
    setError(null);
    setErrorOutput(null);

    const unsub = window.ghApi.onAuthEvent((event) => {
      if (event.type === "code") {
        setCode(event.code);
        setPhase("code");
      } else if (event.type === "success") {
        flowStartedRef.current = false;
        setUser(event.user || null);
        setPhase("success");
      } else if (event.type === "error") {
        flowStartedRef.current = false;
        setError(cleanError(event.error) || "Authentication failed");
        setErrorOutput(event.output || null);
        setPhase("error");
      } else if (event.type === "cancelled") {
        flowStartedRef.current = false;
        setPhase("cancelled");
      }
    });
    unsubRef.current = unsub;

    try {
      // `gh auth login --web` handles the already-signed-in case by asking
      // for re-auth confirmation, which we auto-accept in github-manager.
      // No explicit pre-logout is needed for `switch`.
      await window.ghApi.authStart();
    } catch (err) {
      flowStartedRef.current = false;
      setError(cleanError(err && err.message) || "Failed to start auth flow");
      setPhase("error");
    }
  };

  useEffect(() => {
    // Defer startup one tick so React StrictMode's mount probe doesn't start
    // and immediately cancel the interactive gh session in development.
    startTimerRef.current = setTimeout(() => {
      startTimerRef.current = null;
      start();
    }, 0);

    return () => {
      if (startTimerRef.current) {
        clearTimeout(startTimerRef.current);
        startTimerRef.current = null;
      }
      clearAuthListener();
      // Best-effort: if the user closes the modal mid-flow, kill the gh process.
      if (flowStartedRef.current) {
        flowStartedRef.current = false;
        window.ghApi.authCancel().catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase === "success") {
      const t = setTimeout(() => {
        onAuthSuccess && onAuthSuccess(user);
      }, 1200);
      return () => clearTimeout(t);
    }
  }, [phase, user, onAuthSuccess]);

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard may be unavailable; user can copy manually */ }
  };

  const retry = async () => {
    if (startTimerRef.current) {
      clearTimeout(startTimerRef.current);
      startTimerRef.current = null;
    }
    clearAuthListener();
    if (flowStartedRef.current) {
      flowStartedRef.current = false;
      await window.ghApi.authCancel().catch(() => {});
    }
    start();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 420,
          background: "var(--pane-elevated)",
          borderRadius: 12,
          border: "1px solid var(--pane-border)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid rgba(255,255,255,0.04)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "rgba(255,255,255,0.85)" }}>
            <GitHubGlyph size={18} />
            <span style={{ fontSize: 14, fontWeight: 500 }}>
              {mode === "switch" ? "Switch GitHub account" : "Sign in to GitHub"}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              border: "1px solid var(--pane-border)",
              background: "var(--pane-hover)",
              color: "rgba(255,255,255,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 22px", minHeight: 180 }}>
          {mode === "switch" && currentUser && phase !== "success" && (
            <div
              style={{
                fontSize: 12,
                color: "rgba(255,255,255,0.45)",
                marginBottom: 14,
              }}
            >
              Currently signed in as{" "}
              <span style={{ color: "rgba(255,255,255,0.75)", fontFamily: "'JetBrains Mono', monospace" }}>
                @{currentUser}
              </span>
            </div>
          )}

          {phase === "starting" && (
            <Center>
              <Loader2 size={22} style={{ animation: "spin 1s linear infinite", color: "rgba(255,255,255,0.5)" }} />
              <Label>Starting GitHub authentication…</Label>
              <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            </Center>
          )}

          {phase === "code" && code && (
            <>
              <Label>
                1. Copy this one-time code
              </Label>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginTop: 8,
                  padding: "14px 16px",
                  borderRadius: 8,
                  border: "1px solid var(--pane-border)",
                  background: "var(--pane-hover)",
                }}
              >
                <div
                  style={{
                    flex: 1,
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 22,
                    letterSpacing: ".18em",
                    color: "rgba(255,255,255,0.9)",
                    textAlign: "center",
                  }}
                >
                  {code}
                </div>
                <button
                  onClick={copyCode}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    background: "var(--pane-interaction-hover-fill, var(--pane-hover))",
                    border: "1px solid var(--pane-border)",
                    borderRadius: 6,
                    color: copied ? "rgba(130, 220, 160, 0.9)" : "rgba(255,255,255,0.6)",
                    fontSize: 11,
                    fontFamily: "'JetBrains Mono', monospace",
                    padding: "6px 10px",
                    cursor: "pointer",
                    letterSpacing: ".05em",
                  }}
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? "COPIED" : "COPY"}
                </button>
              </div>
              <Label style={{ marginTop: 16 }}>
                2. Paste the code in your browser to authorize
              </Label>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <ExternalLink size={12} style={{ color: "rgba(255,255,255,0.35)" }} />
                <span
                  style={{
                    fontSize: 12,
                    fontFamily: "'JetBrains Mono', monospace",
                    color: "rgba(255,255,255,0.55)",
                  }}
                >
                  github.com/login/device
                </span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginLeft: 4 }}>
                  opened automatically
                </span>
              </div>
              <Label style={{ marginTop: 16 }}>
                3. Waiting for authorization…
              </Label>
              <Loader2
                size={16}
                style={{
                  animation: "spin 1s linear infinite",
                  color: "rgba(255,255,255,0.35)",
                  marginTop: 8,
                }}
              />
              <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            </>
          )}

          {phase === "success" && (
            <Center>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: "rgba(130, 220, 160, 0.15)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "rgba(130, 220, 160, 0.9)",
                }}
              >
                <Check size={18} />
              </div>
              <div style={{ fontSize: 14, color: "rgba(255,255,255,0.85)", marginTop: 10 }}>
                {user ? <>Signed in as <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>@{user}</span></> : "Signed in"}
              </div>
            </Center>
          )}

          {phase === "error" && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: "rgba(220,120,120,0.12)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "rgba(230,140,140,0.9)",
                    flexShrink: 0,
                  }}
                >
                  <AlertCircle size={15} strokeWidth={1.8} />
                </div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: "rgba(255,255,255,0.85)",
                  }}
                >
                  Authentication failed
                </div>
              </div>
              <div
                style={{
                  marginTop: 10,
                  padding: "10px 12px",
                  borderRadius: 7,
                  border: "1px solid rgba(255,255,255,0.05)",
                  background: "rgba(255,255,255,0.025)",
                  fontSize: 12,
                  fontFamily: "system-ui, sans-serif",
                  color: "rgba(255,255,255,0.55)",
                  lineHeight: 1.45,
                  maxHeight: 140,
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {error || "Unknown error"}
              </div>
              {errorOutput && (
                <details
                  style={{
                    marginTop: 8,
                    fontSize: 11,
                    color: "rgba(255,255,255,0.4)",
                    fontFamily: "system-ui, sans-serif",
                  }}
                >
                  <summary style={{ cursor: "pointer", userSelect: "none" }}>
                    Show gh output
                  </summary>
                  <pre
                    style={{
                      marginTop: 6,
                      padding: "8px 10px",
                      borderRadius: 6,
                      border: "1px solid rgba(255,255,255,0.05)",
                      background: "rgba(0,0,0,0.25)",
                      fontSize: 11,
                      fontFamily: "'JetBrains Mono', monospace",
                      color: "rgba(255,255,255,0.55)",
                      maxHeight: 160,
                      overflow: "auto",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {errorOutput}
                  </pre>
                </details>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button onClick={retry} style={primaryBtn}>Try again</button>
                <button onClick={onClose} style={secondaryBtn}>Close</button>
              </div>
            </>
          )}

          {phase === "cancelled" && (
            <Center>
              <Label>Authentication cancelled.</Label>
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button onClick={retry} style={primaryBtn}>Start again</button>
                <button onClick={onClose} style={secondaryBtn}>Close</button>
              </div>
            </Center>
          )}
        </div>
      </div>
    </div>
  );
}

function Center({ children }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: "20px 0",
      }}
    >
      {children}
    </div>
  );
}

function Label({ children, style }) {
  return (
    <div
      style={{
        fontSize: 12,
        fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: ".06em",
        color: "rgba(255,255,255,0.55)",
        ...(style || {}),
      }}
    >
      {children}
    </div>
  );
}

const primaryBtn = {
  background: "rgba(255,255,255,0.18)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 6,
  color: "rgba(255,255,255,0.95)",
  fontSize: 12,
  fontWeight: 500,
  fontFamily: "system-ui, sans-serif",
  padding: "7px 14px",
  cursor: "pointer",
};

const secondaryBtn = {
  background: "transparent",
  border: "1px solid var(--pane-border)",
  borderRadius: 6,
  color: "rgba(255,255,255,0.5)",
  fontSize: 12,
  fontFamily: "system-ui, sans-serif",
  padding: "7px 14px",
  cursor: "pointer",
};
