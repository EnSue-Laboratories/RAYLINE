#!/usr/bin/env node
// Smoke test for src/utils/cwdRecovery.js. No test runner is configured in
// this repo, so this script asserts invariants directly. Run with:
//   node scripts/smoke-cwd-recovery.mjs
//
// Exits non-zero on any failure.

import {
  getMainRepoRoot,
  resolveSafeCwd,
  buildMissingCwdReminder,
  decoratePromptWithReminder,
} from "../src/utils/cwdRecovery.js";

let failures = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

console.log("getMainRepoRoot:");
check("returns input when no worktree segment", getMainRepoRoot("/repo/foo") === "/repo/foo");
check("strips /.worktrees/<name> suffix", getMainRepoRoot("/repo/foo/.worktrees/wt-x") === "/repo/foo");
check("handles null", getMainRepoRoot(null) === null);
check("handles undefined", getMainRepoRoot(undefined) === undefined);
check("handles empty string", getMainRepoRoot("") === "");

console.log("\nresolveSafeCwd:");
{
  const existing = new Set(["/repo/foo", "/repo/foo/.worktrees/wt-x", "/app/cwd"]);
  const exists = (p) => existing.has(p);

  check(
    "happy path — cwd exists, no recovery",
    eq(
      resolveSafeCwd({ cwd: "/repo/foo/.worktrees/wt-x", appCwd: "/app/cwd", exists }),
      { cwd: "/repo/foo/.worktrees/wt-x", wasMissing: false, originalCwd: "/repo/foo/.worktrees/wt-x", recoveryReason: "none" }
    )
  );

  const gone = new Set(["/repo/foo", "/app/cwd"]); // worktree removed
  const existsGone = (p) => gone.has(p);
  check(
    "worktree gone — falls back to project root",
    eq(
      resolveSafeCwd({ cwd: "/repo/foo/.worktrees/wt-x", appCwd: "/app/cwd", exists: existsGone }),
      { cwd: "/repo/foo", wasMissing: true, originalCwd: "/repo/foo/.worktrees/wt-x", recoveryReason: "worktree-root" }
    )
  );

  const onlyApp = new Set(["/app/cwd"]);
  const existsOnlyApp = (p) => onlyApp.has(p);
  check(
    "worktree + root both gone — falls back to app cwd",
    eq(
      resolveSafeCwd({ cwd: "/repo/foo/.worktrees/wt-x", appCwd: "/app/cwd", exists: existsOnlyApp }),
      { cwd: "/app/cwd", wasMissing: true, originalCwd: "/repo/foo/.worktrees/wt-x", recoveryReason: "app-cwd" }
    )
  );

  const nothing = new Set();
  const existsNone = (p) => nothing.has(p);
  check(
    "everything gone — returns null cwd",
    eq(
      resolveSafeCwd({ cwd: "/repo/foo/.worktrees/wt-x", appCwd: "/app/cwd", exists: existsNone }),
      { cwd: null, wasMissing: true, originalCwd: "/repo/foo/.worktrees/wt-x", recoveryReason: "none" }
    )
  );

  check(
    "non-worktree path gone — skips to app cwd",
    eq(
      resolveSafeCwd({ cwd: "/random/dir", appCwd: "/app/cwd", exists: (p) => p === "/app/cwd" }),
      { cwd: "/app/cwd", wasMissing: true, originalCwd: "/random/dir", recoveryReason: "app-cwd" }
    )
  );

  check(
    "null cwd — returns unchanged, not flagged missing",
    eq(
      resolveSafeCwd({ cwd: null, appCwd: "/app/cwd", exists }),
      { cwd: null, wasMissing: false, originalCwd: null, recoveryReason: "none" }
    )
  );

  check(
    "same appCwd and cwd (non-worktree) that's missing — null",
    eq(
      resolveSafeCwd({ cwd: "/gone", appCwd: "/gone", exists: () => false }),
      { cwd: null, wasMissing: true, originalCwd: "/gone", recoveryReason: "none" }
    )
  );
}

console.log("\nbuildMissingCwdReminder:");
{
  const r1 = buildMissingCwdReminder({ originalCwd: "/a/.worktrees/x", recoveredCwd: "/a", recoveryReason: "worktree-root" });
  check("worktree-root reminder includes <system-reminder> wrapper", r1?.startsWith("<system-reminder>"));
  check("worktree-root reminder names original + recovered paths", r1?.includes("/a/.worktrees/x") && r1?.includes("/a"));
  check("worktree-root reminder has cwd-recovery tag", r1?.includes("[cwd-recovery]"));

  const r2 = buildMissingCwdReminder({ originalCwd: "/gone", recoveredCwd: "/app", recoveryReason: "app-cwd" });
  check("app-cwd reminder mentions fallback", r2?.includes("app-level working directory"));

  const r3 = buildMissingCwdReminder({ originalCwd: "/gone", recoveredCwd: null, recoveryReason: "none" });
  check("no-fallback reminder is still generated", typeof r3 === "string" && r3.includes("no usable fallback"));

  const r4 = buildMissingCwdReminder({ originalCwd: null, recoveredCwd: "/a", recoveryReason: "worktree-root" });
  check("null original cwd returns null reminder", r4 === null);
}

console.log("\ndecoratePromptWithReminder:");
{
  check("null reminder returns prompt unchanged", decoratePromptWithReminder("hello", null) === "hello");
  const wrapped = decoratePromptWithReminder("hello", "<system-reminder>X</system-reminder>");
  check("prepends reminder above prompt", wrapped.startsWith("<system-reminder>") && wrapped.endsWith("hello"));
  check("handles null prompt", decoratePromptWithReminder(null, "<system-reminder>X</system-reminder>").endsWith("\n\n"));
}

console.log(`\n${failures === 0 ? "ALL OK" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
