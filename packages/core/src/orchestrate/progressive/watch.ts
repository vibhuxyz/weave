import type { Ledger } from "../../shared/index.ts";
import type { PoolSession } from "../../pool/index.ts";
import type { PlanningOutcome } from "../types.ts";
import { areasForPaths, assessParallelism } from "./assess.ts";
import { DIRECT_TASK_ID, ONE_AREA_REASON } from "./constants.ts";
import { planTrigger } from "./detect.ts";
import { renderFindings } from "./findings.ts";
import { expandWithRepair } from "./repair.ts";
import type { Assessment, Expansion, OrchestrationPhase, RankedPath, WorkspaceRef } from "./types.ts";

const MAX_TOUCHED = 20;

type Planned = Extract<PlanningOutcome, { status: "planned" }>;

export interface ProgressiveSnapshot {
  readonly workspaces: readonly WorkspaceRef[];
  readonly files: readonly RankedPath[];
}

export interface WatchInput {
  readonly request: string;
  readonly ledger: Ledger;
  readonly signal?: AbortSignal;
  readonly session: Promise<PoolSession>;
  readonly done: Promise<void>;
  readonly snapshot: Promise<ProgressiveSnapshot>;
  readonly plan: (notes: string) => Promise<PlanningOutcome>;
  readonly expand: (planned: Planned, touched: readonly string[]) => Promise<Expansion>;
  readonly onPending: (work: Promise<void>) => void;
}

interface SplitRequest {
  current: boolean;
  reason: string | null;
}

function remember(touched: string[], paths: readonly string[]): void {
  for (const path of paths) {
    if (touched.length >= MAX_TOUCHED || touched.includes(path)) continue;
    touched.push(path);
  }
}

function stayNote(ledger: Ledger, reason: string, noted: { current: boolean }): void {
  if (noted.current) return;
  noted.current = true;
  ledger.append("plan.triaged", { route: "fast", reason, plannerEngineId: null, reviewerEngineId: null });
}

async function step(input: WatchInput, session: PoolSession, phase: { current: OrchestrationPhase }, attempts: { current: number }, touched: readonly string[], noted: { current: boolean }, split: SplitRequest): Promise<void> {
  if (input.signal?.aborted || !session.isOpen(DIRECT_TASK_ID) || phase.current === "expanded" || phase.current === "planning") return;
  const shot = await input.snapshot;
  const assessment: Assessment = assessParallelism({ request: input.request, workspaces: shot.workspaces, files: shot.files });
  const discovered = areasForPaths(touched, shot.workspaces);
  const reason = planTrigger({ assessment, discovered, phase: phase.current, attempts: attempts.current, isSplitSuggested: split.current });
  if (!reason) {
    if (assessment.decision === "stay") stayNote(input.ledger, assessment.reason || ONE_AREA_REASON, noted);
    return;
  }
  phase.current = "planning";
  split.current = false;
  attempts.current += 1;
  const expanded = await expandWithRepair({
    ledger: input.ledger,
    attempts,
    notes: renderFindings([...assessment.areas, ...discovered], touched, split.reason),
    canContinue: () => !input.signal?.aborted,
    plan: input.plan,
    expand: (planned) => input.expand(planned, touched),
  });
  phase.current = expanded ? "expanded" : "stayed";
}

export async function watchProgressive(input: WatchInput): Promise<void> {
  const session = await input.session;
  const touched: string[] = [];
  const phase: { current: OrchestrationPhase } = { current: "direct" };
  const attempts = { current: 0 };
  const noted = { current: false };
  const split: SplitRequest = { current: false, reason: null };
  let tail: Promise<void> = Promise.resolve();
  const consider = (): void => {
    tail = tail.then(() => step(input, session, phase, attempts, touched, noted, split)).catch((error: unknown) => {
      phase.current = phase.current === "planning" ? "stayed" : phase.current;
      input.ledger.append("error", { where: "progressive", message: error instanceof Error ? error.message : String(error) });
    });
    input.onPending(tail);
  };
  const stop = input.ledger.subscribe((event) => {
    if (event.taskId !== DIRECT_TASK_ID) return;
    if (event.type === "scope.expanded") remember(touched, event.paths);
    else if (event.type === "split.suggested") {
      remember(touched, event.areas);
      split.current = true;
      split.reason = event.reason;
    } else return;
    consider();
  });
  consider();
  await input.done;
  await tail;
  stop();
}
