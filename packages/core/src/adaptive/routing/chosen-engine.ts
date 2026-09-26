import { requiredCapabilities } from "./route-engines.ts";
import type { EngineCandidate, RoutableTask } from "./types.ts";

export interface ChosenEngineInput {
  readonly task: RoutableTask & { readonly engine?: string };
  readonly chain: readonly string[];
  readonly candidates: readonly EngineCandidate[];
}

export interface ChosenEngine {
  readonly chain: readonly string[];
  readonly refusal: string | null;
}

export function moveToFront(chain: readonly string[], engineId: string): readonly string[] {
  return [engineId, ...chain.filter((id) => id !== engineId)];
}

function missingCapabilities(candidate: EngineCandidate, task: RoutableTask): readonly string[] {
  return requiredCapabilities(task).filter((capability) => candidate.capabilities[capability] !== true);
}

export function withChosenEngine(input: ChosenEngineInput): ChosenEngine {
  const chosen = input.task.engine;
  if (chosen === undefined) return { chain: input.chain, refusal: null };
  const candidate = input.candidates.find((entry) => entry.id === chosen);
  if (!candidate) {
    return { chain: input.chain, refusal: `engine ${chosen} is not installed for this run; ${input.chain[0] ?? "the configured engine"} runs it instead` };
  }
  const missing = missingCapabilities(candidate, input.task);
  if (missing.length > 0) {
    return { chain: input.chain, refusal: `engine ${chosen} does not declare ${missing.join(", ")}; ${input.chain[0] ?? "the configured engine"} runs it instead` };
  }
  return { chain: moveToFront(input.chain, chosen), refusal: null };
}
