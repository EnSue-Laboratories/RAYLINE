/**
 * Static model catalogue: the baseline every picker starts from before (or
 * without) runtime discovery. Re-exported by registry.ts — import from
 * `@shared/models`.
 *
 *   MODELS        Claude + Codex built-ins (unchanged contract: SSH remotes,
 *                 provider upstreams, `getM`, `getBuiltinModel` use only these)
 *   GROK_MODELS   Grok Build CLI models known from PR #230 + the CLI default
 *   AGY_MODELS    Antigravity CLI default (real models come from discovery)
 *   STATIC_MODELS all of the above, in picker order
 *
 * Sources: docs/refactor/cli-models-research.md (Claude Code 2.1.287, Codex
 * 0.153.4 local catalog + docs, fetched 2026-10-01) and PR #230's
 * src/data/codexModelCatalog.json (openai/codex models.json @694d8d4 +
 * developers.openai.com GPT-6.1 Sol page, checked 2026-09-30) and Grok list.
 */

import { AGY_DEFAULT_MODEL_ID, GROK_DEFAULT_MODEL_ID } from "./ids";
import {
  CLAUDE_EFFORT_LEVELS,
  type AgyModelDefinition,
  type BuiltinModelDefinition,
  type ClaudeModelDefinition,
  type CodexEffortLevel,
  type CodexModelDefinition,
  type GrokModelDefinition,
  type StaticModelDefinition,
} from "./types";

export const DEFAULT_MODEL_ID = "sonnet";

/**
 * Codex reports `context_window` = 272000 for every model in the 0.153.4
 * catalog. GPT-6.1 Sol is listed with 1,050,000 by the API docs; a runtime
 * catalog value (`models_cache.json`) always takes precedence.
 */
export const CODEX_CONTEXT_WINDOW = 272_000;
export const GPT_6_1_SOL_CONTEXT_WINDOW = 1_050_000;
export const CLAUDE_1M_CONTEXT_WINDOW = 1_000_000;
export const CLAUDE_200K_CONTEXT_WINDOW = 200_000;
/** Default Grok context window (PR #230); some models override it. */
export const GROK_CONTEXT_WINDOW = 500_000;
const GROK_1M_CONTEXT_WINDOW = 1_000_000;

const CODEX_LOW_TO_ULTRA: readonly CodexEffortLevel[] = ["low", "medium", "high", "xhigh", "max", "ultra"];
const CODEX_LOW_TO_MAX: readonly CodexEffortLevel[] = ["low", "medium", "high", "xhigh", "max"];
const CODEX_LOW_TO_XHIGH: readonly CodexEffortLevel[] = ["low", "medium", "high", "xhigh"];

// ── Claude (aliases resolved by Claude Code; effort via `--effort`) ─────────
// Context windows: platform docs list Fable 5.1, Opus 5.5 and Sonnet 5.5 as
// 1M. The Claude Code model-config page claims Opus 5.5 is 200K without
// `[1m]` (disputed, unresolved) — we follow the research doc and treat it as
// 1M. The `[1m]` variants are kept so users can force the 1M alias.

const SONNET: ClaudeModelDefinition = {
  id: "sonnet",
  name: "Claude Sonnet",
  tag: "SONNET",
  provider: "claude",
  cliFlag: "sonnet",
  // Sonnet 5.5 is natively 1M; `sonnet[1m]` is a no-op so there is no -1m
  // entry (PR #230's `sonnet-1m` is a legacy alias of `sonnet`).
  contextWindow: CLAUDE_1M_CONTEXT_WINDOW,
  efforts: CLAUDE_EFFORT_LEVELS,
  defaultEffort: "high",
  lifecycle: "current",
};

