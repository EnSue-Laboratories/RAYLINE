import type { CSSProperties } from "react";

const dot = (delay: string): CSSProperties => ({
  width: 5,
  height: 5,
  borderRadius: "50%",
  background: "var(--loading-dot-bg)",
  display: "inline-block",
  animation: `dotPulse 1.2s ease-in-out ${delay} infinite`,
});

export default function DispatchLoadingDots({ ariaLabel }: { ariaLabel?: string }) {
  return (
    <span aria-label={ariaLabel || "Dispatching"} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "0 2px" }}>
      <span style={dot("0s")} />
      <span style={dot("0.16s")} />
      <span style={dot("0.32s")} />
    </span>
  );
}
