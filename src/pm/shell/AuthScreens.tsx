import WindowControls from "../../components/WindowControls";
import { useTranslator } from "../../contexts/LocaleContext";
import GitHubIcon from "../GitHubIcon";
import { dragRegionStyle } from "../styles";

interface ChromeProps {
  showWindowControls: boolean;
  /** Keeps the Windows caption buttons' hit area out of the drag region. */
  dragRegionRight: number;
}

function WindowChrome({ showWindowControls, dragRegionRight }: ChromeProps) {
  return (
    <>
      <WindowControls visible={showWindowControls} />
      <div style={{ ...dragRegionStyle, right: dragRegionRight }} />
    </>
  );
}

export function CheckingAuthScreen(props: ChromeProps) {
  const t = useTranslator();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        background: "var(--pane-background)",
        color: "var(--text-faint)",
        fontFamily: "var(--font-ui)",
        fontSize: 14,
      }}
    >
      <WindowChrome {...props} />
      {t("pm.checkingAuth")}
    </div>
  );
}

interface SignInScreenProps extends ChromeProps {
  onSignIn: () => void;
}

export function SignInScreen({ onSignIn, ...chrome }: SignInScreenProps) {
  const t = useTranslator();
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        gap: 16,
        background: "var(--pane-background)",
        fontFamily: "var(--font-ui)",
      }}
    >
      <WindowChrome {...chrome} />
      <GitHubIcon size={48} />
      <div style={{ fontSize: 16, color: "var(--text-muted)" }}>{t("pm.authMissingTitle")}</div>
      <div style={{ fontSize: 13, color: "var(--text-disabled)", maxWidth: 360, textAlign: "center" }}>{t("pm.authMissingBody")}</div>
      <button
        onClick={onSignIn}
        style={{
          marginTop: 4,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "9px 18px",
          borderRadius: 8,
          border: "1px solid var(--pane-border)",
          background: "var(--control-bg-active)",
          color: "var(--text-primary)",
          fontSize: 13,
          fontFamily: "var(--font-ui)",
          cursor: "pointer",
        }}
      >
        <GitHubIcon size={14} /> {t("pm.signIn")}
      </button>
    </div>
  );
}
