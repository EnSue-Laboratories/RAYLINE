import { Loader2, LogOut, Plus } from "lucide-react";
import AccountSwitcher from "../pm/accounts/AccountSwitcher";
import ActionRow from "../pm/accounts/ActionRow";
import { useGhAccounts } from "../pm/accounts/useGhAccounts";
import { useTranslator } from "../contexts/LocaleContext";
import ModalShell from "../pm/ModalShell";
import { SPIN_ANIMATION, SPIN_KEYFRAMES, SYSTEM_FONT } from "../pm/styles";

interface AccountManagerProps {
  currentUser: string | null;
  onAddAccount: () => void;
  onAccountSwitched?: (login: string) => unknown;
  onSignedOut?: () => unknown;
  onClose: () => void;
}

/** Switch between gh accounts, add one, or sign out. */
export default function AccountManager({ currentUser, onAddAccount, onAccountSwitched, onSignedOut, onClose }: AccountManagerProps) {
  const t = useTranslator();
  const { accounts, activeUser, loadingAccounts, switchingUser, signingOut, error, switchAccount, signOut } = useGhAccounts({
    currentUser,
    onAccountSwitched,
    onSignedOut,
  });

  return (
    <ModalShell
      onClose={onClose}
      width={400}
      panelStyle={{ boxShadow: "0 20px 60px rgba(0,0,0,0.5)", fontFamily: SYSTEM_FONT }}
      title={<span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-secondary)" }}>{t("pm.manageAccountTitle")}</span>}
    >
      <div style={{ padding: "14px 16px 8px" }}>
        <AccountSwitcher
          t={t}
          accounts={accounts}
          activeUser={activeUser}
          loadingAccounts={loadingAccounts}
          switchingUser={switchingUser}
          signingOut={signingOut}
          onSwitch={(login, closeMenu) => void switchAccount(login, closeMenu)}
        />
      </div>

      <div style={{ padding: "4px 12px 12px" }}>
        <ActionRow
          icon={<Plus size={15} strokeWidth={1.5} />}
          title={t("pm.addAccount")}
          subtitle={t("pm.addAccountSubtitle")}
          onClick={onAddAccount}
        />
        <ActionRow
          icon={signingOut ? <Loader2 size={15} strokeWidth={1.5} style={{ animation: SPIN_ANIMATION }} /> : <LogOut size={15} strokeWidth={1.5} />}
          title={signingOut ? t("pm.signingOut") : t("pm.signOut")}
          subtitle={t("pm.signOutSubtitle")}
          onClick={signingOut ? undefined : () => void signOut()}
          danger
        />
        <style>{SPIN_KEYFRAMES}</style>

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
    </ModalShell>
  );
}
