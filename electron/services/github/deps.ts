/**
 * Typed view of electron/cli-bin-resolver (electron-shell, still
 * `// @ts-nocheck` CommonJS — TypeScript sees no exports).
 */

import type { ChildProcess, ExecFileOptions, SpawnOptions } from "node:child_process";
import * as resolverModule from "../../cli-bin-resolver";

export type ExecFileCallback = (error: Error | null, stdout: string, stderr: string) => void;

interface CliBinResolver {
  readonly buildSpawnPath: (extraDirs?: string[]) => string;
  readonly isExecutable: (filePath: string) => boolean;
  readonly resolveCliBin: (commandName: string, options?: { envVarName?: string; extraDirs?: string[] }) => string | null;
  readonly spawnCli: (binPath: string, args: readonly string[], options?: SpawnOptions) => ChildProcess;
  readonly execFileCli: (
    binPath: string,
    args: readonly string[],
    options: ExecFileOptions & { encoding?: BufferEncoding },
    callback: ExecFileCallback,
  ) => ChildProcess;
}

// TODO(ts-boundary): drop once electron-shell lands (electron/cli-bin-resolver.ts)
export const { buildSpawnPath, isExecutable, resolveCliBin, spawnCli, execFileCli } =
  resolverModule as unknown as CliBinResolver;
