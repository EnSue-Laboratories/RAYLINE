/** OpenCode status / config. */

import { getOpenCodeProviderConfig, getOpenCodeStatus, saveOpenCodeConfig } from "../services/opencode-status";
import { handle } from "./typed";

export function registerOpenCodeIpc(): void {
  handle("opencode-status", () => getOpenCodeStatus());
  handle("opencode-save-config", (_event, input) => saveOpenCodeConfig(input));
  handle("opencode-get-provider-config", (_event, providerId) => getOpenCodeProviderConfig(providerId));
}
