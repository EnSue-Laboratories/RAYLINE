import { mkdir, mkdtemp, realpath, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { SessionRoots } from "../session-index";

export interface FixtureRoots extends SessionRoots {
  root: string;
  cleanup: () => Promise<void>;
}

export async function makeRoots(): Promise<FixtureRoots> {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "rl-sessions-")));
  const claudeDir = path.join(root, ".claude");
  const codexDir = path.join(root, ".codex");
  await mkdir(path.join(claudeDir, "projects"), { recursive: true });
  await mkdir(path.join(codexDir, "sessions"), { recursive: true });
  return { root, claudeDir, codexDir, cleanup: () => rm(root, { recursive: true, force: true }) };
}

export function jsonl(events: readonly unknown[]): string {
  return `${events.map((e) => JSON.stringify(e)).join("\n")}\n`;
}

export async function writeJsonl(filePath: string, events: readonly unknown[], mtimeMs?: number): Promise<string> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, jsonl(events));
  if (mtimeMs !== undefined) await utimes(filePath, mtimeMs / 1000, mtimeMs / 1000);
  return filePath;
}

export function claudeSessionPath(roots: SessionRoots, projectDir: string, sessionId: string): string {
  return path.join(roots.claudeDir, "projects", projectDir, `${sessionId}.jsonl`);
}

export function codexRolloutPath(roots: SessionRoots, threadId: string, day = "2026/09/30"): string {
  return path.join(roots.codexDir, "sessions", day, `rollout-2026-09-30T10-00-00-${threadId}.jsonl`);
}

export const user = (text: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  type: "user",
  message: { role: "user", content: text },
  ...extra,
});

export const assistant = (content: unknown[], extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  type: "assistant",
  message: { role: "assistant", content },
  ...extra,
});

export const toolResult = (toolUseId: string, content: unknown): Record<string, unknown> => ({
  type: "user",
  message: { role: "user", content: [{ type: "tool_result", tool_use_id: toolUseId, content }] },
});

export const codexMeta = (id: string, cwd: string): Record<string, unknown> => ({
  type: "session_meta",
  payload: { id, cwd },
});

export const codexUser = (text: string): Record<string, unknown> => ({
  type: "response_item",
  payload: { type: "message", role: "user", content: [{ type: "input_text", text }] },
});

export const codexAssistant = (text: string): Record<string, unknown> => ({
  type: "response_item",
  payload: { type: "message", role: "assistant", content: [{ type: "output_text", text }] },
});
