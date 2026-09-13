/**
 * The fold: `events.ndjson` → `TaskState`. CONTINUATION.md §4, Slice 2.
 *
 * `foldTaskState` is pure — no I/O, no `Date.now()`, no randomness. Same
 * events in, same state out, forever. That is what makes a checkpoint just
 * `{ seq, foldTaskState(events.slice(0, seq)) }`, and what makes a killed
 * process recoverable: whatever reached the ledger can be folded, no matter
 * how the process died.
 *
 * §12(A) — where do `decisions` come from: **nowhere, in this slice.**
 * Nothing in ACP emits intent, and the other two options both require I/O
 * (asking the engine, or a summarisation call), which a pure fold cannot do.
 * `decisions` stays `[]` here; if a later slice wants rank-3 narrative it is
 * a separate, non-pure step run at checkpoint time, not a change to this
 * function's contract. Rank 1 (`git`) is the same story — see
 * `EMPTY_GIT_STATE`'s doc comment.
 */

import type {
  CommandResult,
  ErrorRecord,
  ToolCallRef,
  VerificationResult,
  WeaveEvent,
} from "@weave/protocol";
import { EMPTY_GIT_STATE } from "@weave/protocol";
import type { TaskState } from "@weave/protocol";

/** The subset of ACP's `SessionUpdate` this fold reads. Kept structural
 * (not imported from the ACP SDK) so this file has zero runtime deps beyond
 * `@weave/protocol`, matching every other `agent.message` reader. */
type ToolCallUpdateLike = {
  sessionUpdate: "tool_call";
  toolCallId: string;
  title: string;
  kind?: string;
  status?: string;
  locations?: Array<{ path: string }>;
};
type ToolCallStatusUpdateLike = {
  sessionUpdate: "tool_call_update";
  toolCallId: string;
  title?: string | null;
  kind?: string | null;
  status?: string | null;
  locations?: Array<{ path: string }> | null;
};
type PlanUpdateLike = {
  sessionUpdate: "plan";
  entries: Array<{ content: string; status: "pending" | "in_progress" | "completed" }>;
};

const READ_KINDS = new Set(["read", "search", "fetch"]);
const WRITE_KINDS = new Set(["edit", "move"]);

function pushUnique(arr: string[], value: string): void {
  if (!arr.includes(value)) arr.push(value);
}

/** Fold one run's ledger into a `TaskState`. `goal` is the task's original
 * request (`TaskRecord.goal`), passed in rather than derived because not
 * every event stream starts with a `task.started` for it (e.g. a slice
 * bounded by `seq`, mid-task). */
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

  // toolCallId -> in-flight ref, mutated as tool_call / tool_call_update
  // events refine title/kind/locations. Deleted on a terminal status.
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
    case "tool_call": {
      const update = raw as ToolCallUpdateLike;
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
      break;
    }

    case "tool_call_update": {
      const update = raw as ToolCallStatusUpdateLike;
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
      // A tool_call_update whose tool_call was never seen (a ledger slice
      // that starts mid-call, or a replayed session) has nothing to refine —
      // deliberately dropped rather than fabricating a start seq for it.
      break;
    }

    case "plan": {
      // The stable `plan` update always carries the complete entry list —
      // this fold replaces state wholesale rather than accumulating, which
      // is what makes re-running it on a fuller event list idempotent.
      const update = raw as PlanUpdateLike;
      const entries = update.entries ?? [];
      state.completed = entries.filter((e) => e.status === "completed").map((e) => e.content);
      const inProgress = entries.find((e) => e.status === "in_progress");
      state.inProgress = inProgress ? { description: inProgress.content } : null;
      state.remaining = entries.filter((e) => e.status === "pending").map((e) => e.content);
      break;
    }

    default:
      break;
  }
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
