/**
 * Typed views of still-unconverted modules used by the Project Manager
 * window. Drop each cast once the owning package converts the module.
 */
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import UntypedHoverIconButton from "../components/HoverIconButton";

export interface HoverIconButtonProps {
  tooltip?: string;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  baseColor?: string;
  hoverColor?: string;
  ariaLabel?: string;
  disabled?: boolean;
}

// TODO(ts-boundary): drop once components/HoverIconButton is converted.
export const HoverIconButton = UntypedHoverIconButton as (props: HoverIconButtonProps) => ReactNode;
