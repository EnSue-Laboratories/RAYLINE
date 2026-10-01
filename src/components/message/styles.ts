import type { CSSProperties } from "react";

/** Off-screen messages skip layout / paint (React and parse work is windowed separately). */
export const MESSAGE_ROOT_STYLE: CSSProperties = {
  contentVisibility: "auto",
  containIntrinsicSize: "180px",
};
