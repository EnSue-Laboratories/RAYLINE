/** Multica setup REST passthroughs and stream re-subscription. */

import { multicaManager } from "../app/boundaries";
import { providerSink } from "./agent";
import { handle } from "./typed";

export function registerMulticaIpc(): void {
  handle("multica-send-code", (_event, args) => multicaManager.multicaSendCode(args));
  handle("multica-verify-code", (_event, args) => multicaManager.multicaVerifyCode(args));
  handle("multica-list-workspaces", (_event, args) => multicaManager.multicaListWorkspaces(args));
  handle("multica-list-agents", (_event, args) => multicaManager.multicaListAgents(args));
  handle("multica-ensure-session", (_event, args) => multicaManager.multicaEnsureSession(args));
  handle("multica-send-message", (_event, args) => multicaManager.multicaSendMessage(args));
  handle("multica-list-messages", (_event, args) => multicaManager.multicaListMessages(args));
  handle("multica-subscribe", async (event, args) => {
    await multicaManager.subscribeMulticaAgent(args, providerSink(event.sender));
  });
}
