/** Pure helpers for a conversation's Multica bindings (`_multica`, `_multicaSessions`). */

import type { Conversation } from "@shared/chat/types";
import type { MulticaContext } from "@shared/providers/types";

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

export function normalizeMulticaContext(context: unknown, fallbackAgentId = ""): MulticaContext | null {
  if (!context || typeof context !== "object") return null;
  const record = context as Record<string, unknown>;
  const agentId = readString(record, "agentId") || fallbackAgentId;
  const sessionId = readString(record, "sessionId");
  if (!agentId || !sessionId) return null;
  return {
    ...(record as Partial<MulticaContext>),
    agentId,
    sessionId,
    serverUrl: readString(record, "serverUrl"),
    workspaceId: readString(record, "workspaceId"),
    workspaceSlug: readString(record, "workspaceSlug"),
  };
}

export function getMulticaSessionContexts(conversation: Conversation | null | undefined): Record<string, MulticaContext> {
  const sessions: Record<string, MulticaContext> = {};
  const rawSessions = conversation?._multicaSessions;
  if (rawSessions && typeof rawSessions === "object") {
    for (const [agentId, context] of Object.entries(rawSessions)) {
      const normalized = normalizeMulticaContext(context, agentId);
      if (normalized) sessions[normalized.agentId] = normalized;
    }
  }
  const activeContext = normalizeMulticaContext(conversation?._multica);
  if (activeContext) sessions[activeContext.agentId] = activeContext;
  return sessions;
}

export function getMulticaContextForAgent(conversation: Conversation | null | undefined, agentId: string): MulticaContext | null {
  if (!agentId) return null;
  return getMulticaSessionContexts(conversation)[agentId] ?? null;
}

export function withMulticaContext(conversation: Conversation, context: MulticaContext): Conversation {
  if (!context.agentId || !context.sessionId) return conversation;
  return {
    ...conversation,
    _multica: context,
    _multicaSessions: {
      ...getMulticaSessionContexts(conversation),
      [context.agentId]: context,
    },
  };
}

export function normalizeMulticaCheckoutUrl(remoteUrl: string | null | undefined, remoteSlug: string | null | undefined): string {
  const slug = typeof remoteSlug === "string" ? remoteSlug.trim().replace(/\.git$/i, "") : "";
  if (slug) return `https://github.com/${slug}`;

  const raw = typeof remoteUrl === "string" ? remoteUrl.trim() : "";
  if (!raw) return "";

  const sshGitHub = /^git@github\.com:(.+?)(?:\.git)?$/i.exec(raw);
  if (sshGitHub?.[1]) return `https://github.com/${sshGitHub[1]}`;

  const httpsGitHub = /^https?:\/\/github\.com\/(.+?)(?:\.git)?$/i.exec(raw);
  if (httpsGitHub?.[1]) return `https://github.com/${httpsGitHub[1]}`;

  return raw.replace(/\.git$/i, "");
}

export interface MulticaSetupInput {
  remoteUrl: string;
  remoteSlug: string | null;
  branch: string;
  upstream: string;
  detached: boolean;
}

/** Declared git context prepended to the first prompt of a Multica session. */
export function buildMulticaSetupBlock({ remoteUrl, remoteSlug, branch, upstream, detached }: MulticaSetupInput): string | null {
  const checkoutUrl = normalizeMulticaCheckoutUrl(remoteUrl, remoteSlug);
  if (!checkoutUrl && !branch && !upstream) return null;

  const lines = ["<rayline-multica-setup>", "RayLine declared git context for this Multica chat."];
  if (checkoutUrl) lines.push(`Repository URL: ${checkoutUrl}`);
  if (remoteSlug) lines.push(`GitHub repository: ${remoteSlug}`);
  if (branch && !detached) lines.push(`Target branch: ${branch}`);
  if (upstream) lines.push(`Tracked upstream: ${upstream}`);
  if (detached) {
    lines.push("The local checkout that launched this chat was in detached HEAD state, so verify the correct branch before editing.");
  }
  lines.push("Use this as the intended git context for the conversation.");
  lines.push("Do not claim that this repo is currently checked out, or that you are on this branch, unless you verify that in your runtime.");
  lines.push("Do not quote this setup block back unless the user explicitly asks.");
  lines.push("</rayline-multica-setup>");
  return lines.join("\n");
}
