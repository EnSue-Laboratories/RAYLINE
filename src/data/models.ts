/**
 * Renderer entry point for the model registry. All logic lives in
 * shared/models (runtime-agnostic, also used by the main process); this module
 * re-exports it so existing `../data/models` imports keep working.
 *
 * Note the id scheme change documented in shared/models/registry.ts: effort is
 * no longer encoded in model ids (`gpt55-high` → `gpt-5.5` + effort "high");
 * use `normalizeModelSelection()` when migrating persisted conversations.
 * PR #230 ids (`gpt61-sol-high`, `codex-model:<slug>:<effort>`, `grok-47`,
 * `grok-46-continue`, `sonnet-1m`, …) normalize the same way. Runtime
 * discovery (`buildRuntimeModels`, `mergeModelCatalog`) and picker helpers
 * (`visibleModels`, `modelLabel`, `filterModels`, `isPlannerModel`,
 * `defaultPlannerModel`) are re-exported here too.
 */

export * from "@shared/models";
