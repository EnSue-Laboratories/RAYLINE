/**
 * Pure helpers for Claude's `--permission-prompt-tool stdio` bridge:
 * turning a `can_use_tool` control request into the renderer prompt and
 * building the stdin control responses.
 */

import type {
  ClaudeCanUseToolRequest,
  ClaudePermissionDecision,
  ClaudeStdinControlResponse,
  ClaudeStdinUserMessage,
} from "@shared/agent/events";
import type { AgentPermissionRequest } from "@shared/chat/types";
import { readString } from "../common/json";

function firstTargetPath(input: Record<string, unknown>, blockedPath: string | null): string | null {
  return blockedPath || readString(input, "file_path") || readString(input, "path") || readString(input, "filePath") || null;
}

/** `${toolName}::${target}` — the "allow for this session" key. */
export function buildPermissionKey(toolName: string, input: Record<string, unknown>, blockedPath: string | null): string {
  const key = firstTargetPath(input, blockedPath) || readString(input, "command") || "";
  return `${toolName}::${key}`;
}

export function buildPermissionRequest(
  conversationId: string,
  requestId: string,
  request: ClaudeCanUseToolRequest,
): AgentPermissionRequest {
  const toolName = request.tool_name || "";
  const input = request.input ?? {};
  const blockedPath = request.blocked_path || null;
  const targetPath = firstTargetPath(input, blockedPath);

  let summary = "";
  if (targetPath) summary = targetPath;
  else if (toolName === "Bash" && typeof input.command === "string") summary = input.command;
  else summary = readString(input, "url") ?? "";

  return {
    conversationId,
    requestId,
    toolUseId: request.tool_use_id || null,
    toolName,
    input,
    blockedPath,
    description: request.description || null,
    permissionSuggestions: request.permission_suggestions || null,
    summary: summary || (toolName ? `${toolName} request` : "Tool request"),
    targetPath,
    isSensitiveFile: Boolean(blockedPath),
    allowKey: buildPermissionKey(toolName, input, blockedPath),
  };
}

export function buildControlResponse(requestId: string, decision: ClaudePermissionDecision): ClaudeStdinControlResponse {
  return { type: "control_response", response: { subtype: "success", request_id: requestId, response: decision } };
}

export function buildUserTurn(prompt: string): ClaudeStdinUserMessage {
  return { type: "user", message: { role: "user", content: prompt } };
}
