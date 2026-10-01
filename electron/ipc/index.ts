/** Registers every main-process IPC endpoint (all typed against shared/ipc/contract). */

import type { AppContext } from "../app/context";
import { registerAgentIpc } from "./agent";
import { registerFileIpc } from "./files";
import { registerGitIpc } from "./git";
import { registerGitRemoteIpc } from "./git-remote";
import { registerGithubIpc } from "./github";
import { registerMulticaIpc } from "./multica";
import { registerOpenCodeIpc } from "./opencode";
import { registerProjectIpc } from "./project";
import { registerSessionIpc } from "./sessions";
import { registerStateIpc } from "./state";
import { registerSystemIpc } from "./system";
import { registerTerminalIpc } from "./terminal";
import { registerUpdaterIpc } from "./updater";
import { registerWindowIpc } from "./window";

export function registerIpc(ctx: AppContext): void {
  registerAgentIpc();
  registerMulticaIpc();
  registerSessionIpc();
  registerStateIpc(ctx);
  registerFileIpc(ctx);
  registerWindowIpc(ctx);
  registerUpdaterIpc();
  registerSystemIpc(ctx);
  registerOpenCodeIpc();
  registerGitIpc();
  registerGitRemoteIpc();
  registerGithubIpc(ctx);
  registerProjectIpc();
  registerTerminalIpc(ctx);
}
