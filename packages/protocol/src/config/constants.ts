import type { RunConfig } from "./types.ts";

const DEFAULT_TIMEOUT_MS = 600000;
const DEFAULT_MAX_TURNS = 60;
const DEFAULT_ENGINE = "antigravity";

export const DEFAULT_RUN_CONFIG = {
  engine: DEFAULT_ENGINE,
  maxTurns: DEFAULT_MAX_TURNS,
  timeoutMs: DEFAULT_TIMEOUT_MS,
} satisfies RunConfig;
