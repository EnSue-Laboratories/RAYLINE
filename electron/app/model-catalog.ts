/**
 * `model-catalog` source. electron-providers owns runtime model discovery
 * (Codex models_cache.json, `grok models`, `agy models`).
 *
 * TODO(integration): once electron-providers lands electron/providers/model-catalog.ts,
 * replace this body with `export { getModelCatalog } from "../providers/model-catalog";`.
 * Until then the catalog is empty, which the renderer treats as "nothing discovered".
 */

import type { RuntimeModelCatalog } from "@shared/models/types";

export function getModelCatalog(): Promise<RuntimeModelCatalog> {
  return Promise.resolve({ codex: [], grok: [], agy: [] });
}
