import { useTranslator } from "../../contexts/LocaleContext";
import { listMessageStyle, retryButtonStyle } from "../styles";

interface ListStatusProps {
  initialLoad: boolean;
  error: string | null;
  loadingText: string;
  emptyText: string;
  onRetry: () => void;
}

/** Placeholder for an empty issue / PR list: loading, error with retry, or "none found". */
export default function ListStatus({ initialLoad, error, loadingText, emptyText, onRetry }: ListStatusProps) {
  const t = useTranslator();
  if (initialLoad) {
    return <div style={{ ...listMessageStyle, color: "var(--text-muted)" }}>{loadingText}</div>;
  }

  if (error) {
    return (
      <div style={{ ...listMessageStyle, flexDirection: "column", gap: 12 }}>
        <span style={{ color: "var(--danger-text)", fontFamily: "var(--font-ui)", fontSize: 13 }}>{error}</span>
        <button onClick={onRetry} style={retryButtonStyle}>{t("pm.retry")}</button>
      </div>
    );
  }

  return <div style={{ ...listMessageStyle, color: "var(--text-disabled)" }}>{emptyText}</div>;
}
