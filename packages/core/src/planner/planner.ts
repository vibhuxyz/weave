import { parsePlan } from "./parse-plan.ts";
import { buildPlannerPrompt, buildRepairPrompt } from "./prompt.ts";
import type { PlanOutcome, PlanRequest } from "./types.ts";

export async function createPlan(request: PlanRequest): Promise<PlanOutcome> {
  const prompt = buildPlannerPrompt(request);
  const first = parsePlan(await request.runTurn(prompt, request.signal), request.cwd);
  if (first.ok) return { ok: true, plan: first.plan, attempts: 1 };

  const repairPrompt = buildRepairPrompt(prompt, first.issues);
  const second = parsePlan(await request.runTurn(repairPrompt, request.signal), request.cwd);
  return second.ok
    ? { ok: true, plan: second.plan, attempts: 2 }
    : { ok: false, issues: second.issues, attempts: 2 };
}
