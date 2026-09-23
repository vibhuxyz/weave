import type { EngineAuthState } from "../shared/index.ts";

const ENGINE_ID_ALIASES: ReadonlyMap<string, string> = new Map([["agy", "antigravity"]]);

function canonicalEngineId(engineId: string): string {
  return ENGINE_ID_ALIASES.get(engineId) ?? engineId;
}

export class EngineAuthStates {
  private readonly states = new Map<string, EngineAuthState>();
  private readonly onChange: () => void;

  constructor(onChange: () => void) {
    this.onChange = onChange;
  }

  get(engineId: string): EngineAuthState {
    return this.states.get(canonicalEngineId(engineId)) ?? "unknown";
  }

  set(engineId: string, state: EngineAuthState): void {
    const id = canonicalEngineId(engineId);
    if (this.states.get(id) === state) return;
    this.states.set(id, state);
    this.onChange();
  }
}
