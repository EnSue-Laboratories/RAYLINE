/** Callbacks threaded from ChatArea through messages into interactive blocks. */
import type { Wallpaper } from "@shared/state/types";
import type { ValueControlCallbacks } from "../blocks/ValueControlCard";
import type { ControlChange } from "../blocks/valueControl";

export type { ControlChange };

/** Send `text` as the next user message (AskUserQuestion / ```control submit). */
export type AnswerHandler = (text: string) => void;

export type ControlChangeHandler = (change: ControlChange) => void;

/** Whether a ```control block may drive `target` (e.g. "fontSize"). */
export type CanControlTarget = (target: string) => boolean;

/** Edit the user message at `messageIndex` and resend. */
export type EditHandler = (messageIndex: number, text: string) => void;

/** App wallpaper (only `dataUrl` / `imgOpacity` matter here). */
export type WallpaperLike = Pick<Wallpaper, "dataUrl" | "imgOpacity">;

export type MessageCallbacks = ValueControlCallbacks;
