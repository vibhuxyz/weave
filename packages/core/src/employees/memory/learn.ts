import { extractTaskNotes } from "../../state/index.ts";
import { flatten } from "../../shared/index.ts";
import { MAX_MEMORY_TEXT_CHARS } from "./constants.ts";
import type { MemoryEntry } from "./types.ts";

export interface SettledWork {
  readonly runId: string;
  readonly taskId: string;
  readonly title: string;
  readonly status: string;
  readonly reason: string | null;
  readonly finalMessage: string | null;
  readonly at: string;
}

function clip(text: string): string {
  return flatten(text).slice(0, MAX_MEMORY_TEXT_CHARS);
}

export function memoriesFrom(work: SettledWork): readonly MemoryEntry[] {
  const base = { at: work.at, runId: work.runId, taskId: work.taskId };
  const isOk = work.status === "ok";
  const outcome: MemoryEntry = { ...base, kind: isOk ? "outcome" : "failure", text: clip(`${work.title}: ${work.status}${work.reason ? ` — ${work.reason}` : ""}`) };
  const notes = extractTaskNotes(work.finalMessage ?? "");
  return [
    outcome,
    ...notes.decisions.map((text): MemoryEntry => ({ ...base, kind: "decision", text: clip(text) })),
    ...notes.discoveries.map((text): MemoryEntry => ({ ...base, kind: "discovery", text: clip(text) })),
  ];
}
