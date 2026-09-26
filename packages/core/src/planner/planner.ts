import { parsePlan } from "./parse-plan.ts";
import { buildPlannerPrompt, buildRepairPrompt } from "./prompt.ts";
import { runReview, shouldReview, type ReviewTurn } from "./review/index.ts";
import type { ParsePlanResult, Plan, PlanOutcome, PlanRequest } from "./types.ts";
import { validatePlan, type PlanReview, type PlanValidationContext } from "./validate/index.ts";

const KEPT_FIRST_PLAN = "The repaired plan was invalid, so the first plan was kept";

type Reviewed =
  | { readonly ok: true; readonly plan: Plan; readonly review: PlanReview }
  | { readonly ok: false; readonly issues: readonly string[] };

type Accepted = Extract<PlanOutcome, { ok: true }>;

function validationContextOf(request: PlanRequest): PlanValidationContext {
  return {
    supportedRungs: request.kind === "existing" ? request.rungs : null,
    employeeIds: request.employeeIds ?? null,
    skillNames: request.skillNames ?? null,
    engineIds: request.engineIds ?? null,
  };
}

function reviewed(result: ParsePlanResult, context: PlanValidationContext): Reviewed {
  if (!result.ok) return result;
  const review = result.plan.status === "ready" ? validatePlan(result.plan.tasks, context) : { errors: [], warnings: [] };
  return { ok: true, plan: result.plan, review };
}

function accepted(result: Extract<Reviewed, { ok: true }>, attempts: number, extra: readonly string[] = []): Accepted {
  return { ok: true, plan: result.plan, attempts, warnings: [...result.review.errors, ...result.review.warnings, ...extra], critique: null };
}

async function propose(request: PlanRequest, prompt: string, context: PlanValidationContext): Promise<PlanOutcome> {
  const first = reviewed(parsePlan(await request.runTurn(prompt, request.signal), request.cwd), context);
  if (first.ok && first.review.errors.length === 0) return accepted(first, 1);
  if (request.signal?.aborted) return first.ok ? accepted(first, 1) : { ok: false, issues: first.issues, attempts: 1 };

  const repairPrompt = buildRepairPrompt(prompt, first.ok ? first.review.errors : first.issues);
  const second = reviewed(parsePlan(await request.runTurn(repairPrompt, request.signal), request.cwd), context);
  if (second.ok) return accepted(second, 2);
  if (first.ok) return accepted(first, 2, [KEPT_FIRST_PLAN]);
  return { ok: false, issues: second.issues, attempts: 2 };
}

async function critique(request: PlanRequest, prompt: string, proposed: Accepted, reviewTurn: ReviewTurn): Promise<Accepted> {
  if (proposed.plan.status !== "ready") return proposed;
  const context = validationContextOf(request);
  const run = await runReview({
    plannerPrompt: prompt,
    tasks: proposed.plan.tasks,
    reviewTurn,
    signal: request.signal,
    revise: async (revisionPrompt) => {
      const revised = reviewed(parsePlan(await request.runTurn(revisionPrompt, request.signal), request.cwd), context);
      return revised.ok && revised.plan.status === "ready" ? revised : null;
    },
  });
  if (run.revised) return { ...accepted(run.revised, proposed.attempts + 1), critique: run.critique };
  return { ...proposed, warnings: [...proposed.warnings, ...run.warnings], critique: run.critique };
}

export async function createPlan(request: PlanRequest): Promise<PlanOutcome> {
  const prompt = buildPlannerPrompt(request);
  const proposed = await propose(request, prompt, validationContextOf(request));
  if (!proposed.ok || !request.reviewTurn || proposed.plan.status !== "ready") return proposed;
  const { classification, tasks } = proposed.plan;
  const isWorthReviewing = shouldReview({ taskCount: tasks.length, risk: classification?.risk ?? null, scope: classification?.scope ?? null });
  return isWorthReviewing && !request.signal?.aborted ? critique(request, prompt, proposed, request.reviewTurn) : proposed;
}
