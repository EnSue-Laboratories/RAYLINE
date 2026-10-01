// Ported from PR #230 (scripts/test-terminal-history.mjs): the zsh bootstrap
// must restore the user's HISTFILE so terminal history never lands inside the
// signed app bundle, while explicit user overrides stay effective.
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const run = promisify(execFile);
const ZSH_INIT_DIR = fileURLToPath(new URL("../../../shell-init/zsh", import.meta.url));
const hasZsh = process.platform === "darwin";

describe.skipIf(!hasZsh)("zsh bootstrap history path", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  for (const custom of [false, true]) {
    it(`keeps history outside bundled resources${custom ? " and preserves user overrides" : ""}`, async () => {
      const dir = await mkdtemp(path.join(tmpdir(), "rayline-history-"));
      dirs.push(dir);
      const rc = path.join(dir, ".zshrc");
      await writeFile(rc, custom ? 'HISTFILE="$ZDOTDIR/custom-history"\n' : "# isolated user shell configuration\n");
      const { stdout } = await run("/bin/zsh", ["-i", "-c", 'print -r -- "RAYLINE_HISTORY=$HISTFILE"'], {
        env: {
          ...process.env,
          ZDOTDIR: ZSH_INIT_DIR,
          RAYLINE_ORIG_ZDOTDIR: dir,
          RAYLINE_ORIG_ZSHRC: rc,
          XDG_CACHE_HOME: dir,
        },
        timeout: 10_000,
      });
      expect(stdout).toContain(`RAYLINE_HISTORY=${path.join(dir, custom ? "custom-history" : ".zsh_history")}`);
      expect(stdout).not.toContain(ZSH_INIT_DIR);
    });
  }
});
