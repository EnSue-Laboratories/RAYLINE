import type { ReactNode } from "react";
import type { FontScale } from "../sidebar/types";

export type SquareButtonTone = "danger" | "positive" | "neutral";

const TONES: Record<SquareButtonTone, { background: string; color: string }> = {
  danger: { background: "var(--danger-soft-bg)", color: "var(--danger-soft-text)" },
  positive: { background: "var(--badge-open-bg)", color: "var(--badge-open-text)" },
  neutral: {
    background: "color-mix(in srgb, var(--control-bg) 50%, transparent)",
    color: "color-mix(in srgb, var(--text-primary) 33%, transparent)",
  },
};

/** 24px confirm / cancel button used in the branch menu's inline prompts. */
export function SquareIconButton({
  tone,
  onClick,
  disabled = false,
  ariaLabel,
  dimmed = false,
  children,
}: {
  tone: SquareButtonTone;
  onClick: () => void;
  disabled?: boolean;
  ariaLabel?: string;
  /** Busy look (0.8 opacity) for the positive confirm. */
  dimmed?: boolean;
  children: ReactNode;
}) {
  const { background, color } = TONES[tone];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 24,
        height: 24,
        borderRadius: 6,
        background,
        border: "none",
        color,
        cursor: disabled ? "default" : "pointer",
        ...(dimmed ? { opacity: 0.8 } : null),
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

/** Small mono caption (empty lists, lock hint). */
export function MenuNote({ s, children, padding = "10px 12px", letterSpacing }: {
  s: FontScale;
  children: ReactNode;
  padding?: string;
  letterSpacing?: string;
}) {
  return (
    <div
      style={{
        padding,
        fontSize: s(9),
        fontFamily: "var(--font-mono)",
        color: "color-mix(in srgb, var(--text-primary) 27%, transparent)",
        ...(letterSpacing ? { letterSpacing } : null),
      }}
    >
      {children}
    </div>
  );
}

/** One-line ellipsized prompt text inside a confirm row. */
export function PromptText({ s, color, children }: { s: FontScale; color: string; children: ReactNode }) {
  return (
    <span
      style={{
        fontSize: s(10),
        fontFamily: "var(--font-mono)",
        color,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

export const ROW_HOVER_BG = "color-mix(in srgb, var(--control-bg) 63%, transparent)";
export const TEXT_MUTED = "color-mix(in srgb, var(--text-primary) 43%, transparent)";
export const TEXT_LOCKED = "color-mix(in srgb, var(--text-primary) 16%, transparent)";
