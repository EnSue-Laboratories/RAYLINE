import { useMemo } from "react";
import { useStore } from "../../store/createStore";
import { configureOpenCodeRuntime, runRuntimeSetupCommand } from "../actions/terminal";
import { refreshRuntimeSetup } from "../actions/send";
import { computeRuntimeAvailability, runtimeStore } from "../stores/runtime";
import { modelsStore } from "../stores/models";
import { getEffectivePlatform, useUi } from "../stores/ui";
import type { RuntimeSetupInfo } from "../types";

/** `?runtimeSetup=preview`, `VITE_RAYLINE_RUNTIME_SETUP_PREVIEW=1` or localStorage flag. */
function shouldPreviewRuntimeSetup(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const envFlag: unknown = (import.meta.env as Record<string, unknown>).VITE_RAYLINE_RUNTIME_SETUP_PREVIEW;
    const envPreview = (typeof envFlag === "string" ? envFlag : "").trim();
    if (/^(1|true|yes|on|preview)$/i.test(envPreview)) return true;
    const params = new URLSearchParams(window.location.search || "");
    return (
      params.get("runtimeSetup") === "preview" ||
      params.get("runtime-setup") === "preview" ||
      window.localStorage.getItem("rayline.runtimeSetupPreview") === "1"
    );
  } catch {
    return false;
  }
}

const RUNTIME_SETUP_PREVIEW = shouldPreviewRuntimeSetup();

/** Runtime setup card state for ChatArea; identity changes only with its inputs. */
export function useRuntimeSetup(): RuntimeSetupInfo {
  const cliInstalled = useStore(runtimeStore, (s) => s.cliInstalled);
  const cliChecking = useStore(runtimeStore, (s) => s.cliChecking);
  const openCodeInstalled = useStore(modelsStore, (s) => s.openCodeInstalled);
  const openCodeModelCount = useStore(modelsStore, (s) => s.openCodeModels.length);
  const multicaModelCount = useStore(modelsStore, (s) => s.multicaModels.length);
  const remoteModelCount = useStore(modelsStore, (s) => s.remoteModels.length);
  const platform = getEffectivePlatform(useUi("platform"));

  return useMemo(() => {
    const availability = computeRuntimeAvailability({
      cliInstalled,
      openCodeInstalled,
      openCodeModelCount,
      multicaModelCount,
      remoteModelCount,
    });
    const preview = RUNTIME_SETUP_PREVIEW;
    return {
      required: preview || (Boolean(cliInstalled) && !availability.anyAvailable),
      checking: !preview && cliChecking,
      installed: {
        claude: preview ? false : availability.claude,
        codex: preview ? false : availability.codex,
        opencode: preview ? false : availability.opencodeInstalled,
        grok: preview ? false : availability.grok,
        agy: preview ? false : availability.agy,
      },
      opencodeConfigured: preview ? false : openCodeModelCount > 0,
      platform,
      onRunCommand: runRuntimeSetupCommand,
      onRefresh: refreshRuntimeSetup,
      onConfigureOpenCode: configureOpenCodeRuntime,
    };
  }, [cliChecking, cliInstalled, multicaModelCount, openCodeInstalled, openCodeModelCount, platform, remoteModelCount]);
}
