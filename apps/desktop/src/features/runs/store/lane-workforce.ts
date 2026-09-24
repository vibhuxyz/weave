import type { RunUpdate } from "../../../../server/index.ts";
import { MAX_LANE_NOTES } from "../constants";
import type { Lane, LaneNote } from "../types";

export type WorkforceLaneUpdate = Extract<RunUpdate, { readonly kind: "employee-assigned" | "employee-verified" | "claimed" | "blocked" | "dependency-added" | "note" }>;

function withNote(lane: Lane, note: Omit<LaneNote, "id">): Lane {
  return { ...lane, notes: [...lane.notes, { ...note, id: lane.noteCount }].slice(-MAX_LANE_NOTES), noteCount: lane.noteCount + 1 };
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
    default: {
      const unreachable: never = update;
      return unreachable;
    }
  }
}
