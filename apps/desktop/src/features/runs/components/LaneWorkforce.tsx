import { useEmployeeListing } from "@/features/employees";
import { cn } from "@/shared/lib";
import type { AwaitedOutput, Lane, LaneEmployee, MergeResult } from "../types";

const WORKING: ReadonlySet<Lane["status"]> = new Set(["waiting", "running"]);

const VERDICT_CLASS = {
  passed: "text-agent-success",
  failed: "text-agent-critical-fg",
  unverified: "text-agent-warn",
} as const satisfies Record<"passed" | "failed" | "unverified", string>;

function awaitedText(entry: AwaitedOutput): string {
  const from = entry.producer ? ` from ${entry.producer}` : "";
  return entry.hasArrived ? `received ${entry.output}${from}` : `asked for ${entry.output}${from}`;
}

function MilestoneLine({ lane }: { readonly lane: Lane }) {
  const { subtasks, subtasksDone } = lane;
  if (subtasks.length === 0) return null;
  const next = subtasks.find((subtask) => !subtasksDone.includes(subtask));
  return (
    <span className="truncate text-[11px] text-agent-text-muted" title={subtasks.map((subtask) => `${subtasksDone.includes(subtask) ? "done" : "to do"}: ${subtask}`).join("\n")}>
      milestones {subtasksDone.length}/{subtasks.length}
      {next && WORKING.has(lane.status) && ` · next: ${next}`}
    </span>
  );
}

function AwaitedLines({ awaited }: { readonly awaited: readonly AwaitedOutput[] }) {
  if (awaited.length === 0) return null;
  return (
    <ul className="flex flex-col gap-0.5 text-[11px]">
      {awaited.map((entry) => (
        <li key={`${entry.output}:${entry.producer ?? ""}`} className={cn("truncate", entry.hasArrived ? "text-agent-success" : "text-agent-text-muted")}>
          {awaitedText(entry)}
        </li>
      ))}
    </ul>
  );
}

function mergeText(merge: MergeResult): string {
  switch (merge.status) {
    case "merged":
      return merge.checks.length > 0 ? `merged · checked with ${merge.checks.join(", ")}` : "merged · no checks could run";
    case "empty":
      return "nothing to merge: no files changed";
    case "conflict":
    case "merge-error":
    case "verify-failed":
      return `not merged: ${merge.detail}`;
    default: {
      const unreachable: never = merge.status;
      return unreachable;
    }
  }
}

function mergeTone(merge: MergeResult): string {
  if (merge.status === "merged") return merge.checks.length > 0 ? "text-agent-success" : "text-agent-warn";
  return merge.status === "empty" ? "text-agent-text-faint" : "text-agent-critical-fg";
}

function MergeLine({ merge }: { readonly merge: MergeResult }) {
  return <span className={cn("truncate text-[11px]", mergeTone(merge))} title={merge.detail}>{mergeText(merge)}</span>;
}

function EmployeeLine({ employee }: { readonly employee: LaneEmployee }) {
  const listing = useEmployeeListing();
  const reasons = employee.reasons.join("; ");
  if (employee.employeeId === null) return <span className="text-[11px] text-agent-text-faint" title={reasons}>No employee fits: {reasons || "no match"}</span>;
  const id = employee.employeeId;
  const name = listing.status === "ready" ? listing.entries.find((entry) => entry.employee.id === id)?.employee.name : undefined;
  return <span className="text-[11px] text-agent-text-muted" title={reasons}>by {name ?? id}</span>;
}

export function LaneWorkforce({ lane }: { readonly lane: Lane }) {
  const { employee, verification, blockedReason, claims, notes } = lane;
  return (
    <>
      {employee && <EmployeeLine employee={employee} />}
      <MilestoneLine lane={lane} />
      <AwaitedLines awaited={lane.awaited} />
      {blockedReason && WORKING.has(lane.status) && <span className="text-[11px] text-agent-warn">Blocked: {blockedReason}</span>}
      {claims.length > 0 && <span className="truncate font-mono text-[11px] text-agent-text-faint" title={claims.join(", ")}>owns {claims.join(", ")}</span>}
      {verification && (
        <span className={cn("text-[11px]", VERDICT_CLASS[verification.verdict])} title={verification.detail}>
          {verification.verdict === "unverified"
            ? "not verified: no checks could run in this project"
            : `checks ${verification.verdict}: ${verification.rungs.map((rung) => `${rung.rung} ${rung.ok ? "ok" : "failed"}`).join(", ")}`}
        </span>
      )}
      {lane.merge && <MergeLine merge={lane.merge} />}
      {notes.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-[11px]">
          {notes.map((note) => (
            <li key={note.id} className={cn("truncate", note.tone === "warning" ? "text-agent-warn" : "text-agent-text-muted")} title={note.text}>{note.text}</li>
          ))}
        </ul>
      )}
    </>
  );
}