const CLAUDE_MODELS: readonly ClaudeModelDefinition[] = [
  {
    id: "fable",
    name: "Claude Fable",
    tag: "FABLE",
    provider: "claude",
    cliFlag: "fable",
    contextWindow: CLAUDE_1M_CONTEXT_WINDOW,
    efforts: CLAUDE_EFFORT_LEVELS,
    defaultEffort: "high",
    lifecycle: "current",
  },
  {
    id: "fable-1m",
    name: "Claude Fable (1M)",
    tag: "FABLE 1M",
    provider: "claude",
    cliFlag: "fable[1m]",
    contextWindow: CLAUDE_1M_CONTEXT_WINDOW,
    efforts: CLAUDE_EFFORT_LEVELS,
    defaultEffort: "high",
    lifecycle: "current",
  },
  {
    id: "opus",
    name: "Claude Opus",
    tag: "OPUS",
    provider: "claude",
    cliFlag: "opus",
    contextWindow: CLAUDE_1M_CONTEXT_WINDOW,
    efforts: CLAUDE_EFFORT_LEVELS,
    defaultEffort: "medium",
    lifecycle: "current",
  },
  {
    id: "opus-1m",
    name: "Claude Opus (1M)",
    tag: "OPUS 1M",
    provider: "claude",
    cliFlag: "opus[1m]",
    contextWindow: CLAUDE_1M_CONTEXT_WINDOW,
    efforts: CLAUDE_EFFORT_LEVELS,
    defaultEffort: "medium",
    lifecycle: "current",
  },
  SONNET,
  {
    id: "haiku",
    name: "Claude Haiku",
    tag: "HAIKU",
    provider: "claude",
    cliFlag: "haiku",
    // Haiku 4.5: 200K, no effort control. Retirement "not sooner than 2026-10-15".
    contextWindow: CLAUDE_200K_CONTEXT_WINDOW,
    efforts: [],
    defaultEffort: null,
    lifecycle: "current",
  },
];

// ── Codex (`-m <slug>`, effort via `-c model_reasoning_effort="…"`) ─────────
// Codex ids equal the CLI slug.

export const GPT_6_ASTRA_ID = "gpt-6-astra";

const GPT_6_ASTRA: CodexModelDefinition = {
  id: GPT_6_ASTRA_ID,
  name: "GPT-6 Astra",
  tag: "GPT-6 Astra",
  provider: "codex",
  cliFlag: "gpt-6-astra",
  contextWindow: CODEX_CONTEXT_WINDOW,
  efforts: CODEX_LOW_TO_ULTRA,
  // Local 0.153.4 catalog says medium (PR #230's snapshot says low; a
  // runtime catalog overrides either way).
  defaultEffort: "medium",
  lifecycle: "current",
};

const CODEX_MODELS: readonly CodexModelDefinition[] = [
  GPT_6_ASTRA,
  {
    id: "gpt-6.1-sol",
    name: "GPT-6.1 Sol",
    tag: "GPT-6.1 Sol",
    provider: "codex",
    cliFlag: "gpt-6.1-sol",
    // Official model page (verified in PR #230): 1.05M context, low…max,
    // default medium. Older compatibility caches report only `none`; that
    // must not erase these levels (see buildRuntimeModels).
    contextWindow: GPT_6_1_SOL_CONTEXT_WINDOW,
    efforts: CODEX_LOW_TO_MAX,
    defaultEffort: "medium",
    minCliVersion: "0.159.1",
    lifecycle: "current",
  },
  {
    id: "gpt-6-sol",
    name: "GPT-6 Sol",
    tag: "GPT-6 Sol",
    provider: "codex",
    cliFlag: "gpt-6-sol",
    contextWindow: CODEX_CONTEXT_WINDOW,
    efforts: CODEX_LOW_TO_ULTRA,
    defaultEffort: "medium",
    lifecycle: "current",
  },
  {
    id: "gpt-6-luna",
    name: "GPT-6 Luna",
    tag: "GPT-6 Luna",
    provider: "codex",
    cliFlag: "gpt-6-luna",
    contextWindow: CODEX_CONTEXT_WINDOW,
    efforts: CODEX_LOW_TO_MAX,
    defaultEffort: "medium",
    lifecycle: "current",
  },
  {
    id: "gpt-5.6-sol",
    name: "GPT-5.6 Sol",
    tag: "GPT-5.6 Sol",
    provider: "codex",
    cliFlag: "gpt-5.6-sol",
    contextWindow: CODEX_CONTEXT_WINDOW,
    efforts: CODEX_LOW_TO_ULTRA,
    defaultEffort: "low",
    lifecycle: "current",
  },
  {
    id: "gpt-5.6-terra",
    name: "GPT-5.6 Terra",
    tag: "GPT-5.6 Terra",
    provider: "codex",
    cliFlag: "gpt-5.6-terra",
    contextWindow: CODEX_CONTEXT_WINDOW,
    efforts: CODEX_LOW_TO_ULTRA,
    defaultEffort: "medium",
    lifecycle: "current",
  },
  {
    id: "gpt-5.6-luna",
    name: "GPT-5.6 Luna",
    tag: "GPT-5.6 Luna",
    provider: "codex",
    cliFlag: "gpt-5.6-luna",
    contextWindow: CODEX_CONTEXT_WINDOW,
    efforts: CODEX_LOW_TO_MAX,
    defaultEffort: "medium",
    lifecycle: "current",
  },
  {
    id: "gpt-5.5",
    name: "GPT-5.5",
    tag: "GPT-5.5",
    provider: "codex",
    cliFlag: "gpt-5.5",
    contextWindow: CODEX_CONTEXT_WINDOW,
    efforts: CODEX_LOW_TO_XHIGH,
    defaultEffort: "medium",
    lifecycle: "legacy",
    retiresOn: "2026-10-14",
    successorId: GPT_6_ASTRA_ID,
  },
];

