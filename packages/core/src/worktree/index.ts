export {
  createWorktree,
  listWeaveWorktrees,
  pruneWorktrees,
  removeWorktree,
  taskBranchName,
  type CreateWorktreeInput,
  type RemoveWorktreeOptions,
  type Worktree,
} from "./worktree.ts";
export { resolveTaskWorkspace, type ResolveTaskWorkspaceInput, type TaskWorkspace } from "./workspace.ts";
export { checkCleanBase, describeUntrackedFiles } from "./preflight.ts";
export { checkpointWorktree, commitAll, harvestWorktree, snapshotFiles } from "./harvest.ts";
export { detectInstallCommand, installWorktree } from "./install.ts";
export { outputLines, runGit } from "./run-git.ts";
export type { Harvest, InstallOutcome, WorktreeResult } from "./types.ts";
