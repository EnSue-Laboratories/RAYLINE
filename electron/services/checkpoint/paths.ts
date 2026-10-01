/**
 * Which untracked paths a checkpoint captures: small source/text files only.
 * Generated, binary and dependency directories are preserved in place
 * instead of being restaged on every checkpoint.
 */

import { stat } from "node:fs/promises";
import path from "node:path";

export const MAX_CAPTURED_UNTRACKED_FILE_BYTES = 512 * 1024;

const SKIPPED_UNTRACKED_DIR_NAMES = new Set([
  ".build", ".cache", ".claude", ".next", ".nuxt", ".perch", ".svelte-kit", ".turbo",
  "DerivedData", "Pods", "build", "coverage", "dist", "node_modules", "release", "sessions",
]);
const SKIPPED_UNTRACKED_DIR_PREFIXES = [".codex", ".codex-source-packages"];
const CAPTURED_TEXT_BASENAMES = new Set([
  ".env", ".env.example", ".env.local", ".gitignore", ".npmrc", ".prettierignore",
  "AGENTS.md", "Brewfile", "CLAUDE.md", "Dockerfile", "Gemfile", "Makefile", "Podfile", "README", "README.md",
]);
const CAPTURED_TEXT_EXTENSIONS = new Set([
  ".bash", ".c", ".cc", ".cfg", ".conf", ".cpp", ".cs", ".css", ".cjs", ".go", ".graphql", ".h", ".hpp",
  ".html", ".ini", ".java", ".js", ".json", ".json5", ".jsonc", ".jsonl", ".jsx", ".kt", ".less", ".m",
  ".md", ".mdx", ".mm", ".mjs", ".php", ".plist", ".proto", ".py", ".rb", ".rs", ".sass", ".scss", ".sh",
  ".sql", ".strings", ".swift", ".toml", ".ts", ".tsx", ".txt", ".xcconfig", ".xcstrings", ".xml",
  ".yaml", ".yml", ".zsh",
]);
const SKIPPED_BINARY_EXTENSIONS = new Set([
  ".7z", ".a", ".app", ".avi", ".bin", ".bmp", ".class", ".dmg", ".dylib", ".ear", ".eot", ".exe", ".gif",
  ".gz", ".heic", ".ico", ".jar", ".jpeg", ".jpg", ".m4a", ".mov", ".mp3", ".mp4", ".o", ".otf", ".pdf",
  ".png", ".pyc", ".so", ".svg", ".tar", ".tif", ".tiff", ".ttf", ".war", ".wav", ".webm", ".webp",
  ".woff", ".woff2", ".xz", ".zip",
]);

export function splitNullTerminated(stdout: string): string[] {
  return stdout ? stdout.split("\0").filter(Boolean) : [];
}

/** `??`-prefixed entries of `git status --porcelain=v1 -z`. */
export function parseUntrackedPaths(stdout: string): string[] {
  return splitNullTerminated(stdout)
    .filter((entry) => entry.startsWith("?? "))
    .map((entry) => entry.slice(3));
}

export function normalizeUntrackedPath(relPath: string): string {
  return relPath.endsWith("/") ? relPath.slice(0, -1) : relPath;
}

function pathSegments(relPath: string): string[] {
  return normalizeUntrackedPath(relPath).split("/").filter(Boolean);
}

export function shouldSkipUntrackedDir(rootPath: string): boolean {
  return pathSegments(rootPath).some(
    (segment) =>
      SKIPPED_UNTRACKED_DIR_NAMES.has(segment) ||
      SKIPPED_UNTRACKED_DIR_PREFIXES.some((prefix) => segment === prefix || segment.startsWith(`${prefix}-`)),
  );
}

export function looksLikeCapturedTextPath(relPath: string): boolean {
  const baseName = path.basename(normalizeUntrackedPath(relPath));
  if (CAPTURED_TEXT_BASENAMES.has(baseName)) return true;
  const extension = path.extname(baseName).toLowerCase();
  if (!extension || SKIPPED_BINARY_EXTENSIONS.has(extension)) return false;
  return CAPTURED_TEXT_EXTENSIONS.has(extension);
}

/** Name-based filter (cheap, no I/O). */
export function isCaptureCandidate(relPath: string): boolean {
  const normalized = normalizeUntrackedPath(relPath);
  return !shouldSkipUntrackedDir(path.dirname(normalized)) && looksLikeCapturedTextPath(normalized);
}

export async function shouldCaptureUntrackedFile(repoRoot: string, relPath: string): Promise<boolean> {
  if (!isCaptureCandidate(relPath)) return false;
  try {
    const fileStat = await stat(path.join(repoRoot, normalizeUntrackedPath(relPath)));
    return fileStat.isFile() && fileStat.size <= MAX_CAPTURED_UNTRACKED_FILE_BYTES;
  } catch {
    return false;
  }
}
