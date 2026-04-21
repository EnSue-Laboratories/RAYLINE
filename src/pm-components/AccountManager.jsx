import { useState } from "react";
import { X, LogOut, UserCog, Loader2 } from "lucide-react";

function GitHubGlyph({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export default function AccountManager({ currentUser, onSwitchAccount, onSignedOut, onClose }) {
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState(null);

  const handleSignOut = async () => {
    setSigningOut(true);
    setError(null);
    try {
      const res = await window.ghApi.authLogout();
      if (res && res.ok === false) {
        setError(res.error || "Sign out failed");
        setSigningOut(false);
        return;
      }
      onSignedOut && onSignedOut();
    } catch (err) {
      const msg = (err && err.message) || "Sign out failed";
      const cleaned = msg
        .replace(/^Error invoking remote method '[^']+':\s*/i, "")
        .replace(/^Error:\s*/i, "");
      setError(cleaned);
      setSigningOut(false);
    }
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
          width: 400,
          background: "var(--pane-elevated)",
          backdropFilter: "blur(48px) saturate(1.2)",
          WebkitBackdropFilter: "blur(48px) saturate(1.2)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
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
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: "rgba(255,255,255,0.85)",
            }}
          >
            Manage Account
          </span>
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

        {/* Current user card */}
        <div style={{ padding: "14px 16px 8px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: currentUser ? "12px 14px" : "14px",
              borderRadius: 8,
              border: "1px solid var(--pane-border)",
              background: "var(--pane-hover)",
            }}
          >
            <div style={{ color: "rgba(255,255,255,0.6)", display: "flex" }}>
              <GitHubGlyph size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              {currentUser ? (
                <>
                  <div
                    style={{
                      fontSize: 10,
                      fontFamily: "'JetBrains Mono', monospace",
                      color: "rgba(255,255,255,0.35)",
                      letterSpacing: ".08em",
                      marginBottom: 2,
                    }}
                  >
                    SIGNED IN AS
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      fontFamily: "'JetBrains Mono', monospace",
                      color: "rgba(255,255,255,0.85)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    @{currentUser}
                  </div>
                </>
              ) : (
                <div
                  style={{
                    fontSize: 13,
                    fontFamily: "system-ui, sans-serif",
                    color: "rgba(255,255,255,0.75)",
                  }}
                >
                  Signed in to GitHub
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ padding: "4px 12px 12px" }}>
          <ActionRow
            icon={<UserCog size={15} strokeWidth={1.5} />}
            title="Switch account"
            subtitle="Sign in as a different GitHub user"
            onClick={onSwitchAccount}
          />
          <ActionRow
            icon={
              signingOut ? (
                <Loader2
                  size={15}
                  strokeWidth={1.5}
                  style={{ animation: "spin 1s linear infinite" }}
                />
              ) : (
                <LogOut size={15} strokeWidth={1.5} />
              )
            }
            title={signingOut ? "Signing out…" : "Sign out"}
            subtitle="Log out of the GitHub CLI on this device"
            onClick={signingOut ? null : handleSignOut}
            danger
          />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

          {error && (
            <div
              style={{
                marginTop: 8,
                padding: "8px 12px",
                borderRadius: 7,
                border: "1px solid rgba(220,120,120,0.22)",
                background: "rgba(220,120,120,0.07)",
                fontSize: 12,
                color: "rgba(230,180,180,0.82)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionRow({ icon, title, subtitle, onClick, danger }) {
  const [hovered, setHovered] = useState(false);
  const disabled = !onClick;
  return (
    <button
      onClick={onClick || undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      disabled={disabled}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        padding: "10px 12px",
        borderRadius: 8,
        border: "none",
        cursor: disabled ? "default" : "pointer",
        background: hovered && !disabled ? "var(--pane-hover)" : "transparent",
        transition: "background .15s, color .15s",
        textAlign: "left",
        color: danger
          ? hovered
            ? "rgba(230,140,140,0.95)"
            : "rgba(220,140,140,0.8)"
          : "rgba(255,255,255,0.8)",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span
        style={{
          display: "flex",
          width: 15,
          height: 15,
          flexShrink: 0,
          color: danger
            ? hovered
              ? "rgba(230,140,140,0.95)"
              : "rgba(220,140,140,0.7)"
            : "rgba(255,255,255,0.55)",
        }}
      >
        {icon}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: "block",
            fontSize: 13,
            fontFamily: "system-ui, sans-serif",
            color: "inherit",
          }}
        >
          {title}
        </span>
        <span
          style={{
            display: "block",
            fontSize: 11,
            fontFamily: "system-ui, sans-serif",
            color: "rgba(255,255,255,0.35)",
            marginTop: 2,
          }}
        >
          {subtitle}
        </span>
      </span>
    </button>
  );
}
