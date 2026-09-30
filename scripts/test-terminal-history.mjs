import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import path from "node:path";
const run = promisify(execFile);

for (const custom of [false, true]) {
  test(`zsh history stays outside bundled resources${custom ? " and preserves user overrides" : ""}`, { skip: process.platform !== "darwin" }, async t => {
    const dir = await mkdtemp(path.join(tmpdir(), "rayline-history-"));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const rc = path.join(dir, ".zshrc");
    await writeFile(rc, custom ? 'HISTFILE="$ZDOTDIR/custom-history"\n' : "# isolated user shell configuration\n");
    const { stdout } = await run("/bin/zsh", ["-i", "-c", 'print -r -- "RAYLINE_HISTORY=$HISTFILE"'], {
      env: { ...process.env, ZDOTDIR: path.resolve("electron/shell-init/zsh"), RAYLINE_ORIG_ZDOTDIR: dir, RAYLINE_ORIG_ZSHRC: rc, XDG_CACHE_HOME: dir },
      timeout: 10000,
    });
    assert.ok(stdout.includes(`RAYLINE_HISTORY=${path.join(dir, custom ? "custom-history" : ".zsh_history")}`));
    assert.ok(!stdout.includes(path.resolve("electron/shell-init/zsh")));
  });
}
