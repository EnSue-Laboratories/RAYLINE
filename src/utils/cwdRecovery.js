// Helpers for recovering a conversation's cwd when its working directory
// no longer exists on disk (e.g. the git worktree was promoted and removed,
// deleted manually, or the drive was unmounted).
//
// The recovery is global — any missing cwd triggers it, not just promotion —
// because the symptom (directory gone) is identical regardless of cause.

const WORKTREE_SEGMENT = "/.worktrees/";

// Given a directory path, return the main repo root if the path is a git
// worktree managed by RayLine's `/.worktrees/` convention. Otherwise return
// the input unchanged.
export function getMainRepoRoot(dir) {
  if (!dir) return dir;
  const wtIdx = dir.indexOf(WORKTREE_SEGMENT);
  return wtIdx !== -1 ? dir.slice(0, wtIdx) : dir;
}

// Pure resolver: pick a usable cwd given an `exists` predicate.
//
//   - If `cwd` exists, return it unchanged.
//   - Else if it looks like a worktree path, try the main repo root.
//   - Else fall back to `appCwd` if that exists.
//   - Otherwise return null; caller decides what to do.
//
// Returns { cwd, wasMissing, originalCwd, recoveryReason }.
// `recoveryReason` is one of "worktree-root" | "app-cwd" | "none" and is
// used to tailor the hidden reminder injected into the next prompt.
export function resolveSafeCwd({ cwd, appCwd, exists }) {
  if (!cwd) {
    return { cwd: cwd ?? null, wasMissing: false, originalCwd: cwd ?? null, recoveryReason: "none" };
  }
  if (exists(cwd)) {
    return { cwd, wasMissing: false, originalCwd: cwd, recoveryReason: "none" };
  }

  const root = getMainRepoRoot(cwd);
  if (root && root !== cwd && exists(root)) {
    return { cwd: root, wasMissing: true, originalCwd: cwd, recoveryReason: "worktree-root" };
  }
  if (appCwd && appCwd !== cwd && exists(appCwd)) {
    return { cwd: appCwd, wasMissing: true, originalCwd: cwd, recoveryReason: "app-cwd" };
  }
  return { cwd: null, wasMissing: true, originalCwd: cwd, recoveryReason: "none" };
}

// Build a hidden <system-reminder> block explaining that the chat's original
// working directory is gone and which directory we fell back to. Returns
// null when no reminder is warranted. The block is modeled on how Claude
// Code renders its own SessionStart reminders so the model treats it as
// system-origin context, not a user message.
export function buildMissingCwdReminder({ originalCwd, recoveredCwd, recoveryReason }) {
  if (!originalCwd) return null;
  let explanation;
  switch (recoveryReason) {
    case "worktree-root":
      explanation =
        `The original working directory \`${originalCwd}\` no longer exists. ` +
        `It was most likely a git worktree that has been promoted, merged, or removed. ` +
        `You are now operating on the project root \`${recoveredCwd}\`. ` +
        `Prior file paths under the worktree may still be valid (since the changes were merged in), ` +
        `but the chat is no longer on a feature-branch worktree — do not assume a separate branch context.`;
      break;
    case "app-cwd":
      explanation =
        `The original working directory \`${originalCwd}\` no longer exists and no matching project root was found. ` +
        `Falling back to the app-level working directory \`${recoveredCwd}\`. ` +
        `Treat earlier file paths with suspicion — they may no longer resolve.`;
      break;
    default:
      explanation =
        `The original working directory \`${originalCwd}\` no longer exists and no usable fallback was available. ` +
        `Tool calls that touch the filesystem will likely fail until the user picks a new folder.`;
  }
  return `<system-reminder>\n[cwd-recovery] ${explanation}\n</system-reminder>`;
}

// Prepend a reminder block to a prompt. Safe to call with null.
export function decoratePromptWithReminder(prompt, reminder) {
  if (!reminder) return prompt;
  const base = typeof prompt === "string" ? prompt : "";
  return `${reminder}\n\n${base}`;
}
