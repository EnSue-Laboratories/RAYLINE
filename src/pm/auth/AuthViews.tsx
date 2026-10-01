import { useState, type CSSProperties, type ReactNode } from "react";
import { AlertCircle, Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import type { Translator } from "../../i18n";
import { MONO_FONT, SPIN_ANIMATION, SPIN_KEYFRAMES, SYSTEM_FONT } from "../styles";

const primaryBtn: CSSProperties = {
  background: "var(--control-bg-selected)",
  border: "1px solid var(--control-border-strong)",
  borderRadius: 6,
  color: "var(--text-primary)",
  fontSize: 12,
  fontWeight: 500,
  fontFamily: SYSTEM_FONT,
  padding: "7px 14px",
  cursor: "pointer",
};

const secondaryBtn: CSSProperties = {
  background: "transparent",
  border: "1px solid var(--pane-border)",
  borderRadius: 6,
  color: "var(--text-muted)",
  fontSize: 12,
  fontFamily: SYSTEM_FONT,
  padding: "7px 14px",
  cursor: "pointer",
};

function Center({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: "20px 0" }}>
      {children}
    </div>
  );
}

function Label({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ fontSize: 12, fontFamily: MONO_FONT, letterSpacing: ".06em", color: "var(--text-muted)", ...style }}>
      {children}
    </div>
  );
}

interface RetryActionsProps {
  t: Translator;
  retryLabel: string;
  onRetry: () => void;
  onClose: () => void;
}

function RetryActions({ t, retryLabel, onRetry, onClose }: RetryActionsProps) {
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
      <button onClick={onRetry} style={primaryBtn}>{retryLabel}</button>
      <button onClick={onClose} style={secondaryBtn}>{t("pm.cancel")}</button>
    </div>
  );
}

export function StartingView({ t }: { t: Translator }) {
  return (
    <Center>
      <Loader2 size={22} style={{ animation: SPIN_ANIMATION, color: "var(--text-muted)" }} />
      <Label>{t("pm.startingAuth")}</Label>
      <style>{SPIN_KEYFRAMES}</style>
    </Center>
  );
}

export function CodeView({ t, code }: { t: Translator; code: string }) {
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard may be unavailable; user can copy manually */ }
  };

  return (
    <>
      <Label>{t("pm.copyOneTimeCode")}</Label>
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
        <div style={{ flex: 1, fontFamily: MONO_FONT, fontSize: 22, letterSpacing: ".18em", color: "var(--text-primary)", textAlign: "center" }}>
          {code}
        </div>
        <button
          onClick={() => void copyCode()}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "var(--pane-interaction-hover-fill, var(--pane-hover))",
            border: "1px solid var(--pane-border)",
            borderRadius: 6,
            color: copied ? "var(--success-text)" : "var(--text-muted)",
            fontSize: 11,
            fontFamily: MONO_FONT,
            padding: "6px 10px",
            cursor: "pointer",
            letterSpacing: ".05em",
          }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? t("pm.copied") : t("pm.copy")}
        </button>
      </div>
      <Label style={{ marginTop: 16 }}>{t("pm.pasteCodeInBrowser")}</Label>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
        <ExternalLink size={12} style={{ color: "var(--text-disabled)" }} />
        <span style={{ fontSize: 12, fontFamily: MONO_FONT, color: "var(--text-muted)" }}>github.com/login/device</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16 }}>
        <Label style={{ marginTop: 0 }}>{t("pm.waitingForAuthorization")}</Label>
        <Loader2 size={16} style={{ animation: SPIN_ANIMATION, color: "var(--text-disabled)", flexShrink: 0 }} />
      </div>
      <style>{SPIN_KEYFRAMES}</style>
    </>
  );
}

export function SuccessView({ t, user }: { t: Translator; user: string | null }) {
  return (
    <Center>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          background: "var(--success-bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--success-text)",
        }}
      >
        <Check size={18} />
      </div>
      <div style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 10 }}>
        {user ? <>{t("pm.signedInAs")} <span style={{ fontFamily: MONO_FONT }}>@{user}</span></> : t("pm.signedIn")}
      </div>
    </Center>
  );
}

interface ErrorViewProps {
  t: Translator;
  error: string;
  output: string | null;
  onRetry: () => void;
  onClose: () => void;
}

const errorBoxStyle: CSSProperties = {
  marginTop: 10,
  padding: "10px 12px",
  borderRadius: 7,
  border: "1px solid var(--control-border-soft)",
  background: "var(--control-bg-soft)",
  fontSize: 12,
  fontFamily: SYSTEM_FONT,
  color: "var(--text-muted)",
  lineHeight: 1.45,
  maxHeight: 140,
  overflow: "auto",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const outputStyle: CSSProperties = {
  marginTop: 6,
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid var(--control-border-soft)",
  background: "var(--code-bg)",
  fontSize: 11,
  fontFamily: MONO_FONT,
  color: "var(--text-muted)",
  maxHeight: 160,
  overflow: "auto",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

export function ErrorView({ t, error, output, onRetry, onClose }: ErrorViewProps) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "var(--danger-bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--danger-text)",
            flexShrink: 0,
          }}
        >
          <AlertCircle size={15} strokeWidth={1.8} />
        </div>
        <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-secondary)" }}>{t("pm.authFailed")}</div>
      </div>
      <div style={errorBoxStyle}>{error || "Unknown error"}</div>
      {output && (
        <details style={{ marginTop: 8, fontSize: 11, color: "var(--text-subtle)", fontFamily: SYSTEM_FONT }}>
          <summary style={{ cursor: "pointer", userSelect: "none" }}>{t("pm.showGhOutput")}</summary>
          <pre style={outputStyle}>{output}</pre>
        </details>
      )}
      <RetryActions t={t} retryLabel={t("pm.tryAgain")} onRetry={onRetry} onClose={onClose} />
    </>
  );
}

export function CancelledView({ t, onRetry, onClose }: { t: Translator; onRetry: () => void; onClose: () => void }) {
  return (
    <Center>
      <Label>{t("pm.authCancelled")}</Label>
      <RetryActions t={t} retryLabel={t("pm.startAgain")} onRetry={onRetry} onClose={onClose} />
    </Center>
  );
}
