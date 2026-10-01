/**
 * Typed ipcRenderer helpers shared by the preloads. Bundled into each
 * preload by esbuild; only `electron` is required at runtime (sandbox-safe).
 */

import { ipcRenderer, type IpcRendererEvent } from "electron";
import type {
  EventChannel,
  EventPayload,
  EventSubscriber,
  InvokeArgs,
  InvokeChannel,
  InvokeResult,
  Invoker,
  SendChannel,
  Sender,
  SyncArgs,
  SyncChannel,
  SyncResult,
} from "@shared/ipc/contract";

export function invoke<K extends InvokeChannel>(channel: K, ...args: InvokeArgs<K>): Promise<InvokeResult<K>> {
  return ipcRenderer.invoke(channel, ...args) as Promise<InvokeResult<K>>;
}

/** Pass-through invoker: renderer arguments are forwarded exactly as given. */
export function invoker<K extends InvokeChannel>(channel: K): Invoker<K> {
  return (...args) => invoke(channel, ...args);
}

export function sender<K extends SendChannel>(channel: K): Sender<K> {
  return (...args) => {
    ipcRenderer.send(channel, ...args);
  };
}

export function syncSender<K extends SyncChannel>(channel: K): (...args: SyncArgs<K>) => SyncResult<K> {
  return (...args) => ipcRenderer.sendSync(channel, ...args) as SyncResult<K>;
}

export function subscriber<K extends EventChannel>(channel: K): EventSubscriber<K> {
  return (listener) => {
    const handler = (_event: IpcRendererEvent, payload: EventPayload<K>): void => listener(payload);
    ipcRenderer.on(channel, handler);
    return () => {
      ipcRenderer.removeListener(channel, handler);
    };
  };
}