/** Built-in Claude/Codex catalogue, in picker order. */
export const MODELS: readonly BuiltinModelDefinition[] = [...CLAUDE_MODELS, ...CODEX_MODELS];

export const DEFAULT_MODEL: BuiltinModelDefinition = SONNET;

// ── Grok (`grok --model <slug>`; no effort control) ─────────────────────────
// Static entries are historical identities, not proof the model is usable
// locally: `mergeModelCatalog` marks them `unavailable` unless `grok models`
// lists the slug. `grok-default` never depends on discovery.

interface GrokEntryOptions {
  contextWindow?: number | null;
  hidden?: boolean;
}

function grokModel(slug: string, name: string, options: GrokEntryOptions = {}): GrokModelDefinition {
  const contextWindow = options.contextWindow === undefined ? GROK_CONTEXT_WINDOW : options.contextWindow;
  return {
    id: slug,
    name,
    tag: name.toUpperCase(),
    provider: "grok",
    cliFlag: slug,
    efforts: [],
    defaultEffort: null,
    lifecycle: options.hidden ? "legacy" : "current",
    ...(contextWindow !== null ? { contextWindow } : {}),
    ...(options.hidden ? { hidden: true } : {}),
  };
}

export const GROK_MODELS: readonly GrokModelDefinition[] = [
  {
    id: GROK_DEFAULT_MODEL_ID,
    name: "Grok (CLI default)",
    tag: "GROK",
    provider: "grok",
    cliFlag: "",
    efforts: [],
    defaultEffort: null,
    lifecycle: "current",
  },
  grokModel("grok-4.7", "Grok 4.7"),
  grokModel("grok-4.6", "Grok 4.6"),
  grokModel("grok-4.6-direct", "Grok 4.6 Direct", { hidden: true }),
  grokModel("grok-4.6-public", "Grok 4.6 Public", { hidden: true }),
  grokModel("grok-4.5", "Grok 4.5"),
  grokModel("grok-4.3", "Grok 4.3", { contextWindow: GROK_1M_CONTEXT_WINDOW }),
  grokModel("grok-4.20-0309-reasoning", "Grok 4.20 Reasoning", { contextWindow: GROK_1M_CONTEXT_WINDOW }),
  grokModel("grok-4.20-0309-non-reasoning", "Grok 4.20 Non-reasoning", { contextWindow: GROK_1M_CONTEXT_WINDOW }),
  grokModel("grok-build-0.1", "Grok Build 0.1", { contextWindow: 256_000 }),
  grokModel("grok-4.20-reasoning", "Grok 4.20 Reasoning (CLI alias)", {
    contextWindow: GROK_1M_CONTEXT_WINDOW,
    hidden: true,
  }),
  grokModel("grok-build-latest", "Grok Build latest", { contextWindow: null, hidden: true }),
];

// ── Antigravity (`agy --model <slug>`) ──────────────────────────────────────

export const AGY_MODELS: readonly AgyModelDefinition[] = [
  {
    id: AGY_DEFAULT_MODEL_ID,
    name: "Antigravity (CLI default)",
    tag: "AGY",
    provider: "agy",
    cliFlag: "",
    efforts: [],
    defaultEffort: null,
    lifecycle: "current",
  },
];

/** Every static entry, in picker order. */
export const STATIC_MODELS: readonly StaticModelDefinition[] = [...MODELS, ...GROK_MODELS, ...AGY_MODELS];

/** Static entry by exact id (no legacy normalization). */
export function findStaticModel(id: string | null | undefined): StaticModelDefinition | undefined {
  return typeof id === "string" ? STATIC_MODELS.find((m) => m.id === id) : undefined;
}

/** Static Codex entry whose CLI slug is `slug`. */
export function findStaticCodexModelBySlug(slug: string): CodexModelDefinition | undefined {
  for (const model of MODELS) {
    if (model.provider === "codex" && model.cliFlag === slug) return model;
  }
  return undefined;
}

/** Static Grok entry whose CLI slug is `slug` (never `grok-default`). */
export function findStaticGrokModelBySlug(slug: string): GrokModelDefinition | undefined {
  return slug ? GROK_MODELS.find((m) => m.cliFlag === slug) : undefined;
}
