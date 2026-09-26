import { buildRepairPrompt, buildReplanPrompt } from "./prompt.ts";
import { parseReplanDecision } from "./parse-decision.ts";
import type { ReplanDecision, ReplanOutcome, ReplanRequest } from "./types.ts";

const CONTINUE_ON_BAD_ANSWER = "The coordinator's answer was unusable twice, so the run continues as it stands";
const EMPTY_RERUN = "The coordinator asked to rerun nothing, so the run continues as it stands";

function keepKnown(decision: ReplanDecision, request: ReplanRequest): { readonly decision: ReplanDecision; readonly warnings: readonly string[] } {
  const known = new Set(request.tasks.map((task) => task.id));
  const engines = new Set(request.engineIds);
  const warnings: string[] = [];
  const rerun = decision.rerun.flatMap((entry) => {
    if (!known.has(entry.id)) {
      warnings.push(`The coordinator asked to rerun ${entry.id}, which is not in the plan; it was left out`);
      return [];
    }
    if (entry.engine !== undefined && !engines.has(entry.engine)) {
      warnings.push(`The coordinator asked to run ${entry.id} on ${entry.engine}, which is not installed for this run; its usual engine order is kept`);
      return [{ id: entry.id, ...(entry.guidance ? { guidance: entry.guidance } : {}) }];
    }
    return [entry];
  });
  if (decision.action === "rerun" && rerun.length === 0) {
    return { decision: { action: "continue", rerun: [], reason: decision.reason }, warnings: [...warnings, EMPTY_RERUN] };
  }
  return { decision: { ...decision, rerun }, warnings };
}

export async function decideReplan(request: ReplanRequest): Promise<ReplanOutcome> {
  const prompt = buildReplanPrompt(request);
  const first = parseReplanDecision(await request.runTurn(prompt, request.signal));
  if (first.ok) return { ...keepKnown(first.decision, request), attempts: 1 };
  if (request.signal?.aborted) return { decision: { action: "continue", rerun: [], reason: CONTINUE_ON_BAD_ANSWER }, warnings: first.issues, attempts: 1 };

  const second = parseReplanDecision(await request.runTurn(buildRepairPrompt(prompt, first.issues), request.signal));
  if (second.ok) return { ...keepKnown(second.decision, request), attempts: 2 };
  return {
    decision: { action: "continue", rerun: [], reason: CONTINUE_ON_BAD_ANSWER },
    warnings: [...first.issues, ...second.issues],
    attempts: 2,
  };
}
