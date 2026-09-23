import type { SessionModeState } from "@agentclientprotocol/sdk";

export interface SessionModeInfo {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
}

export interface SessionModes {
  readonly currentModeId: string;
  readonly availableModes: readonly SessionModeInfo[];
}

/**
 * Modes are the agent's own: it names them, it decides what each one does, and
 * it reports which is active. We only carry them to the UI and send back the
 * one the user picked.
 */
export function toSessionModes(state: SessionModeState | null | undefined): SessionModes | null {
  if (!state || state.availableModes.length === 0) return null;
  return {
    currentModeId: state.currentModeId,
    availableModes: state.availableModes.map((mode) => ({
      id: mode.id,
      name: mode.name,
      description: mode.description ?? null,
    })),
  };
}

export function withCurrentMode(
  modes: SessionModes | null,
  currentModeId: string,
): SessionModes | null {
  if (!modes) return null;
  return { ...modes, currentModeId };
}
