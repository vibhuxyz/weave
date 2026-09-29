export { createRunBranch, currentBranchOf, restoreBranch, runBranchName } from "./branch.ts";
export { PathLocks, pathsOverlap } from "./locks.ts";
export { WorkspaceManager } from "./manager.ts";
export type { WorkspaceManagerInput } from "./manager.ts";
export { externalChanges, watchExternalChanges } from "./watcher.ts";
export type {
  ExternalChange,
  LockHandle,
  OpenWorkspace,
  Placement,
  RunBranch,
  TaskPlacement,
  WatchOptions,
  WorkspaceState,
} from "./types.ts";
