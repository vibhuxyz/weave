import type { TaskComplexity } from "@weave/protocol";

export const PROMPT_BYTES_PER_UNIT = 200;
export const MAX_SIZE_UNITS = 50;
export const UNKNOWN_KIND = "general";
export const DEFAULT_MS_PER_UNIT = 60_000;

const MS_PER_MINUTE = 60_000;
export const COMPLEXITY_PRIOR_MS = {
  low: 3 * MS_PER_MINUTE,
  medium: 10 * MS_PER_MINUTE,
  high: 25 * MS_PER_MINUTE,
} as const satisfies Record<TaskComplexity, number>;
export const DEFAULT_STARTUP_MS = 15_000;
export const KIND_PRIOR_WEIGHT = 2;
