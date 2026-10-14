import { join } from "node:path";
import type { VerificationRung } from "@weave/protocol";
import { buildContractWorkerNote, lockContract } from "../contracts/index.ts";
import { discoverSkills } from "../discovery/index.ts";
import type { PlanningEngines } from "../adaptive/index.ts";
import { queryProject, renderProjectContext, type ProjectModel } from "../context/index.ts";
import { createPlan, rejectionEvent, type PlanGrounding, type PlanOutcome, type PlanRequest, type ProjectKind } from "../planner/index.ts";
import { escapeClosingTag, flatten, type Ledger } from "../shared/index.ts";
import { buildSkillRegistry, renderSkillCatalog, type SkillRegistry } from "../skills/index.ts";
import { triageRequest } from "../triage/index.ts";
import { SKILL_DIRS } from "../worker-context/index.ts";
import { prepareGreenfield, type GreenfieldBase } from "./greenfield.ts";
import { engineIdsOf, renderEngineCatalog } from "./team/index.ts";
import type { PlanningInput, PlanningOutcome } from "./types.ts";

const MAX_FAST_TITLE_CHARS = 120;
const FAST_TASK_ID = "T1";
const PREFLIGHT_TAG = "preflight-warnings";
const DEFAULT_PLANNING_BUDGET_MS = 45_000;
const RUN_STOPPED = "The run was stopped.";
const WHOLE_REQUEST_REASON = "The team plan did not validate in time, so one worker has the whole request";

export interface FastPlanInput {
  readonly request: string;
  readonly kind: ProjectKind;
  readonly model: ProjectModel | null;
  readonly repoRoot: string;
  readonly ledger: Ledger;
  readonly engines: PlanningEngines;
  readonly preflightWarnings?: readonly string[];
}

type PlanCall = PlanningInput & { readonly ledger: Ledger; readonly rungs: readonly VerificationRung[] };

type Asked =
  | { readonly status: "stopped" }
  | { readonly status: "fallback" }
  | { readonly status: "answered"; readonly outcome: PlanOutcome };

function groundingOf(model: ProjectModel, request: string): { readonly projectContext: string; readonly grounding: PlanGrounding } {
  const answer = queryProject(model, request);
  return {
    projectContext: renderProjectContext(answer),
    grounding: {
      packageManager: model.stack.packageManager,
      anchorFiles: answer.anchors.map((anchor) => ({ file: anchor.file, symbol: anchor.symbol })),
    },
  };
}

function withPlannerNotes(projectContext: string | null, notes: string | null | undefined): string | null {
  if (!notes) return projectContext;
  return projectContext ? `${projectContext}\n\n${notes}` : notes;
}

function withPreflightNote(projectContext: string, warnings: readonly string[]): string {
  if (warnings.length === 0) return projectContext;
  const body = escapeClosingTag(warnings.join("\n"), PREFLIGHT_TAG);
  return `${projectContext}\n\n<${PREFLIGHT_TAG} source="Weave: checked with git before planning">\n${body}\n</${PREFLIGHT_TAG}>`;
}

export function fastPlan(input: FastPlanInput): PlanningOutcome | null {
  const filePaths = new Set(input.model?.files.map((file) => file.path) ?? []);
  const triage = triageRequest({ request: input.request, kind: input.kind, filePaths });
  const engines = triage.route === "plan" ? { plannerEngineId: input.engines.plannerId ?? null, reviewerEngineId: input.engines.reviewerId ?? null } : { plannerEngineId: null, reviewerEngineId: null };
  input.ledger.append("plan.triaged", { route: triage.route, reason: triage.reason, ...engines });
  if (triage.route === "plan") return null;
  input.ledger.append("plan.reviewed", { attempts: 0, classification: { ...triage.classification, domains: [...triage.classification.domains] }, warnings: [...(input.preflightWarnings ?? [])], critique: null });
  const request = input.request.trim();
  const title = flatten(request).slice(0, MAX_FAST_TITLE_CHARS);
  const task = { id: FAST_TASK_ID, title, prompt: request, cwd: input.repoRoot, allowedPaths: [triage.path], complexity: "low" as const };
  return { status: "planned", tasks: [task], intent: { goal: title, assumptions: [], risks: [] }, contract: null, baseRef: undefined };
}

