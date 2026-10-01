import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TerminalSessionsStatePayload } from "@shared/terminal/types";
import { consumeSavedSessionMetadata, saveSessionMetadataSync } from "../metadata";
import { createOutputCoalescer } from "../output-coalescer";
import { PtySessionRegistry } from "../pty-sessions";
import { Scrollback, decodeInputEscapes } from "../scrollback";
import { buildCleanEnv, planCommand } from "../shell-env";
import { handleTerminalWsMessage, type TerminalSessionApi } from "../ws-protocol";

describe("Scrollback", () => {
  it("joins partial lines and keeps at most `limit` lines", () => {
    const sb = new Scrollback(3);
    sb.append("hel");
    sb.append("lo\nwor");
    sb.append("ld\n");
    expect(sb.tail(10)).toEqual(["hello", "world", ""]);
    for (let i = 0; i < 1000; i += 1) sb.append(`l${i}\n`);
    expect(sb.tail(10)).toEqual(["l998", "l999", ""]);
    expect(sb.tail(0)).toEqual([""]);
  });
});

describe("decodeInputEscapes", () => {
  it("decodes literal escapes sent by MCP clients", () => {
    expect(decodeInputEscapes("ls\\n")).toBe("ls\n");
    expect(decodeInputEscapes("\\x03\\u001b[A\\t\\r")).toBe("\x03\x1b[A\t\r");
  });
});

describe("planCommand", () => {
  it("spawns shells directly and types other command lines into a shell (#219)", () => {
    expect(planCommand(undefined, "/bin/zsh")).toEqual({ kind: "shell", shell: "/bin/zsh" });
    expect(planCommand("  ", "/bin/zsh")).toEqual({ kind: "shell", shell: "/bin/zsh" });
    expect(planCommand("/bin/bash", "/bin/zsh")).toEqual({ kind: "shell", shell: "/bin/bash" });
    expect(planCommand("pwsh.exe", "cmd.exe")).toEqual({ kind: "shell", shell: "pwsh.exe" });
    expect(planCommand("npm run dev", "/bin/zsh")).toEqual({ kind: "typed", shell: "/bin/zsh", commandLine: "npm run dev" });
    expect(planCommand("htop", "/bin/zsh")).toEqual({ kind: "typed", shell: "/bin/zsh", commandLine: "htop" });
  });
});

describe("buildCleanEnv", () => {
  it("strips IDE variables and restores USER_ZDOTDIR", () => {
    const env = buildCleanEnv({
      PATH: "/bin",
      VSCODE_PID: "1",
      TERM_PROGRAM: "vscode",
      GIT_ASKPASS: "x",
      ZDOTDIR: "/vscode/zdotdir",
      USER_ZDOTDIR: "/home/me",
    });
    expect(env).toEqual({ PATH: "/bin", ZDOTDIR: "/home/me" });
  });
});

describe("createOutputCoalescer", () => {
  it("batches per session and flushes on demand", () => {
    vi.useFakeTimers();
    try {
      const deliver = vi.fn();
      const coalesce = createOutputCoalescer(deliver, 16);
      coalesce("a", "1");
      coalesce("b", "x");
      coalesce("a", "2");
      expect(deliver).not.toHaveBeenCalled();
      coalesce.flush("b");
      expect(deliver).toHaveBeenCalledWith("b", "x");
      vi.advanceTimersByTime(16);
      expect(deliver).toHaveBeenLastCalledWith("a", "12");
      expect(deliver).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("ws protocol", () => {
  const api: TerminalSessionApi = {
    createSession: vi.fn(() => ({ ok: true as const, name: "s" })),
    sendInput: vi.fn(() => ({ ok: true as const })),
    readOutput: vi.fn(() => ({ ok: true as const, lines: ["x"] })),
    killSession: vi.fn(() => ({ ok: true as const })),
    listSessions: vi.fn(() => []),
    resizeSession: vi.fn(() => ({ ok: true as const })),
  };

  it("validates params and echoes request ids", () => {
    expect(handleTerminalWsMessage(api, "{")).toEqual({ error: "Invalid JSON" });
    expect(handleTerminalWsMessage(api, JSON.stringify({ id: 1 }))).toEqual({ id: 1, error: "action must be a string" });
    expect(handleTerminalWsMessage(api, JSON.stringify({ id: 2, action: "nope" }))).toEqual({
      id: 2,
      result: { error: "Unknown action: nope" },
    });
    expect(handleTerminalWsMessage(api, JSON.stringify({ id: 3, action: "send_input", params: { name: "s" } }))).toEqual({
      id: 3,
      result: { error: "text must be a string" },
    });
    expect(
      handleTerminalWsMessage(api, JSON.stringify({ id: 4, action: "create_session", params: { name: "s", command: "npm run dev", cwd: 5 } })),
    ).toEqual({ id: 4, result: { ok: true, name: "s" } });
    expect(api.createSession).toHaveBeenCalledWith({ name: "s", command: "npm run dev" });
    expect(handleTerminalWsMessage(api, JSON.stringify({ id: "r", action: "read_output", params: { name: "s" } }))).toEqual({
      id: "r",
      result: { ok: true, lines: ["x"] },
    });
    expect(api.readOutput).toHaveBeenCalledWith("s", undefined);
  });
});

describe("session metadata persistence", () => {
  it("round-trips once and drops invalid entries", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "rl-term-meta-"));
    try {
      const file = path.join(dir, "terminal-sessions.json");
      saveSessionMetadataSync(file, [{ name: "a", cwd: "/", command: "/bin/zsh" }]);
      expect(JSON.parse(await readFile(file, "utf8"))).toHaveLength(1);
      await expect(consumeSavedSessionMetadata(file)).resolves.toEqual([{ name: "a", cwd: "/", command: "/bin/zsh" }]);
      await expect(consumeSavedSessionMetadata(file)).resolves.toEqual([]);
      await writeFile(file, JSON.stringify([{ name: 1 }, { name: "b", cwd: "/", command: "sh" }]));
      await expect(consumeSavedSessionMetadata(file)).resolves.toEqual([{ name: "b", cwd: "/", command: "sh" }]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe.skipIf(process.platform === "win32")("PtySessionRegistry (real PTY)", () => {
  const shellInitRoot = fileURLToPath(new URL("../../../shell-init", import.meta.url));
  const registry = new PtySessionRegistry(() => ({ shellInitRoot, vendorRoot: "/nonexistent" }));
  const originalShell = process.env.SHELL;

  afterEach(() => {
    registry.killAll();
    process.env.SHELL = originalShell;
  });

  it("keeps a session created with a command line alive and runs the command (#219)", async () => {
    process.env.SHELL = "/bin/sh";
    const states: TerminalSessionsStatePayload[] = [];
    registry.setSessionStateCallback((payload) => states.push(payload));

    const created = registry.createSession({ name: "dev", command: "printf 'rl-%s\\n' started", cwd: tmpdir() });
    expect(created).toEqual({ ok: true, name: "dev" });

    await vi.waitFor(
      () => {
        const out = registry.readOutput("dev", 50);
        expect("lines" in out && out.lines.join("\n")).toContain("rl-started");
      },
      { timeout: 5000, interval: 50 },
    );
    // Still registered after the command finished (it returns to the shell prompt).
    expect(registry.listSessions().map((s) => s.name)).toEqual(["dev"]);
    expect(states.map((s) => s.reason)).toEqual(["created"]);

    expect(registry.killSession("dev")).toEqual({ ok: true });
    expect(registry.listSessions()).toEqual([]);
    expect(states.at(-1)?.reason).toBe("killed");
  });
});
