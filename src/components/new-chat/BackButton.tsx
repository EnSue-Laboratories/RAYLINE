import { ArrowLeft } from "lucide-react";
import type { FontScale } from "../../contexts/FontSizeContext";

export interface BackButtonProps {
  onClick: () => void;
  disabled: boolean;
  label: string;
  hint: string;
  s: FontScale;
}

/** "Back · Esc to go back · Draft saved" under the new-chat sheet (#230). */
export default function BackButton({ onClick, disabled, label, hint, s }: BackButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap", maxWidth: "100%", gap: 6,
        padding: "6px 12px", background: "var(--control-bg)", border: "1px solid var(--control-border)", borderRadius: 7,
        color: "var(--text-secondary)", cursor: "pointer", fontSize: s(11),
      }}
    >
      <ArrowLeft size={13} />
      {label}
      <span style={{ color: "var(--text-muted)", fontSize: s(10) }}>{hint}</span>
    </button>
  );
}
