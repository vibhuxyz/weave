import { existsSync } from "node:fs";
import { join } from "node:path";
import type { EngineDescriptor, EngineSetup } from "./types.ts";

export interface EngineSetupState {
  readonly required: boolean;
  readonly setup: EngineSetup | null;
}

/**
 * Whether the engine's own first-run wizard still has to be completed.
 *
 * An engine with no wizard is always ready; one whose marker file exists has
 * been through it already.
 */
export function engineSetupState(
  engine: EngineDescriptor,
  home = process.env.HOME ?? "",
): EngineSetupState {
  const setup = engine.setup;
  if (!setup || !home) return { required: false, setup: setup ?? null };
  return {
    required: !existsSync(join(home, setup.completedWhenExists)),
    setup,
  };
}
