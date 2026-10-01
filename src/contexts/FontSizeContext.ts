import { createContext, useCallback, useContext } from "react";

/** Base UI font size in px; `useFontScale` scales relative to this. */
export const BASE_FONT_SIZE = 15;

/** Holds a primitive (the font size in px), so consumers re-render only when it changes. */
export const FontSizeContext = createContext<number>(BASE_FONT_SIZE);

export type FontScale = (px: number) => number;

/** Scale a px value proportionally to the current font size setting. */
export function useFontScale(): FontScale {
  const fontSize = useContext(FontSizeContext);
  return useCallback((px: number) => (px * fontSize) / BASE_FONT_SIZE, [fontSize]);
}
