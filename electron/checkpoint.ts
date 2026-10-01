/**
 * Public entry for git-backed worktree checkpoints
 * (refs/claudi-checkpoints/<id>). Implementation: electron/services/checkpoint/.
 */

export {
  createCheckpoint,
  restoreCheckpoint,
  type CheckpointCreateResult,
  type CheckpointRestoreResult,
} from "./services/checkpoint/checkpoints";
