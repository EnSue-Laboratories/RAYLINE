/**
 * Typed view of `useAgent`, which is still `// @ts-nocheck` (their inferred types
 * are mostly `any`). Every cast lives here so it can be deleted once the
 * owning package lands its conversion.
 */

import type { AgentApi } from "./types";
import useAgentUntyped from "../hooks/useAgent";

// TODO(ts-boundary): drop once chat-core lands (useAgent keeps this shape).
export const useAgent = useAgentUntyped as unknown as () => AgentApi;
