/**
 * Typed views of main-process modules owned by other packages that are still
 * `// @ts-nocheck` CommonJS (they export nothing TypeScript can see).
 */

import * as loggerModule from "../../logger";

export type Logger = (...args: unknown[]) => void;

interface LoggerModule {
  readonly createLogger: (scope: string) => Logger;
}

// TODO(ts-boundary): drop once electron-shell lands (electron/logger.ts)
export const { createLogger } = loggerModule as unknown as LoggerModule;
