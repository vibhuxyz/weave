import type { TaskState, WeaveEvent } from "@weave/protocol";
import { writeCheckpoint } from "../checkpoint/index.ts";
import { briefOf } from "../handoff/index.ts";
import { readLedger } from "../shared/index.ts";
import { foldTaskState } from "../state/index.ts";
import { buildWorkerContext } from "../worker-context/index.ts";
import { afterAttempt } from "./lifecycle.ts";
import type { AttemptOutcome, AttemptRecord, RelayOptions, RelayResult } from "./types.ts";

const DEFAULT_MAX_ATTEMPTS = 4;
const FALLBACK_BRIEF_BYTES = 4_000;

async function currentState(options: RelayOptions): Promise<TaskState> {
  const { task, ledger, weaveDir, model } = options;
  const events = (await readLedger(weaveDir, ledger.runId)).filter((event: WeaveEvent) => event.taskId === task.id);
  const dependencies = (task.dependencies ?? []).map((dependency) => ({ task: dependency.task, requiredOutputs: [...(dependency.requiredOutputs ?? [])] }));
  return foldTaskState(events, task.prompt, task.id, { dependencies, contextVersion: model?.revision ?? null });
}

async function promptFor(options: RelayOptions, state: TaskState | null): Promise<string> {
  const { task, model } = options;
  if (!model) return state ? `${task.prompt}\n\n<task-state>\n${briefOf(state, FALLBACK_BRIEF_BYTES)}\n</task-state>` : task.prompt;
  const context = await buildWorkerContext({
    root: task.cwd,
    model,
    state,
    task: { id: task.id, goal: task.prompt, allowedPaths: task.allowedPaths, readOnlyPaths: task.readOnlyPaths, dependencies: task.dependencies?.map((dependency) => ({ task: dependency.task, requiredOutputs: [...(dependency.requiredOutputs ?? [])] })) },
  });
  return context.prompt;
}

function withBriefing(prompt: string, briefing: string | undefined): string {
  return briefing ? `${prompt}\n\n${briefing}` : prompt;
}

function finish(status: RelayResult["status"], attempts: readonly AttemptRecord[], state: TaskState, last: AttemptOutcome | null): RelayResult {
  return { status, attempts, state, finalMessage: last?.finalMessage ?? "", error: last?.error ?? null };
}

export async function relayTask(options: RelayOptions): Promise<RelayResult> {
  const { task, engines, ledger, weaveDir, runAttempt, signal } = options;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const attempts: AttemptRecord[] = [];
  let engineCursor = 0;
  let last: AttemptOutcome | null = null;
  for (let attemptIndex = 0; attemptIndex < maxAttempts; attemptIndex += 1) {
    const engineId = engines[engineCursor];
    if (!engineId) break;
    const resumed = attemptIndex === 0 ? null : await currentState(options);
    const prompt = withBriefing(await promptFor(options, resumed), options.briefing);
    ledger.append("attempt.started", { taskId: task.id, attemptIndex, engineId, sessionId: "" });
    last = await runAttempt({ engineId, attemptIndex, task: { ...task, prompt }, ledger, signal });
    const { move, reason } = afterAttempt(last);
    attempts.push({ engineId, status: last.status, endedBy: reason, contextBytes: Buffer.byteLength(prompt, "utf8") });
    if (move === "done") return finish("ok", attempts, await currentState(options), last);
    ledger.append("attempt.ended", { taskId: task.id, attemptIndex, endedBy: reason ?? "explicit_handoff" });
    const state = await currentState(options);
    if (reason) await writeCheckpoint(weaveDir, task.id, state, reason);
    if (move === "stop") return finish("cancelled", attempts, state, last);
    if (move === "next-engine") engineCursor += 1;
  }
  return finish("failed", attempts, await currentState(options), last);
}
