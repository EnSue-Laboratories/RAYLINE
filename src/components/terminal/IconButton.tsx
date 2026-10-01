import type { ReactNode } from "react";
import type { CSSProperties } from "react";
import { NO_DRAG } from "../sidebar/appRegion";
import { useHoverStyle } from "./useHoverStyle";

const iconBtnStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 24,
  height: 24,
  borderRadius: 6,
  background: "var(--bg-tertiary)",
  border: "1px solid var(--border)",
  color: "var(--text-muted)",
  cursor: "pointer",
  flexShrink: 0,
  ...NO_DRAG,
  transition: "background .15s, color .15s",
};

const iconBtnHoverStyle = {
  background: "var(--hover-overlay)",
  color: "var(--text-primary)",
};

interface IconButtonProps {
  onClick?: () => void;
  title: string;
  children: ReactNode;
}

export default function IconButton({ onClick, title, children }: IconButtonProps) {
  const hover = useHoverStyle(iconBtnStyle, iconBtnHoverStyle);
  return (
    <button onClick={onClick} title={title} {...hover}>
      {children}
    </button>
  );
}
