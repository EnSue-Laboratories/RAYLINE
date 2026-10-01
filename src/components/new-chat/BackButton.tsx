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
  // A quiet mono hint (like the composer's "ENTER TO SEND // …" line), not a pill.
  return (
    <button
      type="button"
      className="newchat-back"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap", maxWidth: "100%", gap: 6,
        padding: "4px 8px", background: "transparent", border: 0, borderRadius: 6,
        color: "var(--text-muted)", cursor: disabled ? "default" : "pointer",
        fontSize: s(9), fontFamily: "var(--font-mono)", letterSpacing: ".1em", textTransform: "uppercase",
        transition: "color .15s",
      }}
    >
      <ArrowLeft size={11} strokeWidth={2} />
      {/* The hint already says "go back"; `label` stays as the accessible name. */}
      <span>{hint}</span>
    </button>
  );
}
