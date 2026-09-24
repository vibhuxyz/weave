import { INTEGRATION_WORKTREE_ID } from "../integrator/index.ts";

export const CONTRACT_WORKTREE_ID = "contract";
export const PLANNER_WORKTREE_ID = "planner";
export const CONTRACT_REVISION_ID = /^contract-v\d+$/;
export const MAX_CONTRACT_REVISIONS = 2;

export const RESERVED_TASK_IDS: readonly string[] = [INTEGRATION_WORKTREE_ID, CONTRACT_WORKTREE_ID, PLANNER_WORKTREE_ID];
export const MAX_UPDATE_ROUNDS = 2;
