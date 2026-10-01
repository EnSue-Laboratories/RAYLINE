/** Pure helpers for RuntimeSetupCard (first-run CLI install / sign-in). */

import type { RuntimeSetupAction, RuntimeSetupProvider, RuntimeSetupProviderId } from "./deps";

/** `runtimeSetup` object App builds and ChatArea passes through as `state`. */
export interface RuntimeSetupState {
  required?: boolean;
  checking?: boolean;
  installed?: Partial<Record<RuntimeSetupProviderId, boolean>>;
  opencodeConfigured?: boolean;
  platform?: string | null;
}

export interface RuntimeSetupCommandRequest {
  providerId: RuntimeSetupProviderId;
  action: RuntimeSetupAction;
  command: string;
}

export type RuntimePrimaryAction = "configure" | "signin" | "install";

type ProviderRef = Pick<RuntimeSetupProvider, "id">;

function isInstalled(provider: ProviderRef, state: RuntimeSetupState | null | undefined): boolean {
  return state?.installed?.[provider.id] === true;
}

function needsOpenCodeProvider(provider: ProviderRef, state: RuntimeSetupState | null | undefined): boolean {
  return provider.id === "opencode" && isInstalled(provider, state) && !state?.opencodeConfigured;
}

export function providerStatusLabel(provider: ProviderRef, state: RuntimeSetupState | null | undefined): string {
  if (needsOpenCodeProvider(provider, state)) return "Installed, needs provider";
  return isInstalled(provider, state) ? "Installed" : "Not installed";
}

export function getPrimaryAction(provider: ProviderRef, state: RuntimeSetupState | null | undefined): RuntimePrimaryAction {
  if (needsOpenCodeProvider(provider, state)) return "configure";
  return isInstalled(provider, state) ? "signin" : "install";
}

export function primaryActionLabel(action: RuntimePrimaryAction, provider: ProviderRef): string {
  switch (action) {
    case "configure":
      return "Configure";
    case "signin":
      return "Sign in";
    case "install":
      return provider.id === "opencode" ? "Install" : "Install and sign in";
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

export function isProviderInstalled(provider: ProviderRef, state: RuntimeSetupState | null | undefined): boolean {
  return isInstalled(provider, state);
}
