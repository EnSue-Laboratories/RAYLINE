import type { CSSProperties, MouseEvent } from "react";

export interface HoverStyleProps {
  style: CSSProperties;
  onMouseEnter: (event: MouseEvent<HTMLElement>) => void;
  onMouseLeave: (event: MouseEvent<HTMLElement>) => void;
}

/**
 * Imperative hover styling (no re-render on hover): applies `hoverStyle` on
 * enter and restores each hovered key from `baseStyle` on leave.
 */
export function useHoverStyle(baseStyle: CSSProperties, hoverStyle: CSSProperties): HoverStyleProps {
  return {
    style: baseStyle,
    onMouseEnter(event) {
      Object.assign(event.currentTarget.style, hoverStyle);
    },
    onMouseLeave(event) {
      const target = event.currentTarget.style;
      for (const key of Object.keys(hoverStyle)) {
        const base = (baseStyle as Record<string, unknown>)[key];
        target.setProperty(toCssProperty(key), typeof base === "string" || typeof base === "number" ? String(base) : "");
      }
    },
  };
}

function toCssProperty(key: string): string {
  return key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}
