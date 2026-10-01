/**
 * Shared SSH-remote preparation for Claude and Codex runs: upload the
 * attachments, open the RayLine SSH channel, and tear both down afterwards.
 */

import type { FileAttachment } from "@shared/chat/types";
import type { NormalizedRemoteRuntime, RemoteRuntimeProviderId } from "@shared/providers/types";
import { stageRemoteAttachments, type StagedRemoteAttachments } from "../../remote-attachments";
import { startRemoteChannel, type RemoteChannel } from "../../remote-channel";
import type { Logger } from "../../logger";
import type { ImageInput } from "./images";
import { errorMessage } from "./json";

/** Remote resources owned by one agent run (mutated as they are released). */
export interface RemoteRunResources {
  remoteAttachmentCleanup: (() => Promise<void>) | null;
  remoteChannel: RemoteChannel | null;
}

export function cleanupRemoteAttachments(resources: RemoteRunResources, log: Logger): void {
  const cleanup = resources.remoteAttachmentCleanup;
  if (!cleanup) return;
  resources.remoteAttachmentCleanup = null;
  cleanup().catch((err: unknown) => log("Remote attachment cleanup failed:", errorMessage(err)));
}

/** Stops uploads but keeps already-uploaded files downloadable for the TTL. */
export function finishRemoteChannel(resources: RemoteRunResources, log: Logger): void {
  const channel = resources.remoteChannel;
  if (!channel) return;
  resources.remoteChannel = null;
  channel.finish().catch((err: unknown) => log("Remote channel finish failed:", errorMessage(err)));
}

export function disposeRemoteChannel(resources: RemoteRunResources, log: Logger): void {
  const channel = resources.remoteChannel;
  if (!channel) return;
  resources.remoteChannel = null;
  channel.dispose().catch((err: unknown) => log("Remote channel dispose failed:", errorMessage(err)));
}

export interface PrepareRemoteRunOptions {
  remote: NormalizedRemoteRuntime;
  conversationId: string;
  provider: RemoteRuntimeProviderId;
  images: readonly ImageInput[] | null | undefined;
  files: readonly FileAttachment[] | null | undefined;
  resources: RemoteRunResources;
  /** False once the run was cancelled or replaced while we awaited. */
  isCurrent: () => boolean;
  log: Logger;
}

export type PrepareRemoteRunResult =
  | { kind: "ready"; staged: StagedRemoteAttachments | null }
  | { kind: "stale" }
  | { kind: "error"; error: string };

export async function prepareRemoteRun(options: PrepareRemoteRunOptions): Promise<PrepareRemoteRunResult> {
  const { remote, conversationId, provider, resources, isCurrent, log } = options;

  let staged: StagedRemoteAttachments | null;
  try {
    staged = await stageRemoteAttachments(remote, { images: options.images, files: options.files });
  } catch (err) {
    if (!isCurrent()) return { kind: "stale" };
    return { kind: "error", error: `Failed to upload attachments to the remote SSH host: ${errorMessage(err)}` };
  }
  if (!isCurrent()) {
    await staged?.cleanup().catch(() => {});
    return { kind: "stale" };
  }
  resources.remoteAttachmentCleanup = staged?.cleanup ?? null;

  try {
    resources.remoteChannel = await startRemoteChannel({ conversationId, provider });
    log("Started RayLine SSH channel:", resources.remoteChannel.describe());
  } catch (err) {
    log("RayLine SSH channel unavailable:", errorMessage(err));
    resources.remoteChannel = null;
  }

  if (!isCurrent()) {
    disposeRemoteChannel(resources, log);
    return { kind: "stale" };
  }
  return { kind: "ready", staged };
}
