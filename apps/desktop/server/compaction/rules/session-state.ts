import type { SessionUpdate } from "@weave/protocol";
import { COMPACT_COMMAND_NAME } from "../constants.ts";
import type { ContextSnapshot, SessionCompactionState } from "../types.ts";

export const INITIAL_SESSION_STATE: SessionCompactionState = {
  supportsCompaction: false,
  context: null,
  isContextFromCompaction: false,
};

export function toContextSnapshot(used: unknown, size: unknown): ContextSnapshot | null {
  if (typeof used !== "number" || typeof size !== "number") return null;
  if (!Number.isFinite(used) || !Number.isFinite(size)) return null;
  if (used < 0 || size <= 0) return null;
  return { contextTokens: used, contextLimit: size };
}

export function applySessionUpdate(
  state: SessionCompactionState,
  update: SessionUpdate,
  options: { readonly isCompacting: boolean; readonly isReplay: boolean },
): SessionCompactionState {
  switch (update.sessionUpdate) {
    case "available_commands_update":
      return {
        ...state,
        supportsCompaction: update.availableCommands.some((command) => command.name === COMPACT_COMMAND_NAME),
      };
    case "usage_update":
      if (options.isReplay) return state;
      return {
        ...state,
        context: toContextSnapshot(update.used, update.size),
        isContextFromCompaction: state.isContextFromCompaction || options.isCompacting,
      };
    default:
      return state;
  }
}

export function clearContext(state: SessionCompactionState): SessionCompactionState {
  return { ...state, context: null, isContextFromCompaction: false };
}

export function markTurnCompleted(state: SessionCompactionState): SessionCompactionState {
  return { ...state, isContextFromCompaction: false };
}

export function markCompacted(state: SessionCompactionState): SessionCompactionState {
  return { ...state, isContextFromCompaction: true };
}
