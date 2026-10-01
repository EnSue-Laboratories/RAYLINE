/** Terminal surface: sidebar drawer vs. dedicated window, and runtime-setup commands. */

import { getAppSettings } from "../../store/appSettings";
import { getActiveConvo } from "../../store/convoList";
import { getRuntimeSetupShell } from "../../data/runtimeSetup";
import { getTerminalApi } from "../stores/terminal";
import { getEffectivePlatform, getUi, patchUi } from "../stores/ui";
import type { RuntimeSetupCommand } from "../types";
import { refreshRuntimeSetup } from "./send";

/** Directory new terminals open in: the active chat's cwd (drafts folder for drafts), else the app cwd. */
export function resolveTerminalCwd(
  activeCwd: string | null | undefined,
  draftsPath: string | null,
  appCwd: string | null,
): string | undefined {
  if (activeCwd === null) return draftsPath || undefined;
  return activeCwd || appCwd || undefined;
}

function currentTerminalCwd(): string | undefined {
  const active: { cwd?: string | null } | null = getActiveConvo();
  return resolveTerminalCwd(active ? active.cwd : undefined, getUi().draftsPath, getAppSettings().cwd);
}

export async function toggleTerminal(): Promise<void> {
  const terminal = getTerminalApi();
  if (!terminal) return;
  const cwd = currentTerminalCwd();
  if (getAppSettings().sidebarTerminalEnabled) {
    if (getUi().sidebarTerminalOpen) {
      patchUi({ sidebarTerminalOpen: false });
      return;
    }
    if (terminal.windowOpen) await terminal.closeWindow();
    patchUi({ sidebarTerminalOpen: true });
    if (terminal.sessions.length === 0) {
      await terminal.createSession({ name: `shell-${Date.now()}`, cwd, reveal: false });
    }
    return;
  }
  if (terminal.windowOpen) {
    await terminal.closeWindow();
    return;
  }
  if (terminal.sessions.length === 0) {
    await terminal.createSession({ name: `shell-${Date.now()}`, cwd });
    return;
  }
  await terminal.openWindow();
}

export function refocusTerminal(): void {
  const terminal = getTerminalApi();
  if (!terminal) return;
  if (getAppSettings().sidebarTerminalEnabled) {
    if (getUi().sidebarTerminalOpen) {
      terminal.focusActiveSession();
      terminal.refitActiveSession();
    }
    return;
  }
  if (terminal.windowOpen) void terminal.openWindow();
}

export function toggleSidebarTerminalDrawer(): void {
  patchUi({ sidebarTerminalOpen: !getUi().sidebarTerminalOpen });
}

/** RuntimeSetupCard: run an install/sign-in command in a visible terminal, then re-probe. */
export async function runRuntimeSetupCommand({ providerId, command }: RuntimeSetupCommand): Promise<void> {
  const terminal = getTerminalApi();
  if (!command || !terminal) return;
  const sessionName = `setup-${providerId}-${Date.now().toString(36)}`;
  await terminal.createSession({
    name: sessionName,
    command: getRuntimeSetupShell(getEffectivePlatform(getUi().platform)),
    reveal: true,
  });
  terminal.sendInput(sessionName, `${command}\n`);
  window.setTimeout(refreshRuntimeSetup, 5000);
  window.setTimeout(refreshRuntimeSetup, 15000);
}

export function configureOpenCodeRuntime(): void {
  patchUi({ showSettings: true });
  window.dispatchEvent(new CustomEvent("opencode-refresh"));
}
