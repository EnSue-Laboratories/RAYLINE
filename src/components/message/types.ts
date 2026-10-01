/** Callbacks threaded from ChatArea through messages into interactive blocks. */

/** Send `text` as the next user message (AskUserQuestion / ```control submit). */
export type AnswerHandler = (text: string) => void;

/** A ```control block bound to an app setting changed its value. */
export interface ControlChange {
  target: string;
  value: unknown;
  label?: string;
  unit?: string;
  optionLabel?: string | null;
}

export type ControlChangeHandler = (change: ControlChange) => void;

/** Whether a ```control block may drive `target` (e.g. "fontSize"). */
export type CanControlTarget = (target: string) => boolean;

/** Edit the user message at `messageIndex` and resend. */
export type EditHandler = (messageIndex: number, text: string) => void;

/** Wallpaper settings (only `dataUrl` matters here: it switches surfaces). */
export interface WallpaperLike {
  dataUrl?: string | null;
  [key: string]: unknown;
}

export interface MessageCallbacks {
  onAnswer?: AnswerHandler;
  onControlChange?: ControlChangeHandler;
  canControlTarget?: CanControlTarget;
}
