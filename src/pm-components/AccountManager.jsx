import { useEffect, useMemo, useState } from "react";
import { X, LogOut, ChevronDown, Loader2, Check, Plus } from "lucide-react";
import { createTranslator } from "../i18n";

function GitHubGlyph({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function cleanError(err, fallback) {
  const msg = (err && err.message) || fallback;
  return String(msg)
    .replace(/^Error invoking remote method '[^']+':\s*/i, "")
    .replace(/^Error:\s*/i, "");
}

export default function AccountManager({
  currentUser,
  onAddAccount,
  onAccountSwitched,
  onSignedOut,
  onClose,
  locale,
}) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const [accounts, setAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [switchingUser, setSwitchingUser] = useState(null);
  const [hoveredUser, setHoveredUser] = useState(null);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState(null);

  const activeUser = currentUser || accounts.find((account) => account.active)?.login || null;

  const loadAccounts = async () => {
    setLoadingAccounts(true);
    try {
      const res = await window.ghApi.listAuthAccounts();
      if (res && res.ok === false) {
        throw new Error(res.error || "Failed to load GitHub accounts");
      }
      const nextAccounts = Array.isArray(res?.accounts) ? res.accounts : [];
      setAccounts(nextAccounts);
    } catch (err) {
      setError(cleanError(err, "Failed to load GitHub accounts"));
      setAccounts(currentUser ? [{ login: currentUser, active: true }] : []);
    } finally {
      setLoadingAccounts(false);
    }
  };

  useEffect(() => {
    loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    setAccounts((prev) => {
      if (!prev.length) return [{ login: currentUser, active: true }];
      return prev.map((account) => ({
        ...account,
        active: account.login === currentUser,
      }));
    });
  }, [currentUser]);

  const handleSwitchAccount = async (login) => {
    if (!login || login === activeUser || switchingUser || signingOut) {
      setMenuOpen(false);
      return;
    }

    setSwitchingUser(login);
    setError(null);
    try {
      const res = await window.ghApi.switchAccount(login);
      if (res && res.ok === false) {
        throw new Error(res.error || "Switch account failed");
      }
      setAccounts((prev) => prev.map((account) => ({
        ...account,
        active: account.login === login,
      })));
      setMenuOpen(false);
      if (onAccountSwitched) {
        await onAccountSwitched(login);
      }
    } catch (err) {
      setError(cleanError(err, "Switch account failed"));
    } finally {
      setSwitchingUser(null);
    }
  };

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
      setError(cleanError(err, "Sign out failed"));
      setSigningOut(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--pm-modal-backdrop)",
        backdropFilter: "blur(var(--pm-modal-backdrop-blur))",
        WebkitBackdropFilter: "blur(var(--pm-modal-backdrop-blur))",
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--control-bg)",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: "var(--text-secondary)",
            }}
          >
            {t("pm.manageAccountTitle")}
          </span>
          <button
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              border: "1px solid var(--pane-border)",
              background: "var(--pane-hover)",
              color: "var(--text-muted)",
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

        <div style={{ padding: "14px 16px 8px" }}>
          <div
            style={{
              width: "100%",
              borderRadius: 8,
              border: "1px solid var(--pane-border)",
              background: "var(--pane-hover)",
              overflow: "hidden",
            }}
          >
            <button
              onClick={() => setMenuOpen((open) => !open)}
              disabled={loadingAccounts || signingOut}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: activeUser ? "12px 14px" : "14px",
                border: "none",
                background: "transparent",
                color: "var(--text-secondary)",
                textAlign: "left",
                cursor: loadingAccounts || signingOut ? "default" : "pointer",
              }}
            >
              <div style={{ color: "var(--text-muted)", display: "flex" }}>
                <GitHubGlyph size={18} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {activeUser ? (
                  <>
                    <div
                      style={{
                        fontSize: 10,
                        fontFamily: "'JetBrains Mono', monospace",
                        color: "var(--text-disabled)",
                        letterSpacing: ".08em",
                        marginBottom: 2,
                      }}
                    >
                      {t("pm.signedInAsLabel")}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        fontFamily: "'JetBrains Mono', monospace",
                        color: "var(--text-secondary)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      @{activeUser}
                    </div>
                  </>
                ) : (
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--text-tertiary)",
                    }}
                  >
                    {loadingAccounts ? t("pm.loadingAccounts") : t("pm.signedInGithub")}
                  </div>
                )}
              </div>
              {loadingAccounts ? (
                <Loader2
                  size={14}
                  strokeWidth={1.5}
                  style={{ animation: "spin 1s linear infinite", color: "var(--text-subtle)" }}
                />
              ) : (
                <ChevronDown
                  size={15}
                  strokeWidth={1.5}
                  style={{
                    color: "var(--text-subtle)",
                    transform: menuOpen ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform .18s ease",
                  }}
                />
              )}
            </button>

            {menuOpen && (
              <div
                style={{
                  borderTop: "1px solid var(--control-border-soft)",
                  background: "var(--pane-hover)",
                }}
              >
                {accounts.map((account) => {
                  const isActive = account.login === activeUser;
                  const isSwitching = switchingUser === account.login;
                  const isHovered = hoveredUser === account.login;
                  return (
                    <button
                      key={account.login}
                      onClick={() => handleSwitchAccount(account.login)}
                      onMouseEnter={() => setHoveredUser(account.login)}
                      onMouseLeave={() => setHoveredUser(null)}
                      disabled={isSwitching || signingOut}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 12px",
                        border: "none",
                        borderTop: "1px solid var(--control-bg)",
                        background: !isSwitching && isHovered ? "var(--control-border-soft)" : "transparent",
                        color: "var(--text-secondary)",
                        textAlign: "left",
                        cursor: isActive || isSwitching || signingOut ? "default" : "pointer",
                        opacity: isSwitching ? 0.8 : 1,
                      }}
                    >
                      <span style={{ display: "flex", color: "var(--text-subtle)" }}>
                        <GitHubGlyph size={16} />
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span
                          style={{
                            display: "block",
                            fontSize: 13,
                            fontFamily: "'JetBrains Mono', monospace",
                            color: isActive ? "var(--text-primary)" : "var(--text-tertiary)",
                          }}
                        >
                          @{account.login}
                        </span>
                        <span
                          style={{
                            display: "block",
                            marginTop: 2,
                            fontSize: 11,
                            color: "var(--text-disabled)",
                          }}
                        >
                          {isActive ? t("pm.currentAccount") : t("pm.switchToAccount")}
                        </span>
                      </span>
                      {isSwitching ? (
                        <Loader2
                          size={14}
                          strokeWidth={1.5}
                          style={{ animation: "spin 1s linear infinite", color: "var(--text-subtle)" }}
                        />
                      ) : isActive ? (
                        <Check size={14} strokeWidth={1.8} style={{ color: "var(--text-muted)" }} />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div style={{ padding: "4px 12px 12px" }}>
          <ActionRow
            icon={<Plus size={15} strokeWidth={1.5} />}
            title={t("pm.addAccount")}
            subtitle={t("pm.addAccountSubtitle")}
            onClick={onAddAccount}
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
            title={signingOut ? t("pm.signingOut") : t("pm.signOut")}
            subtitle={t("pm.signOutSubtitle")}
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
                border: "1px solid var(--danger-border)",
                background: "var(--danger-bg-soft)",
                fontSize: 12,
                color: "var(--danger-text)",
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
            ? "var(--danger-text-strong)"
            : "var(--danger-text)"
          : "var(--text-secondary)",
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
              ? "var(--danger-text-strong)"
              : "var(--danger-text)"
            : "var(--text-muted)",
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
            color: "var(--text-disabled)",
            marginTop: 2,
          }}
        >
          {subtitle}
        </span>
      </span>
    </button>
  );
}
