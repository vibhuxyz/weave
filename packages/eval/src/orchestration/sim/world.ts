import type { EngineTruth, World } from "./types.ts";

export const SIM_ENGINES: readonly EngineTruth[] = [
  { id: "claude-code", successByKind: { web: 0.9, api: 0.85, db: 0.55 }, speedFactor: 1, costUsdPerUnit: 0.3 },
  { id: "codex", successByKind: { web: 0.6, api: 0.85, db: 0.9 }, speedFactor: 0.8, costUsdPerUnit: 0.2 },
  { id: "gemini", successByKind: { web: 0.8, api: 0.7, db: 0.6 }, speedFactor: 0.6, costUsdPerUnit: 0.1 },
] as const;

export const DEFAULT_SIM_MS_PER_UNIT = 25;

export function simWorld(seed: string, msPerUnit: number = DEFAULT_SIM_MS_PER_UNIT): World {
  return { engines: SIM_ENGINES, msPerUnit, seed };
}
