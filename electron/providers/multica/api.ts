/**
 * Multica REST endpoints (auth, workspace discovery, agents, chat sessions,
 * tasks), typed against shared/providers. Responses come from a remote
 * server, so they are shape-checked before being returned.
 */

import type {
  MulticaAgent,
  MulticaAuthedArgs,
  MulticaChatSession,
  MulticaEnsureSessionArgs,
  MulticaListMessagesResult,
  MulticaListWorkspacesResult,
  MulticaSendCodeArgs,
  MulticaSendMessageArgs,
  MulticaSendMessageResult,
  MulticaSessionArgs,
  MulticaVerifyCodeArgs,
  MulticaVerifyCodeResult,
  MulticaWorkspaceArgs,
} from "@shared/providers/types";
import { isRecord, readString } from "../common/json";
import { httpStatusOf, multicaRequest, type MulticaAuth } from "./rest";

function auth(args: MulticaWorkspaceArgs): MulticaAuth {
  return { serverUrl: args.serverUrl, token: args.token, workspaceId: args.workspaceId, workspaceSlug: args.workspaceSlug };
}

function invalid(what: string): Error {
  return new Error(`multica ${what}: unexpected response shape`);
}

/** Records with a string id; a missing name falls back to the id. */
function toAgents(value: unknown): MulticaAgent[] {
  if (!Array.isArray(value)) return [];
  const agents: MulticaAgent[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.id !== "string") continue;
    agents.push({ ...entry, id: entry.id, name: typeof entry.name === "string" ? entry.name : entry.id });
  }
  return agents;
}

function isWorkspaceList(value: unknown): value is MulticaListWorkspacesResult {
  return Array.isArray(value) || (isRecord(value) && (value.workspaces === undefined || Array.isArray(value.workspaces)));
}

function isMessageList(value: unknown): value is MulticaListMessagesResult {
  if (Array.isArray(value)) return true;
  return isRecord(value) && (value.messages === undefined || Array.isArray(value.messages)) && (value.data === undefined || Array.isArray(value.data));
}

export function multicaSendCode({ serverUrl, email }: MulticaSendCodeArgs): Promise<unknown> {
  return multicaRequest({ serverUrl, method: "POST", path: "/auth/send-code", body: { email } });
}

export async function multicaVerifyCode({ serverUrl, email, code }: MulticaVerifyCodeArgs): Promise<MulticaVerifyCodeResult> {
  const res = await multicaRequest({ serverUrl, method: "POST", path: "/auth/verify-code", body: { email, code } });
  const token = readString(res, "token");
  if (!token) throw new Error("multica verify-code: no token in response");
  const user = isRecord(res) && isRecord(res.user) && typeof res.user.id === "string" ? { ...res.user, id: res.user.id } : undefined;
  return user ? { token, user } : { token };
}

export async function multicaListWorkspaces({ serverUrl, token }: MulticaAuthedArgs): Promise<MulticaListWorkspacesResult> {
  const res = await multicaRequest({ serverUrl, method: "GET", path: "/api/workspaces", token });
  if (!isWorkspaceList(res)) throw invalid("list-workspaces");
  return res;
}

export async function multicaListAgents(args: MulticaWorkspaceArgs): Promise<MulticaAgent[]> {
  return toAgents(await multicaRequest({ ...auth(args), method: "GET", path: "/api/agents" }));
}

export async function multicaEnsureSession(args: MulticaEnsureSessionArgs): Promise<MulticaChatSession> {
  const res = await multicaRequest({
    ...auth(args),
    method: "POST",
    path: "/api/chat/sessions",
    body: { agent_id: args.agentId, title: args.title || "RayLine chat" },
  });
  const id = readString(res, "id");
  if (!isRecord(res) || !id) throw invalid("ensure-session");
  return { ...res, id };
}

export async function multicaSendMessage(args: MulticaSendMessageArgs): Promise<MulticaSendMessageResult> {
  const res = await multicaRequest({
    ...auth(args),
    method: "POST",
    path: `/api/chat/sessions/${args.sessionId}/messages`,
    body: { content: args.content },
  });
  const taskId = readString(res, "task_id");
  return taskId ? { task_id: taskId } : {};
}

export async function multicaListMessages(args: MulticaSessionArgs): Promise<MulticaListMessagesResult> {
  const res = await multicaRequest({ ...auth(args), method: "GET", path: `/api/chat/sessions/${args.sessionId}/messages` });
  if (!isMessageList(res)) throw invalid("list-messages");
  return res;
}

/** In-flight task for a chat session, or null (404 = none). */
export async function multicaGetPendingTaskId(args: MulticaSessionArgs): Promise<string | null> {
  try {
    const res = await multicaRequest({ ...auth(args), method: "GET", path: `/api/chat/sessions/${args.sessionId}/pending-task` });
    return readString(res, "task_id") || null;
  } catch (err) {
    if (httpStatusOf(err) === 404) return null;
    throw err;
  }
}

/** True when the server accepted the cancel; false when the task is already gone (404 / 409). */
export async function multicaCancelTask(args: MulticaWorkspaceArgs & { taskId: string }): Promise<boolean> {
  try {
    await multicaRequest({ ...auth(args), method: "POST", path: `/api/tasks/${args.taskId}/cancel` });
    return true;
  } catch (err) {
    const status = httpStatusOf(err);
    if (status === 404 || status === 409) return false;
    throw err;
  }
}
