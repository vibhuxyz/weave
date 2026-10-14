import { rejectionEvent } from "../../planner/index.ts";
import type { Ledger } from "../../shared/index.ts";
import type { PlanningOutcome } from "../types.ts";
import { MAX_PLAN_ATTEMPTS } from "./constants.ts";
import type { Expansion } from "./types.ts";

const MAX_REPAIR_NOTE_CHARS = 1_500;

type Planned = Extract<PlanningOutcome, { status: "planned" }>;

export async function expandWithRepair(input: {
  readonly ledger: Ledger;
  readonly attempts: { current: number };
  readonly notes: string;
  readonly canContinue: () => boolean;
  readonly plan: (notes: string) => Promise<PlanningOutcome>;
  readonly expand: (planned: Planned) => Promise<Expansion>;
}): Promise<boolean> {
  const first = await input.plan(input.notes);
  if (!input.canContinue() || first.status !== "planned") return false;
  const expanded = await input.expand(first);
  if (expanded.ok) return true;
  if (!expanded.canRepair || input.attempts.current >= MAX_PLAN_ATTEMPTS || !input.canContinue()) {
    input.ledger.append("plan.rejected", rejectionEvent(expanded.reasons, false));
    return false;
  }
  input.ledger.append("plan.rejected", rejectionEvent(expanded.reasons, true));
  input.attempts.current += 1;
  const repaired = await input.plan(repairNotes(input.notes, expanded.reasons));
  if (!input.canContinue() || repaired.status !== "planned") return false;
  const second = await input.expand(repaired);
  if (second.ok) return true;
  input.ledger.append("plan.rejected", rejectionEvent(second.reasons, false));
  return false;
}

function repairNotes(notes: string, reasons: readonly string[]): string {
  const body = reasons.map((reason) => `- ${reason}`).join("\n");
  const clipped = body.length <= MAX_REPAIR_NOTE_CHARS ? body : `${body.slice(0, MAX_REPAIR_NOTE_CHARS)}…`;
  return `${notes}\n\nThe previous plan was rejected:\n${clipped}\nReturn a plan that fixes every rejection.`;
}
