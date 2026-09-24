import type { EngineState, GitState } from "./types.ts";

export const EMPTY_GIT_STATE: GitState = {
  branch: null,
  baseCommit: null,
  headCommit: null,
  dirty: [],
};

export const EMPTY_ENGINE_STATE: EngineState = {
  engineId: null,
  sessionId: null,
  attempts: 0,
  turns: 0,
  lastStopReason: null,
  contextUsed: null,
  contextSize: null,
  costUsd: null,
};