function wholeRequest(input: PlanCall, reason: string): PlanningOutcome {
  input.ledger.append("plan.reviewed", { attempts: 0, classification: null, warnings: [reason], critique: null });
  const request = input.request.trim();
  const title = flatten(request).slice(0, MAX_FAST_TITLE_CHARS) || "Do the requested work";
  const task = { id: FAST_TASK_ID, title, prompt: request || title, cwd: input.repoRoot, complexity: "medium" as const };
  return { status: "planned", tasks: [task], intent: { goal: title, assumptions: [], risks: [reason] }, contract: null, baseRef: undefined };
}

function planRequest(input: PlanCall, skills: SkillRegistry, base: GreenfieldBase | null): PlanRequest {
  const prepared = input.model ? groundingOf(input.model, input.request) : null;
  const noted = prepared?.projectContext ?? input.projectContext ?? null;
  return {
    request: input.request,
    kind: input.kind,
    rungs: input.rungs,
    blueprint: base?.blueprint ?? null,
    contract: base?.contract ?? null,
    grounding: prepared?.grounding ?? null,
    projectContext: withPlannerNotes(noted ? withPreflightNote(noted, input.preflightWarnings ?? []) : null, input.notes),
    employees: input.employeeRoster ?? null,
    skillCatalog: renderSkillCatalog(skills),
    engineCatalog: renderEngineCatalog(input.engineCandidates),
    employeeIds: input.employeeIds ?? null,
    skillNames: skills.skills.map((skill) => skill.name),
    engineIds: engineIdsOf(input.engineCandidates),
    cwd: input.repoRoot,
    runTurn: input.runTurn,
    reviewTurn: input.reviewTurn,
  };
}

async function proposePlan(input: PlanCall, request: PlanRequest): Promise<Asked> {
  const budget = new AbortController();
  const timer = setTimeout(() => budget.abort(), input.planningBudgetMs ?? DEFAULT_PLANNING_BUDGET_MS);
  const signal = input.signal ? AbortSignal.any([input.signal, budget.signal]) : budget.signal;
  try {
    const outcome = await createPlan({ ...request, signal });
    if (input.signal?.aborted) return { status: "stopped" };
    if (budget.signal.aborted) return { status: "fallback" };
    return { status: "answered", outcome };
  } catch (error: unknown) {
    if (input.signal?.aborted) return { status: "stopped" };
    if (budget.signal.aborted) return { status: "fallback" };
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function acceptedPlan(input: PlanCall, outcome: Extract<PlanOutcome, { ok: true }>, base: GreenfieldBase | null): PlanningOutcome {
  const classification = outcome.plan.status === "ready" ? outcome.plan.classification : null;
  input.ledger.append("plan.reviewed", {
    attempts: outcome.attempts,
    classification: classification && { ...classification, domains: [...classification.domains] },
    warnings: [...(input.preflightWarnings ?? []), ...outcome.warnings],
    critique: outcome.critique && {
      outcome: outcome.critique.outcome,
      issues: outcome.critique.issues.map((issue) => ({ type: issue.type, taskIds: [...issue.taskIds], reason: issue.reason })),
    },
  });
  if (outcome.plan.status === "no-change-needed") return { status: "no-change-needed", reason: outcome.plan.reason };
  const note = base?.contractShape ? buildContractWorkerNote(base.contractShape) : null;
  const tasks = base && note
    ? lockContract(outcome.plan.tasks).map((task) => ({ ...task, prompt: `${task.prompt}\n\n${note}` }))
    : outcome.plan.tasks;
  return { status: "planned", tasks, intent: outcome.plan.intent, contract: base?.contractShape ?? null, baseRef: base?.baseRef };
}

export async function planTasks(input: PlanCall): Promise<PlanningOutcome> {
  const [greenfield, projectSkills] = await Promise.all([
    input.kind === "greenfield" ? prepareGreenfield(input, input.runTurn, input.signal) : null,
    discoverSkills(SKILL_DIRS.map((dir) => join(input.repoRoot, dir))),
  ]);
  if (greenfield && !greenfield.ok) return { status: "refused", reason: greenfield.reason };
  const asked = await proposePlan(input, planRequest(input, buildSkillRegistry(projectSkills), greenfield?.ok ? greenfield.value : null));
  if (asked.status === "stopped") return { status: "refused", reason: RUN_STOPPED };
  if (asked.status === "answered" && !asked.outcome.ok) input.ledger.append("plan.rejected", rejectionEvent(asked.outcome.issues, false));
  if (asked.status === "fallback" || !asked.outcome.ok) return wholeRequest(input, WHOLE_REQUEST_REASON);
  return acceptedPlan(input, asked.outcome, greenfield?.ok ? greenfield.value : null);
}
