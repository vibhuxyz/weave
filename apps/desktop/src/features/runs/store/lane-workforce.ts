import type { RunUpdate } from "../../../../server/index.ts";
import { MAX_LANE_AWAITED, MAX_LANE_NOTES } from "../constants";
import type { AwaitedOutput, Lane, LaneNote } from "../types";

export type WorkforceLaneUpdate = Extract<RunUpdate, { readonly kind: "employee-assigned" | "employee-verified" | "claimed" | "blocked" | "dependency-added" | "note" | "subtask" | "artifact" | "awaiting" | "awaited-arrived" }>;

function withNote(lane: Lane, note: Omit<LaneNote, "id">): Lane {
  return { ...lane, notes: [...lane.notes, { ...note, id: lane.noteCount }].slice(-MAX_LANE_NOTES), noteCount: lane.noteCount + 1 };
}

function withMilestone(lane: Lane, subtask: string, index: number | null): Lane {
  if (index === null) return withNote(lane, { tone: "info", text: `Finished ${subtask}, which was not one of its milestones` });
  const declared = lane.subtasks[index];
  if (declared === undefined || lane.subtasksDone.includes(declared)) return lane;
  return { ...lane, subtasksDone: [...lane.subtasksDone, declared] };
}

function withAwaited(lane: Lane, awaiting: AwaitedOutput): Lane {
  const known = lane.awaited.some((entry) => entry.output === awaiting.output && entry.producer === awaiting.producer);
  const awaited = known
    ? lane.awaited.map((entry) => (entry.output === awaiting.output && entry.producer === awaiting.producer ? awaiting : entry))
    : [...lane.awaited, awaiting].slice(-MAX_LANE_AWAITED);
  return { ...lane, awaited };
}

function withArrival(lane: Lane, output: string, producer: string): Lane {
  const matches = (entry: AwaitedOutput): boolean => entry.output === output && (entry.producer === null || entry.producer === producer);
  const arrived: AwaitedOutput = { output, producer, hasArrived: true };
  const awaited = lane.awaited.some(matches)
    ? lane.awaited.map((entry) => (matches(entry) ? arrived : entry))
    : [...lane.awaited, arrived].slice(-MAX_LANE_AWAITED);
  return { ...lane, awaited };
}

function withDependency(lane: Lane, on: string, reason: string): Lane {
  const dependsOn = lane.dependsOn.includes(on) ? lane.dependsOn : [...lane.dependsOn, on];
  return withNote({ ...lane, dependsOn }, { tone: "info", text: `Now waits for ${on}: ${reason}` });
}

export function applyWorkforceUpdate(lane: Lane, update: WorkforceLaneUpdate): Lane {
  switch (update.kind) {
    case "employee-assigned":
      return { ...lane, employee: { employeeId: update.employeeId, reasons: update.reasons } };
    case "employee-verified":
      return { ...lane, verification: { ok: update.ok, rungs: update.rungs, detail: update.detail } };
    case "claimed":
      return { ...lane, claims: update.resources, blockedReason: null };
    case "blocked":
      return { ...lane, blockedReason: update.reason };
    case "dependency-added":
      return withDependency(lane, update.on, update.reason);
    case "note":
      return withNote(lane, { tone: update.tone, text: update.text });
    case "subtask":
      return withMilestone(lane, update.subtask, update.index);
    case "artifact":
      return withNote(lane, { tone: "info", text: `Published ${update.artifact.kind} ${update.artifact.name} v${update.artifact.version}` });
    case "awaiting":
      return withAwaited(lane, { output: update.output, producer: update.producer, hasArrived: false });
    case "awaited-arrived":
      return withArrival(lane, update.output, update.producer);
    default: {
      const unreachable: never = update;
      return unreachable;
    }
  }
}
