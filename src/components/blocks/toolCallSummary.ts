/**
 * Pure helpers behind ToolCallBlock: the one-line header label/preview and
 * the incrementally revealed ARGS / RESULT bodies. Display text is redacted
 * (API keys, bearer tokens); stored tool data is never modified.
 */

import type { ToolPart } from "@shared/chat/types";

/** Characters of a body shown initially. */
export const BODY_PREVIEW_LIMIT = 2400;
/** Characters revealed per "show more" click. */
export const BODY_REVEAL_STEP = BODY_PREVIEW_LIMIT * 8;
/** Only this much of a command is scanned for the header preview. */
const PREVIEW_SCAN_LIMIT = 1024;

export type ToolSummaryInput = Pick<ToolPart, "name" | "args">;

export function truncate(str: string | null | undefined, max: number): string | null {
  if (!str) return null;
  return str.length > max ? str.slice(0, max) + "..." : str;
}

/** Mask API keys, bearer tokens and `key=…` secrets for display. */
export function redactSensitiveText(value: string): string;
export function redactSensitiveText(value: string | null | undefined): string | null | undefined;
export function redactSensitiveText(value: string | null | undefined): string | null | undefined {
  if (!value) return value;
  return value
    .replace(/sk-[A-Za-z0-9_-]{16,}/g, "[redacted-key]")
    .replace(/(Authorization\s*:\s*Bearer\s+)[A-Za-z0-9._~+/-]+/gi, "$1[redacted-token]")
    .replace(/((?:api[_-]?key|x-api-key|bearer_token|token|KEY)\s*[=:]\s*["']?)[A-Za-z0-9._~+/-]{16,}(["']?)/gi, "$1[redacted-secret]$2");
}

function stringArg(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" ? value : undefined;
}

/** "Command" for shell-ish tool names (Codex reports the command as the name). */
export function getToolLabel(tool: Partial<ToolSummaryInput> | null | undefined): string {
  const name = tool?.name;
  if (!name) return "Tool";
  const command = tool.args ? stringArg(tool.args, "command") : undefined;
  if (command && name === command) return "Command";
  if (
    name.startsWith("/")
    || name.startsWith("[bg] ")
    || name.startsWith("Execute `")
    || name.includes("\n")
    || name.includes(" -lc ")
    || name.includes(" --")
  ) {
    return "Command";
  }
  if (name.length > 80 && name.includes(":")) return truncate(redactSensitiveText(name.split(":")[0]), 30) ?? "Tool";
  if (name.length > 80) return "Tool";
  return name;
}

function lastPathSegments(path: string | undefined, count: number): string | null {
  if (path === undefined) return null;
  return path.split("/").slice(-count).join("/");
}

/** Short argument preview shown next to the tool name; null when none applies. */
export function getToolPreview(tool: ToolSummaryInput): string | null {
  const args = tool.args as unknown;
  if (!args || typeof args !== "object") return null;
  const a = tool.args;
  const str = (key: string) => stringArg(a, key);

  if (tool.name === "Bash") {
    let cmd = str("command")?.slice(0, PREVIEW_SCAN_LIMIT).replace(/\n/g, " ") || "";
    // Replace absolute/home paths with just the binary name
    cmd = cmd.replace(/(?:^|\s)[~/][\w.~/:-]+\/([\w.-]+)/g, (_match, bin: string) => " " + bin);
    return truncate(redactSensitiveText(cmd.trim()), 30);
  }
  const command = str("command");
  if (command) return truncate(redactSensitiveText(command.slice(0, PREVIEW_SCAN_LIMIT).replace(/\s+/g, " ").trim()), 48);

  switch (tool.name) {
    case "Read":
    case "Edit":
    case "NotebookEdit":
      return lastPathSegments(str("file_path"), 1);
    case "Write":
      return lastPathSegments(str("file_path"), 2);
    case "Grep":
      return truncate(redactSensitiveText(str("pattern") || str("query")), 25);
    case "Glob":
      return truncate(redactSensitiveText(str("pattern") || str("glob")), 25);
    case "Search":
      return truncate(redactSensitiveText(str("query") || str("pattern")), 25);
    case "Agent":
      return truncate(redactSensitiveText(str("description")), 30);
    case "WebSearch":
      return truncate(redactSensitiveText(str("query")), 30);
    case "WebFetch":
      return truncate(redactSensitiveText(str("url")), 30);
    case "Skill":
      return str("skill") || str("name") || null;
    case "LSP":
      return truncate(str("method") || str("action"), 25);
    default:
      return null;
  }
}

function fallbackString(value: unknown): string {
  switch (typeof value) {
    case "number":
    case "boolean":
    case "bigint":
      return String(value);
    case "symbol":
      return value.toString();
    default:
      return Object.prototype.toString.call(value);
  }
}

/**
 * Strings pass through; everything else is compact JSON (or `String(value)`
 * when it can't be serialized). Empty results are null.
 */
export function serializeToolValue(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value || null;
  let raw: string | undefined;
  try {
    // JSON.stringify returns undefined for functions/symbols.
    raw = JSON.stringify(value);
  } catch {
    raw = undefined;
  }
  raw ??= fallbackString(value);
  return raw || null;
}

export interface ToolBodyView {
  /** Redacted visible slice. */
  text: string;
  /** Body is longer than the initial preview (a toggle is shown). */
  isTrimmed: boolean;
  /** Characters not yet revealed. */
  remaining: number;
}

/** The redacted visible slice of a body and how much is still hidden. */
export function buildToolBodyView(serialized: string, visibleLimit: number): ToolBodyView {
  const remaining = Math.max(0, serialized.length - visibleLimit);
  return {
    text: redactSensitiveText(serialized.slice(0, visibleLimit)),
    isTrimmed: serialized.length > BODY_PREVIEW_LIMIT,
    remaining,
  };
}

/** Next visible limit for the toggle: reveal another step, or collapse when fully shown. */
export function nextVisibleLimit(serializedLength: number, visibleLimit: number): number {
  return serializedLength > visibleLimit ? visibleLimit + BODY_REVEAL_STEP : BODY_PREVIEW_LIMIT;
}
