import type {
  CommandResult,
  ErrorRecord,
  ToolCallRef,
  VerificationResult,
  WeaveEvent,
} from "@weave/protocol";
import { EMPTY_GIT_STATE } from "@weave/protocol";
import type { TaskState } from "@weave/protocol";
import {
  READ_KINDS,
  WRITE_KINDS,
  type PlanUpdateLike,
  type ToolCallStatusUpdateLike,
  type ToolCallUpdateLike,
} from "./types.ts";

export type { PlanUpdateLike, ToolCallStatusUpdateLike, ToolCallUpdateLike } from "./types.ts";

function pushUnique(arr: string[], value: string): void {
  if (!arr.includes(value)) arr.push(value);
}

export function foldTaskState(events: readonly WeaveEvent[], goal: string, taskId: string): TaskState {
  const state: TaskState = {
    schemaVersion: 1,
    taskId,
    goal,
    atSeq: 0,
    completed: [],
    inProgress: null,
    remaining: [],
    files: { read: [], modified: [], created: [], deleted: [] },
    commands: [],
    verification: [],
    decisions: [],
    errors: [],
    inFlight: [],
    git: EMPTY_GIT_STATE,
  };

  const openToolCalls = new Map<string, ToolCallRef>();

  for (const event of events) {
    state.atSeq = event.seq;

    switch (event.type) {
      case "agent.message":
        foldSessionUpdate(state, openToolCalls, event.seq, event.update);
        break;

      case "file.read":
        pushUnique(state.files.read, event.path);
        break;

      case "file.written":
        pushUnique(state.files.modified, event.path);
        break;

      case "verification.rung": {
        const command: CommandResult = {
          command: event.command,
          ok: event.ok,
          wallMs: event.wallMs,
          output: event.output,
        };
        state.commands.push(command);
        const result: VerificationResult = {
          rung: event.rung,
          status: event.ok ? "passed" : "failed",
          wallMs: event.wallMs,
        };
        state.verification.push(result);
        break;
      }

      case "error": {
        const error: ErrorRecord = { message: event.message, where: event.where, atSeq: event.seq };
        state.errors.push(error);
        break;
      }

      default:
        break;
    }
  }

  state.inFlight = [...openToolCalls.values()];
  return state;
}

function foldSessionUpdate(
  state: TaskState,
  openToolCalls: Map<string, ToolCallRef>,
  seq: number,
  raw: unknown,
): void {
  const kindOf = (raw as { sessionUpdate?: unknown })?.sessionUpdate;
  if (typeof kindOf !== "string") return;

  switch (kindOf) {
    case "tool_call":
      foldToolCall(state, openToolCalls, seq, raw as ToolCallUpdateLike);
      break;
    case "tool_call_update":
      foldToolCallUpdate(state, openToolCalls, raw as ToolCallStatusUpdateLike);
      break;
    case "plan":
      foldPlan(state, raw as PlanUpdateLike);
      break;
    default:
      break;
  }
}

function foldToolCall(
  state: TaskState,
  openToolCalls: Map<string, ToolCallRef>,
  seq: number,
  update: ToolCallUpdateLike,
): void {
  const ref: ToolCallRef = {
    toolCallId: update.toolCallId,
    title: update.title,
    kind: update.kind,
    locations: (update.locations ?? []).map((l) => l.path),
    startedAtSeq: seq,
  };
  openToolCalls.set(update.toolCallId, ref);
  applyLocations(state, update.kind, ref.locations);
  if (update.status === "completed" || update.status === "failed") {
    openToolCalls.delete(update.toolCallId);
  }
}

function foldToolCallUpdate(
  state: TaskState,
  openToolCalls: Map<string, ToolCallRef>,
  update: ToolCallStatusUpdateLike,
): void {
  const existing = openToolCalls.get(update.toolCallId);
  const locations = update.locations?.map((l) => l.path) ?? existing?.locations ?? [];
  const kind = update.kind ?? existing?.kind;
  if (update.locations) applyLocations(state, kind, locations);

  if (update.status === "completed" || update.status === "failed") {
    openToolCalls.delete(update.toolCallId);
  } else if (existing) {
    openToolCalls.set(update.toolCallId, {
      ...existing,
      title: update.title ?? existing.title,
      kind,
      locations,
    });
  }
}

function foldPlan(state: TaskState, update: PlanUpdateLike): void {
  const entries = update.entries ?? [];
  state.completed = entries.filter((e) => e.status === "completed").map((e) => e.content);
  const inProgress = entries.find((e) => e.status === "in_progress");
  state.inProgress = inProgress ? { description: inProgress.content } : null;
  state.remaining = entries.filter((e) => e.status === "pending").map((e) => e.content);
}

function applyLocations(state: TaskState, kind: string | undefined | null, locations: string[]): void {
  if (!kind || locations.length === 0) return;
  if (READ_KINDS.has(kind)) {
    for (const path of locations) pushUnique(state.files.read, path);
  } else if (WRITE_KINDS.has(kind)) {
    for (const path of locations) pushUnique(state.files.modified, path);
  } else if (kind === "delete") {
    for (const path of locations) pushUnique(state.files.deleted, path);
  }
}
