/** Host info, CLI probing, provider upstream sync and one-shot agent helpers. */

import os from "node:os";
import type { AppContext } from "../app/context";
import { getModelCatalog } from "../providers/model-catalog";
import * as providerUpstreams from "../provider-upstreams";
import { quickExplain } from "../services/claude-oneshot";
import { getCliInstalledSnapshot } from "../services/cli-status";
import { runDispatchPlanner } from "../services/dispatch-planner";
import { checkRemoteRuntime, runShellCommand } from "../services/shell-commands";
import { handle } from "./typed";

export function registerSystemIpc(ctx: AppContext): void {
  handle("system-info", () => ({
    user: os.userInfo().username,
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    home: os.homedir(),
    nodeVersion: process.versions.node,
    electronVersion: process.versions.electron ?? "",
    cpus: os.cpus().length,
    memory: `${Math.round(os.totalmem() / (1024 * 1024 * 1024))} GB`,
    shell: (process.env.SHELL || process.env.COMSPEC || "unknown").split("/").pop() ?? "unknown",
  }));

  // Renderer grays out providers whose CLI is missing and links to install guides.
  handle("check-cli-installed", (_event, options) => getCliInstalledSnapshot(options ?? {}));
  handle("model-catalog", () => getModelCatalog());

  handle("sync-provider-upstreams", (_event, request) => {
    if (request?.provider === "claude" && ctx.env.isWindows) {
      const normalized = providerUpstreams.normalizeProviderUpstreamConfig(request.config, "claude");
      if (normalized?.baseURL) {
        // The first listed model becomes the primary one in settings.json.
        const model = normalized.modelList[0] ?? "";
        providerUpstreams.patchClaudeSettingsWin32({ baseURL: normalized.baseURL, apiKey: normalized.apiKey }, model);
        providerUpstreams.patchClaudeConfigWin32();
      }
    }
    return true as const;
  });

  handle("quick-explain", (_event, request) => quickExplain(request));
  handle("dispatch-plan", (_event, request) => runDispatchPlanner(request));
  handle("shell-run", (_event, request) => runShellCommand(request));
  handle("remote-runtime-check", (_event, input) => checkRemoteRuntime(input));
}
