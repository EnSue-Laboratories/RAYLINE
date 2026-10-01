import { memo, useLayoutEffect, useMemo } from "react";
import { MODELS } from "@shared/models/catalog";
import { buildRemoteModels } from "@shared/models/dynamic-models";
import type { ModelDefinition } from "@shared/models/types";
import { useModelCatalog } from "../../components/model-picker/useModelCatalog";
import { useMulticaModels } from "../../data/multicaModels";
import { useOpenCodeModels } from "../../data/openCodeModels";
import { useProviderUpstreams } from "../../data/providerUpstreams";
import { useAppSetting } from "../../store/appSettings";
import { modelsStore } from "../stores/models";

/**
 * Owns the model data hooks and publishes the catalog to `modelsStore`;
 * renders nothing, so model refreshes never re-render App. The catalog is
 * the same one every picker uses (runtime discovery + upstream overrides +
 * these extras), so sends resolve ids exactly like the picker shows them.
 */
export const ModelsBridge = memo(function ModelsBridge() {
  const { models: multicaModels } = useMulticaModels();
  const { models: openCodeModels, status: openCodeStatus, refresh: refreshOpenCode } = useOpenCodeModels();
  const { getConfig } = useProviderUpstreams();
  const remoteSshCommand = useAppSetting("remoteSshCommand");
  const remoteSshRuntime = useAppSetting("remoteSshRuntime");

  const remoteModels = useMemo(
    () => buildRemoteModels(remoteSshCommand, remoteSshRuntime, MODELS),
    [remoteSshCommand, remoteSshRuntime],
  );
  const extraModels = useMemo<ModelDefinition[]>(
    () => [...remoteModels, ...openCodeModels, ...multicaModels],
    [multicaModels, openCodeModels, remoteModels],
  );
  const catalog = useModelCatalog(extraModels);

  useLayoutEffect(() => {
    modelsStore.setState({
      multicaModels,
      openCodeModels,
      openCodeInstalled: openCodeStatus.installed,
      remoteModels,
      availableModels: catalog.models,
      getModel: catalog.getModel,
      refreshOpenCodeModels: () => {
        void refreshOpenCode();
      },
      getProviderUpstreamConfig: getConfig,
    });
  }, [catalog.getModel, catalog.models, getConfig, multicaModels, openCodeModels, openCodeStatus.installed, refreshOpenCode, remoteModels]);

  return null;
});
