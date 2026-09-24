import type { GitState, TaskDependencyRef, TaskState, ToolCallRef, WeaveEvent } from "@weave/protocol";
import { EMPTY_ENGINE_STATE, EMPTY_GIT_STATE } from "@weave/protocol";
import { MAX_DISCOVERIES, MAX_FAILURES, MAX_MESSAGE_BUFFER_CHARS, MAX_NOTES_PER_KIND } from "./constants.ts";
import { foldLifecycle } from "./fold-engine.ts";
import { foldPlan, foldToolCall, foldToolCallUpdate, recordRead, recordWrite } from "./fold-tools.ts";
import { extractTaskNotes } from "./notes.ts";
import type { PlanUpdateLike, ToolCallStatusUpdateLike, ToolCallUpdateLike } from "./types.ts";

export type { PlanUpdateLike, ToolCallStatusUpdateLike, ToolCallUpdateLike } from "./types.ts";

export interface FoldOptions {
  readonly dependencies?: readonly TaskDependencyRef[];
  readonly contextVersion?: number | null;
  readonly gitState?: GitState;
}

export function emptyTaskState(taskId: string, goal: string, options: FoldOptions = {}): TaskState {
  return {
    schemaVersion: 2,
    taskId,
    goal,
    atSeq: 0,
    status: "pending",
    completed: [],
    currentStep: null,
    nextStep: null,
    remaining: [],
    decisions: [],
    discoveries: [],
    changedFiles: { modified: [], created: [], deleted: [] },
    filesRead: [],
    failures: [],
    verification: [],
    commands: [],
    openQuestions: [],
    dependencies: (options.dependencies ?? []).map((dependency) => ({ task: dependency.task, requiredOutputs: [...dependency.requiredOutputs] })),
    contextVersion: options.contextVersion ?? null,
    gitState: options.gitState ?? EMPTY_GIT_STATE,
    engineState: { ...EMPTY_ENGINE_STATE },
    inFlight: [],
  };
}

function flushNotes(state: TaskState, message: string, seq: number): void {
  const notes = extractTaskNotes(message);
  for (const text of notes.decisions) if (state.decisions.length < MAX_NOTES_PER_KIND) state.decisions.push({ description: text, claimed: true, atSeq: seq });
  for (const text of notes.discoveries) if (state.discoveries.length < MAX_DISCOVERIES) state.discoveries.push({ text, source: "worker", atSeq: seq });
  for (const text of notes.openQuestions) if (state.openQuestions.length < MAX_NOTES_PER_KIND) state.openQuestions.push({ text, atSeq: seq });
}

function foldVerification(state: TaskState, event: Extract<WeaveEvent, { type: "verification.rung" }>): void {
  state.commands.push({ command: event.command, ok: event.ok, wallMs: event.wallMs, output: event.output });
  state.verification.push({ rung: event.rung, status: event.ok ? "passed" : "failed", wallMs: event.wallMs });
  if (!event.ok && state.failures.length < MAX_FAILURES) state.failures.push({ kind: "verification", message: `${event.rung} failed: ${event.command}`, where: "verification", atSeq: event.seq });
}

function sessionUpdateKind(raw: unknown): string | null {
  const kind = (raw as { sessionUpdate?: unknown } | null)?.sessionUpdate;
  return typeof kind === "string" ? kind : null;
}

function chunkText(raw: unknown): string {
  const content = (raw as { content?: { type?: unknown; text?: unknown } } | null)?.content;
  return content?.type === "text" && typeof content.text === "string" ? content.text : "";
}

export function foldTaskState(events: readonly WeaveEvent[], goal: string, taskId: string, options: FoldOptions = {}): TaskState {
  const state = emptyTaskState(taskId, goal, options);
  const open = new Map<string, ToolCallRef>();
  const buffer = { text: "", seq: 0 };
  const flush = () => {
    if (buffer.text) flushNotes(state, buffer.text, buffer.seq);
    buffer.text = "";
  };
  for (const event of events) {
    state.atSeq = event.seq;
    if (foldLifecycle(state, event)) continue;
    if (event.type === "file.read") recordRead(state, event.path);
    if (event.type === "file.written") recordWrite(state, event.path);
    if (event.type === "verification.rung") foldVerification(state, event);
    if (event.type !== "agent.message") continue;
    const kind = sessionUpdateKind(event.update);
    if (kind === "agent_message_chunk") {
      buffer.text = (buffer.text + chunkText(event.update)).slice(-MAX_MESSAGE_BUFFER_CHARS);
      buffer.seq = event.seq;
    }
    if (kind === "tool_call") {
      flush();
      foldToolCall(state, open, event.seq, event.update as ToolCallUpdateLike);
    }
    if (kind === "tool_call_update") foldToolCallUpdate(state, open, event.seq, event.update as ToolCallStatusUpdateLike);
    if (kind === "plan") foldPlan(state, event.update as PlanUpdateLike);
  }
  flush();
  state.inFlight = [...open.values()];
  return state;
}
