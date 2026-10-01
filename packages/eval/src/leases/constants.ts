import type { SimulationConfig } from "./types.ts";

export const DEFAULT_CONFIG = {
  seed: "weave",
  tasks: 100,
  workers: 20,
  leaseMs: 3_000,
  heartbeatMs: 1_000,
  sweepMs: 250,
  minTaskMs: 2_000,
  maxTaskMs: 8_000,
  verifyMs: 300,
  restartMs: 2_000,
  hangMs: 6_000,
  crashRate: 0.1,
  hangRate: 0.03,
  wrongOutputRate: 0.05,
  dependencyRate: 0.2,
  maxAttempts: 4,
} as const satisfies SimulationConfig;

export const MAX_SIM_STEPS = 2_000_000;
export const MAX_SIM_MS = 24 * 60 * 60 * 1_000;
export const DEPENDENCY_WINDOW = 10;
export const EXPECTED_OUTPUT_PREFIX = "ok:";
export const WRONG_OUTPUT = "wrong";
export const MAX_TIMELINE_LINES = 200;
export const MAX_STORIES = 8;
