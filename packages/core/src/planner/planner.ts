import { parsePlan } from "./parse-plan.ts";
import { buildPlannerPrompt, buildRepairPrompt } from "./prompt.ts";
import type { ParsePlanResult, Plan, PlanOutcome, PlanRequest } from "./types.ts";
import { validatePlan, type PlanReview, type PlanValidationContext } from "./validate/index.ts";

type Reviewed =
  | { readonly ok: true; readonly plan: Plan; readonly review: PlanReview }
  | { readonly ok: false; readonly issues: readonly string[] };

type Accepted = Extract<PlanOutcome, { ok: true }>;

function validationContextOf(request: PlanRequest): PlanValidationContext {
  const grounding = request.grounding ?? null;
  return {
    supportedRungs: request.kind === "existing" ? request.rungs : null,
    employeeIds: request.employeeIds ?? null,
    skillNames: request.skillNames ?? null,
    engineIds: request.engineIds ?? null,
    packageManager: grounding?.packageManager ?? null,
    anchorFiles: grounding?.anchorFiles ?? null,
  };
}

function reviewed(result: ParsePlanResult, context: PlanValidationContext): Reviewed {
  if (!result.ok) return result;
  const review = result.plan.status === "ready" ? validatePlan(result.plan.tasks, context) : { errors: [], warnings: [] };
  return { ok: true, plan: result.plan, review };
}

function accepted(result: Extract<Reviewed, { ok: true }>, attempts: number): Accepted {
  return { ok: true, plan: result.plan, attempts, warnings: [...result.review.warnings], critique: null };
}

function rejected(result: Reviewed, attempts: number): PlanOutcome {
  return { ok: false, issues: result.ok ? result.review.errors : result.issues, attempts };
}

async function propose(request: PlanRequest, prompt: string, context: PlanValidationContext): Promise<PlanOutcome> {
  const first = reviewed(parsePlan(await request.runTurn(prompt, request.signal), request.cwd), context);
  if (first.ok && first.review.errors.length === 0) return accepted(first, 1);
  if (request.signal?.aborted) return rejected(first, 1);

  const repairPrompt = buildRepairPrompt(prompt, first.ok ? first.review.errors : first.issues);
  const second = reviewed(parsePlan(await request.runTurn(repairPrompt, request.signal), request.cwd), context);
  if (second.ok && second.review.errors.length === 0) return accepted(second, 2);
  return rejected(second.ok ? second : first.ok ? first : second, 2);
}

export async function createPlan(request: PlanRequest): Promise<PlanOutcome> {
  return propose(request, buildPlannerPrompt(request), validationContextOf(request));
}
