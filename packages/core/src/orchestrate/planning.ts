import { join } from "node:path";
import type { VerificationRung } from "@weave/protocol";
import { buildContractWorkerNote, lockContract } from "../contracts/index.ts";
import { discoverSkills } from "../discovery/index.ts";
import type { PlanningEngines } from "../adaptive/index.ts";
import type { ProjectModel } from "../context/index.ts";
import { createPlan, type ProjectKind } from "../planner/index.ts";
import { flatten, type Ledger } from "../shared/index.ts";
import { buildSkillRegistry, renderSkillCatalog } from "../skills/index.ts";
import { triageRequest } from "../triage/index.ts";
import { SKILL_DIRS } from "../worker-context/index.ts";
import { prepareGreenfield } from "./greenfield.ts";
import { engineIdsOf, renderEngineCatalog } from "./team/index.ts";
import type { PlanningInput, PlanningOutcome } from "./types.ts";

const MAX_LISTED_ISSUES = 20;
const MAX_FAST_TITLE_CHARS = 120;
const FAST_TASK_ID = "T1";

export interface FastPlanInput {
  readonly request: string;
  readonly kind: ProjectKind;
  readonly model: ProjectModel | null;
  readonly repoRoot: string;
  readonly ledger: Ledger;
  readonly engines: PlanningEngines;
}

export function fastPlan(input: FastPlanInput): PlanningOutcome | null {
  const filePaths = new Set(input.model?.files.map((file) => file.path) ?? []);
  const triage = triageRequest({ request: input.request, kind: input.kind, filePaths });
  const engines = triage.route === "plan" ? { plannerEngineId: input.engines.plannerId ?? null, reviewerEngineId: input.engines.reviewerId ?? null } : { plannerEngineId: null, reviewerEngineId: null };
  input.ledger.append("plan.triaged", { route: triage.route, reason: triage.reason, ...engines });
  if (triage.route === "plan") return null;
  input.ledger.append("plan.reviewed", { attempts: 0, classification: { ...triage.classification, domains: [...triage.classification.domains] }, warnings: [], critique: null });
  const request = input.request.trim();
  const title = flatten(request).slice(0, MAX_FAST_TITLE_CHARS);
  const task = { id: FAST_TASK_ID, title, prompt: request, cwd: input.repoRoot, allowedPaths: [triage.path], complexity: "low" as const };
  return { status: "planned", tasks: [task], intent: { goal: title, assumptions: [], risks: [] }, contract: null, baseRef: undefined };
}

export async function planTasks(
  input: PlanningInput & { readonly ledger: Ledger; readonly rungs: readonly VerificationRung[] },
): Promise<PlanningOutcome> {
  const [greenfield, projectSkills] = await Promise.all([
    input.kind === "greenfield" ? prepareGreenfield(input, input.runTurn, input.signal) : null,
    discoverSkills(SKILL_DIRS.map((dir) => join(input.repoRoot, dir))),
  ]);
  if (greenfield && !greenfield.ok) return { status: "refused", reason: greenfield.reason };
  const base = greenfield?.ok ? greenfield.value : null;
  const skills = buildSkillRegistry(projectSkills);

  const outcome = await createPlan({
    request: input.request,
    kind: input.kind,
    rungs: input.rungs,
    blueprint: base?.blueprint ?? null,
    contract: base?.contract ?? null,
    projectContext: input.projectContext ?? null,
    employees: input.employeeRoster ?? null,
    skillCatalog: renderSkillCatalog(skills),
    engineCatalog: renderEngineCatalog(input.engineCandidates),
    employeeIds: input.employeeIds ?? null,
    skillNames: skills.skills.map((skill) => skill.name),
    engineIds: engineIdsOf(input.engineCandidates),
    cwd: input.repoRoot,
    runTurn: input.runTurn,
    reviewTurn: input.reviewTurn,
    signal: input.signal,
  });
  if (!outcome.ok) {
    return { status: "refused", reason: `The plan was invalid twice: ${outcome.issues.slice(0, MAX_LISTED_ISSUES).join("; ")}` };
  }
  const classification = outcome.plan.status === "ready" ? outcome.plan.classification : null;
  input.ledger.append("plan.reviewed", {
    attempts: outcome.attempts,
    classification: classification && { ...classification, domains: [...classification.domains] },
    warnings: [...outcome.warnings],
    critique: outcome.critique && {
      outcome: outcome.critique.outcome,
      issues: outcome.critique.issues.map((issue) => ({ type: issue.type, taskIds: [...issue.taskIds], reason: issue.reason })),
    },
  });
  if (outcome.plan.status === "no-change-needed") return { status: "no-change-needed", reason: outcome.plan.reason };
  const note = base ? buildContractWorkerNote(base.contractShape) : null;
  const tasks = base && note
    ? lockContract(outcome.plan.tasks).map((task) => ({ ...task, prompt: `${task.prompt}\n\n${note}` }))
    : outcome.plan.tasks;
  return { status: "planned", tasks, intent: outcome.plan.intent, contract: base?.contractShape ?? null, baseRef: base?.baseRef };
}
