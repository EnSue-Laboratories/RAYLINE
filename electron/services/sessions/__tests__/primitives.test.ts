import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { codexThreadIdFromFileName, cleanCodexUserMessage } from "../codex";
import { createLimiter } from "../limiter";
import { forEachHeadLineSync, readHeadLines } from "../lines";
import { cwdFromProjectDir, cwdFromProjectDirSync, projectDirName } from "../project-dir";
import { SearchTextCache } from "../search";
import { SessionIndex } from "../session-index";
import { claudeSessionPath, codexRolloutPath, makeRoots, user, writeJsonl, type FixtureRoots } from "./fixtures";

let roots: FixtureRoots;
beforeEach(async () => {
  roots = await makeRoots();
});
afterEach(async () => {
  await roots.cleanup();
});

describe("line readers", () => {
  it("stop after the requested number of lines, across chunk boundaries", async () => {
    const file = path.join(roots.root, "big.jsonl");
    const long = "x".repeat(100 * 1024); // longer than one sync chunk
    await writeFile(file, ["a", long, "c", "d", "e"].join("\n"));

    expect(await readHeadLines(file, 3)).toEqual(["a", long, "c"]);
    const seen: string[] = [];
    forEachHeadLineSync(file, 10, (line) => {
      seen.push(line);
      return line !== "d";
    });
    expect(seen).toEqual(["a", long, "c", "d"]);

    const capped: string[] = [];
    forEachHeadLineSync(file, 2, (line) => {
      capped.push(line);
    });
    expect(capped).toHaveLength(2);
  });

  it("rejects for missing files", async () => {
    await expect(readHeadLines(path.join(roots.root, "missing"), 1)).rejects.toThrow();
  });
});

describe("project dirs", () => {
  it("encodes cwd like the Claude CLI", () => {
    expect(projectDirName("/Users/kira/app", "darwin")).toBe("-Users-kira-app");
    expect(projectDirName("C:\\Users\\kira\\Documents", "win32")).toBe("C--Users-kira-Documents");
  });

  it("decodes dashed directory names by walking the filesystem", async () => {
    const real = path.join(roots.root, "my-project", "sub-dir");
    await mkdir(real, { recursive: true });
    const encoded = projectDirName(real, "darwin");
    await expect(cwdFromProjectDir(encoded)).resolves.toBe(real);
    expect(cwdFromProjectDirSync(encoded)).toBe(real);
    expect(cwdFromProjectDirSync("-definitely-not-here-xyz")).toBe("/definitely/not/here/xyz");
    expect(cwdFromProjectDirSync("relative")).toBe("relative");
  });
});

describe("codex helpers", () => {
  it("extracts the thread id from rollout file names", () => {
    expect(codexThreadIdFromFileName("rollout-2026-09-30T10-00-00-0199A1B2-c3d4-7e5f-8a9b-0c1d2e3f4a5b.jsonl")).toBe(
      "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b",
    );
    expect(codexThreadIdFromFileName("notes.jsonl")).toBeNull();
  });

  it("cleans injected context and image preambles from user prompts", () => {
    expect(cleanCodexUserMessage('<image name="a"></image> System context for this run:\nX\n--- USER PROMPT ---\nHi')).toBe("Hi");
    expect(cleanCodexUserMessage("<environment_context>x</environment_context>")).toBe("");
  });
});

describe("SearchTextCache", () => {
  const value = (text: string) => ({ text, cwd: null, provider: "claude" as const });

  it("invalidates on mtime/size change and evicts least recently used", () => {
    const cache = new SearchTextCache(10);
    cache.set("a", 1, 1, value("aaaa"));
    cache.set("b", 1, 1, value("bbbb"));
    expect(cache.get("a", 1, 1)?.text).toBe("aaaa"); // a is now most recent
    cache.set("c", 1, 1, value("cccc")); // over budget → evict b
    expect(cache.get("b", 1, 1)).toBeNull();
    expect(cache.get("a", 2, 1)).toBeNull(); // stale mtime
    expect(cache.get("c", 1, 1)?.text).toBe("cccc");
    cache.set("huge", 1, 1, value("x".repeat(11)));
    expect(cache.get("huge", 1, 1)).toBeNull();
  });
});

describe("createLimiter", () => {
  it("never runs more than N tasks at once", async () => {
    const limit = createLimiter(2);
    let active = 0;
    let peak = 0;
    const task = async (): Promise<number> => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return peak;
    };
    await Promise.all(Array.from({ length: 8 }, () => limit(task)));
    expect(peak).toBe(2);
  });
});

describe("SessionIndex", () => {
  it("coalesces concurrent misses into a bounded number of scans", async () => {
    const index = new SessionIndex(roots);
    await index.ensure();
    await writeJsonl(claudeSessionPath(roots, "-p", "fresh"), [user("hi")]);
    const scans: Array<Promise<unknown>> = [];
    for (let i = 0; i < 20; i += 1) scans.push(index.rescan());
    const unique = new Set(scans);
    expect(unique.size).toBeLessThanOrEqual(2);
    await Promise.all(scans);
    expect((await index.resolve("fresh"))?.provider).toBe("claude");
  });

  it("prefers the most recently written copy of a duplicated session", async () => {
    await writeJsonl(claudeSessionPath(roots, "-a", "dup"), [user("old")], 1_000_000);
    const newer = await writeJsonl(claudeSessionPath(roots, "-b", "dup"), [user("new")], 2_000_000);
    const index = new SessionIndex(roots);
    expect((await index.resolve("dup"))?.filePath).toBe(newer);
  });

  it("resolves codex threads by file name and Claude sessions synchronously", async () => {
    const thread = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
    const rollout = await writeJsonl(codexRolloutPath(roots, thread), [{ type: "session_meta", payload: { id: thread } }]);
    const claude = await writeJsonl(claudeSessionPath(roots, "-p", "sync"), [user("hi")]);
    const index = new SessionIndex(roots);
    expect(await index.resolve(thread)).toEqual({ provider: "codex", filePath: rollout, projectDir: null });
    expect(index.resolveClaudeSync("sync")).toEqual({ provider: "claude", filePath: claude, projectDir: "-p" });
    expect(index.resolveClaudeSync("missing")).toBeNull();
  });
});
