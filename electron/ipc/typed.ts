/**
 * Typed wrappers around ipcMain / webContents.send. Every main-process IPC
 * endpoint goes through these so channel names, argument tuples and results
 * are checked against shared/ipc/contract.ts.
 *
 * Arguments arrive from the renderer and are only as trustworthy as the
 * preload; handlers keep defensive checks where the shape matters.
 */

import { BrowserWindow, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent, type WebContents } from "electron";
import type {
  EventChannel,
  EventPayload,
  InvokeArgs,
  InvokeChannel,
  InvokeResult,
  SendArgs,
  SendChannel,
  SyncArgs,
  SyncChannel,
  SyncResult,
} from "@shared/ipc/contract";

export type TypedInvokeHandler<K extends InvokeChannel> = (
  event: IpcMainInvokeEvent,
  ...args: InvokeArgs<K>
) => InvokeResult<K> | Promise<InvokeResult<K>>;

export type TypedSendHandler<K extends SendChannel> = (event: IpcMainEvent, ...args: SendArgs<K>) => void;

export type TypedSyncHandler<K extends SyncChannel> = (event: IpcMainEvent, ...args: SyncArgs<K>) => SyncResult<K>;

/** `ipcMain.handle` for a contract invoke channel. */
export function handle<K extends InvokeChannel>(channel: K, handler: TypedInvokeHandler<NoInfer<K>>): void {
  ipcMain.handle(channel, (event, ...args: unknown[]) => handler(event, ...(args as InvokeArgs<K>)));
}

/** `ipcMain.on` for a fire-and-forget contract channel. */
export function on<K extends SendChannel>(channel: K, handler: TypedSendHandler<NoInfer<K>>): void {
  ipcMain.on(channel, (event, ...args: unknown[]) => {
    handler(event, ...(args as SendArgs<K>));
  });
}

/** `ipcMain.on` for a `sendSync` channel; the handler's result becomes `event.returnValue`. */
export function onSync<K extends SyncChannel>(channel: K, handler: TypedSyncHandler<NoInfer<K>>): void {
  ipcMain.on(channel, (event, ...args: unknown[]) => {
    const result: SyncResult<K> = handler(event, ...(args as SyncArgs<K>));
    event.returnValue = result;
  });
}

/** Sends an event to one renderer; no-op once it is destroyed. */
export function sendTo<K extends EventChannel>(webContents: WebContents, channel: K, payload: EventPayload<K>): void {
  if (webContents.isDestroyed()) return;
  webContents.send(channel, payload);
}

/** Sends an event to one window (if it still exists). */
export function sendToWindow<K extends EventChannel>(
  win: BrowserWindow | null | undefined,
  channel: K,
  payload: EventPayload<K>,
): void {
  if (!win || win.isDestroyed()) return;
  sendTo(win.webContents, channel, payload);
}

/** Sends an event to every open window. */
export function broadcast<K extends EventChannel>(channel: K, payload: EventPayload<K>): void {
  for (const win of BrowserWindow.getAllWindows()) {
    sendToWindow(win, channel, payload);
  }
}
