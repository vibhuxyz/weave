import type { TaskState, ToolCallRef } from "@weave/protocol";
import { MAX_DISCOVERIES, MAX_FAILURES } from "./constants.ts";
import { READ_KINDS, WRITE_KINDS, type PlanUpdateLike, type ToolCallStatusUpdateLike, type ToolCallUpdateLike } from "./types.ts";

function pushUnique(list: string[], value: string): void {
  if (!list.includes(value)) list.push(value);
}

function applyLocations(state: TaskState, kind: string | undefined | null, locations: readonly string[]): void {
  if (!kind || locations.length === 0) return;
  if (READ_KINDS.has(kind)) for (const path of locations) pushUnique(state.filesRead, path);
  else if (WRITE_KINDS.has(kind)) for (const path of locations) pushUnique(state.changedFiles.modified, path);
  else if (kind === "delete") for (const path of locations) pushUnique(state.changedFiles.deleted, path);
}

function recordFailedTool(state: TaskState, title: string, seq: number): void {
  if (state.failures.length < MAX_FAILURES) state.failures.push({ kind: "tool", message: `${title} failed`, where: "tool", atSeq: seq });
}

export function foldToolCall(state: TaskState, open: Map<string, ToolCallRef>, seq: number, update: ToolCallUpdateLike): void {
  const ref: ToolCallRef = { toolCallId: update.toolCallId, title: update.title, kind: update.kind, locations: (update.locations ?? []).map((location) => location.path), startedAtSeq: seq };
  state.engineState.turns += 1;
  open.set(update.toolCallId, ref);
  applyLocations(state, update.kind, ref.locations);
  if (update.kind === "search" && state.discoveries.length < MAX_DISCOVERIES) state.discoveries.push({ text: `Searched: ${update.title}`, source: "tool", atSeq: seq });
  if (update.status === "failed") recordFailedTool(state, update.title, seq);
  if (update.status === "completed" || update.status === "failed") open.delete(update.toolCallId);
}

export function foldToolCallUpdate(state: TaskState, open: Map<string, ToolCallRef>, seq: number, update: ToolCallStatusUpdateLike): void {
  const existing = open.get(update.toolCallId);
  const locations = update.locations?.map((location) => location.path) ?? existing?.locations ?? [];
  const kind = update.kind ?? existing?.kind;
  if (update.locations) applyLocations(state, kind, locations);
  if (update.status === "failed") recordFailedTool(state, update.title ?? existing?.title ?? update.toolCallId, seq);
  if (update.status === "completed" || update.status === "failed") {
    open.delete(update.toolCallId);
    return;
  }
  if (existing) open.set(update.toolCallId, { ...existing, title: update.title ?? existing.title, kind: kind ?? undefined, locations });
}

export function foldPlan(state: TaskState, update: PlanUpdateLike): void {
  const entries = update.entries ?? [];
  state.completed = entries.filter((entry) => entry.status === "completed").map((entry) => entry.content);
  state.currentStep = entries.find((entry) => entry.status === "in_progress")?.content ?? null;
  state.remaining = entries.filter((entry) => entry.status === "pending").map((entry) => entry.content);
  state.nextStep = state.remaining[0] ?? null;
}

export function recordRead(state: TaskState, path: string): void {
  pushUnique(state.filesRead, path);
}

export function recordWrite(state: TaskState, path: string): void {
  pushUnique(state.changedFiles.modified, path);
}
