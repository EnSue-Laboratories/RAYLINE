import { createContext, useCallback, useContext } from "react";

export const FontSizeContext = createContext(15);

/** Scale a px value proportionally to the current font size setting. */
export function useFontScale() {
  const fontSize = useContext(FontSizeContext);
  return useCallback((px) => px * fontSize / 15, [fontSize]);
}
