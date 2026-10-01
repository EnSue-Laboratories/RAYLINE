import { useState } from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import type { GhAuthAccount } from "@shared/github/types";
import type { Translate } from "../boundary";
import GitHubIcon from "../GitHubIcon";
import { MONO_FONT, SPIN_ANIMATION } from "../styles";

interface AccountSwitcherProps {
  t: Translate;
  accounts: GhAuthAccount[];
  activeUser: string | null;
  loadingAccounts: boolean;
  switchingUser: string | null;
  signingOut: boolean;
  onSwitch: (login: string, closeMenu: () => void) => void;
}

interface AccountOptionProps {
  t: Translate;
  login: string;
  isActive: boolean;
  isSwitching: boolean;
  signingOut: boolean;
  onSelect: (login: string) => void;
}

function AccountOption({ t, login, isActive, isSwitching, signingOut, onSelect }: AccountOptionProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={() => onSelect(login)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      disabled={isSwitching || signingOut}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        border: "none",
        borderTop: "1px solid var(--control-bg)",
        background: !isSwitching && hovered ? "var(--control-border-soft)" : "transparent",
        color: "var(--text-secondary)",
        textAlign: "left",
        cursor: isActive || isSwitching || signingOut ? "default" : "pointer",
        opacity: isSwitching ? 0.8 : 1,
      }}
    >
      <span style={{ display: "flex", color: "var(--text-subtle)" }}>
        <GitHubIcon size={16} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13, fontFamily: MONO_FONT, color: isActive ? "var(--text-primary)" : "var(--text-tertiary)" }}>
          @{login}
        </span>
        <span style={{ display: "block", marginTop: 2, fontSize: 11, color: "var(--text-disabled)" }}>
          {isActive ? t("pm.currentAccount") : t("pm.switchToAccount")}
        </span>
      </span>
      {isSwitching ? (
        <Loader2 size={14} strokeWidth={1.5} style={{ animation: SPIN_ANIMATION, color: "var(--text-subtle)" }} />
      ) : isActive ? (
        <Check size={14} strokeWidth={1.8} style={{ color: "var(--text-muted)" }} />
      ) : null}
    </button>
  );
}

/** The "signed in as" card that expands into the account list. */
export default function AccountSwitcher({ t, accounts, activeUser, loadingAccounts, switchingUser, signingOut, onSwitch }: AccountSwitcherProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  const busy = loadingAccounts || signingOut;

  return (
    <div style={{ width: "100%", borderRadius: 8, border: "1px solid var(--pane-border)", background: "var(--pane-hover)", overflow: "hidden" }}>
      <button
        onClick={() => setMenuOpen((open) => !open)}
        disabled={busy}
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
          cursor: busy ? "default" : "pointer",
        }}
      >
        <div style={{ color: "var(--text-muted)", display: "flex" }}>
          <GitHubIcon size={18} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {activeUser ? (
            <>
              <div style={{ fontSize: 10, fontFamily: MONO_FONT, color: "var(--text-disabled)", letterSpacing: ".08em", marginBottom: 2 }}>
                {t("pm.signedInAsLabel")}
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontFamily: MONO_FONT,
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
            <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
              {loadingAccounts ? t("pm.loadingAccounts") : t("pm.signedInGithub")}
            </div>
          )}
        </div>
        {loadingAccounts ? (
          <Loader2 size={14} strokeWidth={1.5} style={{ animation: SPIN_ANIMATION, color: "var(--text-subtle)" }} />
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
        <div style={{ borderTop: "1px solid var(--control-border-soft)", background: "var(--pane-hover)" }}>
          {accounts.map((account) => (
            <AccountOption
              key={account.login}
              t={t}
              login={account.login}
              isActive={account.login === activeUser}
              isSwitching={switchingUser === account.login}
              signingOut={signingOut}
              onSelect={(login) => onSwitch(login, closeMenu)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
