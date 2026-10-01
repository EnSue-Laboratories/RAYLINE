import { useTranslator } from "../contexts/LocaleContext";
import { CancelledView, CodeView, ErrorView, StartingView, SuccessView } from "../pm/auth/AuthViews";
import type { AuthFlowState } from "../pm/auth/authFlow";
import { useGhAuthFlow } from "../pm/auth/useGhAuthFlow";
import GitHubIcon from "../pm/GitHubIcon";
import ModalShell from "../pm/ModalShell";
import { MONO_FONT, SYSTEM_FONT } from "../pm/styles";
import type { AuthModalMode } from "../pm/types";

interface AuthModalProps {
  mode?: AuthModalMode;
  currentUser?: string | null;
  onClose: () => void;
  onAuthSuccess?: (user: string | null) => void;
}

/** GitHub device-flow sign-in (or "add another account"). */
export default function AuthModal({ mode = "signin", currentUser, onClose, onAuthSuccess }: AuthModalProps) {
  const t = useTranslator();
  const isAddAccount = mode === "add" || mode === "switch";
  const { state, retry } = useGhAuthFlow(onAuthSuccess);
  const handleRetry = () => void retry();

  const body = (flow: AuthFlowState) => {
    switch (flow.phase) {
      case "idle":
        return null;
      case "starting":
        return <StartingView t={t} />;
      case "code":
        return flow.code ? <CodeView t={t} code={flow.code} /> : null;
      case "success":
        return <SuccessView t={t} user={flow.user} />;
      case "error":
        return <ErrorView t={t} error={flow.error} output={flow.output} onRetry={handleRetry} onClose={onClose} />;
      case "cancelled":
        return <CancelledView t={t} onRetry={handleRetry} onClose={onClose} />;
      default: {
        const unreachable: never = flow;
        return unreachable;
      }
    }
  };

  return (
    <ModalShell
      onClose={onClose}
      width={420}
      panelStyle={{ boxShadow: "0 20px 60px rgba(0,0,0,0.5)", fontFamily: SYSTEM_FONT }}
      title={
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text-secondary)" }}>
          <GitHubIcon size={18} />
          <span style={{ fontSize: 14, fontWeight: 500 }}>
            {isAddAccount ? t("pm.addGithubAccount") : t("pm.signInGithub")}
          </span>
        </div>
      }
    >
      <div style={{ padding: "20px 22px", minHeight: 180 }}>
        {isAddAccount && currentUser && state.phase !== "success" && (
          <div style={{ fontSize: 12, color: "var(--text-subtle)", marginBottom: 14 }}>
            {t("pm.currentlySignedIn")}{" "}
            <span style={{ color: "var(--text-tertiary)", fontFamily: MONO_FONT }}>@{currentUser}</span>
          </div>
        )}
        {body(state)}
      </div>
    </ModalShell>
  );
}
