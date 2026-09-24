import type { VerificationRung } from "@weave/protocol";
import { buildContractWorkerNote, lockContract } from "../contracts/index.ts";
import { createPlan } from "../planner/index.ts";
import type { Ledger } from "../shared/index.ts";
import { prepareGreenfield } from "./greenfield.ts";
import type { PlanningInput, PlanningOutcome } from "./types.ts";

const MAX_LISTED_ISSUES = 20;

export async function planTasks(
  input: PlanningInput & { readonly ledger: Ledger; readonly rungs: readonly VerificationRung[] },
): Promise<PlanningOutcome> {
  const greenfield = input.kind === "greenfield" ? await prepareGreenfield(input, input.runTurn, input.signal) : null;
  if (greenfield && !greenfield.ok) return { status: "refused", reason: greenfield.reason };
  const base = greenfield?.ok ? greenfield.value : null;

  const outcome = await createPlan({
    request: input.request,
    kind: input.kind,
    rungs: input.rungs,
    blueprint: base?.blueprint ?? null,
    contract: base?.contract ?? null,
    projectContext: input.projectContext ?? null,
    cwd: input.repoRoot,
    runTurn: input.runTurn,
    signal: input.signal,
  });
  if (!outcome.ok) {
    return { status: "refused", reason: `The plan was invalid twice: ${outcome.issues.slice(0, MAX_LISTED_ISSUES).join("; ")}` };
  }
  if (outcome.plan.status === "no-change-needed") return { status: "no-change-needed", reason: outcome.plan.reason };
  const note = base ? buildContractWorkerNote(base.contractShape) : null;
  const tasks = base && note
    ? lockContract(outcome.plan.tasks).map((task) => ({ ...task, prompt: `${task.prompt}\n\n${note}` }))
    : outcome.plan.tasks;
  return { status: "planned", tasks, contract: base?.contractShape ?? null, baseRef: base?.baseRef };
}
