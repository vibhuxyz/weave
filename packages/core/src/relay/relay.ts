import type { TaskState, WeaveEvent } from "@weave/protocol";
import { writeCheckpoint } from "../checkpoint/index.ts";
import { reportedSubtasks } from "../coordination/index.ts";
import { briefOf } from "../handoff/index.ts";
import { isNotFound, readLedger } from "../shared/index.ts";
import { foldTaskState } from "../state/index.ts";
import { buildWorkerContext } from "../worker-context/index.ts";
import { afterAttempt } from "./lifecycle.ts";
import type { AttemptOutcome, AttemptRecord, RelayOptions, RelayResult } from "./types.ts";

const DEFAULT_MAX_ATTEMPTS = 4;
const FALLBACK_BRIEF_BYTES = 4_000;

async function taskEvents(options: RelayOptions): Promise<readonly WeaveEvent[]> {
  const { task, ledger, weaveDir } = options;
  const events = await readLedger(weaveDir, ledger.runId).catch((error: unknown): readonly WeaveEvent[] => {
    if (isNotFound(error)) return [];
    throw error;
  });
  return events.filter((event: WeaveEvent) => event.taskId === task.id);
}

function stateFrom(options: RelayOptions, events: readonly WeaveEvent[]): TaskState {
  const { task, model } = options;
  const dependencies = (task.dependencies ?? []).map((dependency) => ({ task: dependency.task, requiredOutputs: [...(dependency.requiredOutputs ?? [])] }));
  return foldTaskState(events, task.prompt, task.id, { dependencies, contextVersion: model?.revision ?? null });
}

async function currentState(options: RelayOptions): Promise<TaskState> {
  return stateFrom(options, await taskEvents(options));
}

interface AttemptContext {
  readonly state: TaskState | null;
  readonly subtasksDone: readonly string[];
  readonly engineId: string;
}

async function promptFor(options: RelayOptions, attempt: AttemptContext): Promise<string> {
  const { task, model } = options;
  const { state, subtasksDone, engineId } = attempt;
  if (!model) return state ? `${task.prompt}\n\n<task-state>\n${briefOf(state, FALLBACK_BRIEF_BYTES, engineId)}\n</task-state>` : task.prompt;
  const context = await buildWorkerContext({
    root: task.cwd,
    model,
    state,
    engineId,
    task: { id: task.id, goal: task.prompt, allowedPaths: task.allowedPaths, readOnlyPaths: task.readOnlyPaths, produces: task.produces, subtasks: task.subtasks, subtasksDone, skills: task.skills, verify: task.verify, verifyRung: task.verifyRung, dependencies: task.dependencies?.map((dependency) => ({ task: dependency.task, requiredOutputs: [...(dependency.requiredOutputs ?? [])] })) },
  });
  if (state === null && context.unknownSkills.length > 0) {
    options.ledger.append("error", { where: "worker-context.skills", message: `Task ${task.id} asked for unknown skills: ${context.unknownSkills.join(", ")}` });
  }
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
    const events = await taskEvents(options);
    const resumed = attemptIndex === 0 ? null : stateFrom(options, events);
    const prompt = withBriefing(await promptFor(options, { state: resumed, subtasksDone: reportedSubtasks(events, task.id), engineId }), options.briefing);
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
