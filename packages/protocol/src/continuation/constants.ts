import type { GitState } from "./types.ts";

export const EMPTY_GIT_STATE: GitState = {
  branch: null,
  baseCommit: null,
  headCommit: null,
  dirty: [],
};
